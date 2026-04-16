# Scorestack — Architecture Specification (Growth)

## Stack (unchanged)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, React 18, Tailwind CSS |
| Backend | Next.js API Routes (Node.js runtime) |
| Database | PostgreSQL via Prisma ORM |
| File storage | Vercel Blob |
| AI / LLM | Anthropic SDK (Claude) |
| LinkedIn enrichment | @linkedapi/node SDK (platform credentials from env vars — no user setup required) |
| Email | Resend (magic-link auth + enrichment notifications only) |
| Payments | Lemon Squeezy (subscriptions + one-time credit packs; MoR, Uruguay-safe) |
| LinkedIn delivery | @linkedapi/node SDK (BYOK — user's own LinkedAPI credentials stored encrypted per org) |
| Deployment | Vercel |

---

## System Layers

```
┌─────────────────────────────────────────────────┐
│                  Browser (Next.js)               │
│  Auth pages · Home · Enrichment · Score · Results│
│  Settings (Billing / Team) · Delivery status     │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────┐
│            Next.js API Routes (Vercel)           │
│                                                  │
│  /api/auth/[...nextauth]  ← NextAuth.js          │
│  /api/upload              ← CSV ingest           │
│  /api/enrich              ← SSE stream + async   │
│  /api/runs/:id/status     ← polling fallback     │
│  /api/runs/:id/export     ← CSV download         │
│  /api/score               ← scoring engine       │
│  /api/suggest             ← AI criteria          │
│  /api/messages/*          ← AI message gen       │
│  /api/delivery/*          ← delivery jobs        │
│  /api/billing/*           ← Lemon Squeezy checkout │
│  /api/webhooks/lemonsqueezy ← LS events          │
│  /api/org/*               ← team management      │
│  /api/usage               ← quota status         │
│  /api/models              ← scoring models       │
└──────┬──────────────┬──────────────┬─────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌────▼────────┐
│ PostgreSQL  │ │Vercel Blob│ │ Anthropic   │
│ (Prisma)    │ │  (CSVs)   │ │    API      │
└─────────────┘ └───────────┘ └─────────────┘
       │
┌──────▼──────────────────────────────────┐
│  External services (called from API)   │
│  @linkedapi/node  — enrichment + messaging      │
│  Resend           — auth + notifications email  │
│  Lemon Squeezy    — billing (MoR, Uruguay-safe) │
└─────────────────────────────────────────┘
```

---

## Auth Architecture (NextAuth.js)

### Provider
- **Email (magic-link)** via Resend — user enters email, receives one-time link, session created on click
- No OAuth providers in v1 (extensible to Google/GitHub later)

### Session strategy
- **Database sessions** stored in `Session` table (Prisma adapter)
- JWT fallback disabled — sessions are server-authoritative
- Session cookie: `HttpOnly`, `SameSite=Lax`, 30-day expiry

### Anonymous-first model
The core scoring pipeline (upload → enrich → score → view results) is fully accessible without authentication. Auth is only required for persistent/paid features.

**Public routes (no session required):**
- `GET /` — homepage
- `POST /api/upload` — CSV upload
- `POST /api/enrich` — enrichment run
- `GET /api/runs/:runId/status` — polling endpoint
- `POST /api/score` — apply scoring criteria
- `POST /api/suggest` — AI criteria suggestions
- `/run/:runId/*` — view run results
- `/auth/*`, `/api/auth/*` — auth flows
- `/api/health`, `/api/webhooks/*`

**Auth-required routes (session must be present):**
- `/settings/*` — account, billing, integrations, team
- `POST /api/models` — saving a scoring model
- `GET /api/models` — listing saved models (returns empty for anonymous)
- `/api/billing/*` — checkout and portal
- `/api/org/*` — team management
- `/api/messages/*` — AI message generation
- `/api/delivery/*` — delivery jobs
- `GET /api/runs/:runId/export` — CSV export

### Email capture (soft gate, not auth)
A lightweight email capture step occurs at two points in the anonymous flow:
1. **Results gate** — before `/run/:runId/score` is rendered, the client checks `Run.notifyEmail`. If null, shows an inline form: "Enter your email to see your results." Email is stored via `PATCH /api/runs/:runId/email` and results are revealed immediately (no verification required).
2. **Defer enrichment** — when the user selects "Notify me", they provide an email that is stored in `Run.notifyEmail` at enrich time.

If the user has an active session, their email is pre-filled and the gate is skipped.

### Middleware protection
- `middleware.ts` only protects auth-required routes (listed above)
- Core pipeline routes are always public
- API routes that need auth use `auth()` from `next-auth` server-side and return `401` if missing

### Org bootstrapping
- On first sign-in, a `User` row is created by NextAuth's Prisma adapter
- A post-sign-in callback creates a default `Organization` for the user (plan: `free`, `role: admin`)
- Subsequent invites link new users to an existing `orgId`
- Anonymous runs (`Run.userId = null`, `Run.orgId = null`) are not associated with any org until sign-in

---

## Deferred Enrichment Architecture

### Problem
LinkedIn enrichment of 500–2,000 contacts can take minutes. Forcing users to keep the browser open creates drop-off and poor UX.

### Solution — two-path UX

```
User uploads CSV
      │
      ▼
  POST /api/enrich called
      │
      ├── User chooses "Wait here"
      │       └── SSE stream open (existing behaviour)
      │           └── Redirect to /run/:id/score on complete
      │
      └── User chooses "Notify me"
              └── Provides email → stored in Run.notifyEmail
              └── Navigation allowed immediately
              └── Server continues enrichment in background
              └── On completion: POST to /api/internal/notify-enrichment
                      └── Resend sends email with link to /run/:id/score
```

### Polling fallback
- `GET /api/runs/:runId/status` returns `{ status, enrichedCount, failedCount, totalContacts }`
- If a user returns to the app and navigates to `/run/:id`, the page polls this endpoint every 5 seconds if `status === 'enriching'`
- When `status === 'complete'`, page redirects to `/run/:id/score`

### Background execution
- Vercel serverless functions time out after 300s (hobby) / 900s (pro) — sufficient for most runs
- For large Enterprise runs (>2,000 contacts): enqueue via Vercel Cron or a dedicated background route with a queue table (`EnrichmentJob`) — deferred to Enterprise tier spec

---

## Quota Middleware

```
POST /api/enrich
  │
  ├── getServerSession() → userId, orgId
  ├── fetch Organization.plan → limit
  ├── count incoming contacts from CSV
  ├── fetch UsageLog.sum(contactsConsumed) for current billing period
  │
  ├── if (used + incoming) > limit
  │       └── return 402 { error: 'quota_exceeded', used, limit, plan }
  │
  └── proceed with enrichment
        └── on completion: insert UsageLog row
```

Quota resets monthly, aligned to `Organization.resetDate` (set to first-enrichment date of billing period).

---

## Billing Architecture (Lemon Squeezy)

### Why Lemon Squeezy
- **Merchant of Record** — Lemon Squeezy collects payment from customers and remits to the seller, handling all global VAT/tax compliance automatically
- **Uruguay-compatible** — confirmed working with a Uruguayan business bank account; no US entity required
- **Fast setup** — account approved quickly; payouts available via PayPal, Wise, or direct bank transfer
- **Hosted checkout** — no PCI scope; LS hosts the payment page

### Migration note (v3)
Lemon Squeezy is the billing layer for v1 and v2. A migration to a more scalable processor (Stripe or Paddle) is planned for v3, driven by enterprise feature needs (metered billing, volume discounts, invoicing). The abstraction in `app/lib/billing.ts` should be kept thin to make this swap straightforward.

### Checkout flow
1. `POST /api/billing/checkout` → calls Lemon Squeezy API to create a checkout URL with `custom_data.orgId`
2. User completes payment on Lemon Squeezy hosted page
3. LS fires `subscription_created` webhook
4. `POST /api/webhooks/lemonsqueezy` handler verifies signature, updates `Organization.plan` + creates `Subscription` row

### Portal flow
- `POST /api/billing/portal` → creates Lemon Squeezy Customer Portal URL
- User manages payment method, upgrades, downgrades, cancellations via LS-hosted portal

### Webhook events handled
| Event | Action |
|-------|--------|
| `subscription_created` | Set org plan, create Subscription row |
| `subscription_updated` | Update plan, status, renewal date |
| `subscription_cancelled` | Downgrade org to `free` at period end |
| `subscription_payment_failed` | Flag org for grace period |

### Environment variables
```
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_STARTER_VARIANT_ID=
LEMONSQUEEZY_PRO_VARIANT_ID=
```

---

## Message Generation Architecture

```
POST /api/messages/generate
  │
  ├── Auth + Pro/Starter gate check
  ├── Fetch RunResult rows (filtered by runId, optional: top N by score)
  ├── Fetch MessageTemplate (tone, goal, systemPrompt)
  │
  └── For each contact (batched, max 20 concurrent):
        └── Anthropic API call with prompt caching:
              system: MessageTemplate.systemPrompt
              user:   LinkedInProfile JSON + CriterionScores JSON
        └── Store GeneratedMessage row
  │
  └── Return { messages: GeneratedMessage[] }
```

Prompt caching: system prompt is cached per template — only the per-contact user content changes. Reduces cost by ~80% for large batches.

---

## Delivery Architecture

### LinkedIn messaging (LinkedAPI)

LinkedAPI uses the same async workflow pattern as profile enrichment (`execute` → poll `result`).

```
POST /api/delivery/jobs { runId, scheduledAt? }
  └── Auth + Pro gate check
  └── Creates DeliveryJob row (status: scheduled)

Process DeliveryJob (immediate or at scheduledAt):
  └── For each GeneratedMessage in job:
        └── client.sendMessage.execute({
              recipientUrl: runResult.linkedinUrl,
              message:      generatedMessage.editedBody ?? generatedMessage.body
            })
        └── workflowId stored; poll client.sendMessage.result(workflowId)
        └── On success: GeneratedMessage.sentAt = now(), deliveryStatus = 'sent'
        └── On failure: deliveryStatus = 'failed', increment DeliveryJob.failedCount
  └── Update DeliveryJob.status = 'complete', completedAt
```

**Notes:**
- LinkedAPI credentials (`LINKED_API_TOKEN`, `LINKED_API_ID_TOKEN`) are reused from enrichment — no additional credentials required from the user
- LinkedIn has rate limits on messages; delivery is serialised (one at a time per credential set) with a configurable delay between sends (default 3s)
- `DeliveryJob.channel` field is retained in the schema for future email channel addition but only `linkedin` is implemented in v1

---

## Team Architecture

- All data (Runs, ScoringModels, MessageTemplates, DeliveryJobs) is scoped to `orgId`
- `User.role`: `admin` | `member`
  - `admin`: can invite/remove members, delete any model, manage billing
  - `member`: can create runs, save models, cannot delete others' models, cannot manage billing
- Invite flow: `POST /api/org/invite` → sends magic-link email with `inviteToken` → on sign-in, token resolves to `orgId`

---

## Environment Variables (additions)

```
NEXTAUTH_SECRET=                    # random 32-byte secret
NEXTAUTH_URL=https://app.scorestack.io

RESEND_API_KEY=                     # used for auth magic-links + enrichment notifications only
RESEND_FROM_EMAIL=noreply@scorestack.io

LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_STARTER_VARIANT_ID=
LEMONSQUEEZY_PRO_VARIANT_ID=

# LinkedAPI keys already in env (reused for delivery — no new vars needed)
# LINKED_API_TOKEN and LINKED_API_ID_TOKEN cover both enrichment + messaging
```
