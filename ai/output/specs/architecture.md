# Scorestack — Architecture Specification (Growth)

## Stack (unchanged)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, React 18, Tailwind CSS |
| Backend | Next.js API Routes (Node.js runtime) |
| Database | PostgreSQL via Prisma ORM |
| File storage | Vercel Blob |
| AI / LLM | Anthropic SDK (Claude) |
| LinkedIn enrichment + delivery | ConnectSafely REST API (platform API key from env var; BYOK for delivery) |
| Email | Resend (magic-link auth + enrichment notifications only) |
| Payments | Lemon Squeezy (subscriptions + one-time credit packs; MoR, Uruguay-safe) |
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
│  ConnectSafely REST API — enrichment + messaging│
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

### Session gate model

Upload and enrichment are public. Auth-required pages apply a three-tier gate:

1. **No session** → sign-in redirect (or inline prompt for the results page)
2. **Session + `orgName === "My Workspace"`** → `WorkspaceNamePrompt` overlay rendered on the current page — no navigation
3. **Session + named workspace** → page renders normally

**Public routes (no session required):**
- `GET /` — homepage (upload + enrichment choice)
- `POST /api/upload` — CSV upload
- `POST /api/enrich` — enrichment run
- `GET /api/runs/:runId/status` — polling endpoint
- `POST /api/score` — apply scoring criteria
- `POST /api/suggest` — AI criteria suggestions
- `/auth/*`, `/api/auth/*` — auth flows
- `/api/health`, `/api/webhooks/*`

**Auth-required routes (all three gate tiers apply):**
- `/run/:runId/score` — criteria builder
- `/run/:runId/results` — ranked contact list (no-session shows inline prompt, not a redirect)
- `/onboarding` — workspace name setup (no-session redirects to sign-in; named-workspace redirects to `/`)
- `/settings/*` — account, billing, integrations, team
- `POST /api/models` — saving a scoring model
- `GET /api/models` — listing saved models
- `/api/billing/*` — checkout and portal
- `/api/org/*` — org management (includes `PATCH /api/org` for workspace name)
- `/api/messages/*` — AI message generation
- `/api/delivery/*` — delivery jobs
- `GET /api/runs/:runId/export` — CSV export

**Session shape** — JWT and session callbacks expose `orgName`:
```ts
// JWT callback: token.orgName = org?.name
// Session callback: session.user.orgName = token.orgName
```

### Notify-me flow (unauthenticated user)
1. User chooses "Notify me" in `EnrichmentChoice`, enters email → stored as `Run.notifyEmail`, passed in `POST /api/enrich` body
2. Enrichment completes → `sendEnrichmentComplete()` sends one CTA: **"Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:id/score`
3. User clicks link → `/auth/signin` → enters email → `SignInForm` wraps callbackUrl through `/auth/confirmed?next=/run/:id/score` → magic link sent → user clicks → session created → `/auth/confirmed` shows confirmation → auto-redirects to score page

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
  ├── get org from session (optional — anonymous runs allowed)
  │
  ├── Per-run hard cap (free plan / no session):
  │       If plan === 'free' or no session AND incomingCount > 50:
  │         return 402 { error: 'run_limit_exceeded', limit: 50 }
  │
  ├── Managed credits deduction (paid plans):
  │       If org.managedCreditsBalance < incomingCount:
  │         return 402 { error: 'insufficient_credits', balance: org.managedCreditsBalance }
  │       Decrement org.managedCreditsBalance by incomingCount atomically
  │
  └── Proceed with enrichment
        └── On completion: INSERT UsageLog { orgId, runId, contactsConsumed, enrichmentSource }
```

No reset date. The free plan enforces a per-run cap (50 contacts), not a monthly rolling window. Paid plans use a pre-purchased credit balance (`managedCreditsBalance`) topped up via Lemon Squeezy credit packs — it never auto-resets. `Subscription.currentPeriodEnd` is used only for renewal/billing logic, not quota.

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
| `subscription_cancelled` | Set `cancelAtPeriodEnd = true`; actual downgrade fires on `subscription_expired` |
| `subscription_expired` | Downgrade org to `free`, set `Subscription.status = 'expired'` |
| `subscription_payment_failed` | Set `Subscription.status = 'past_due'`; 3-day grace before downgrade |
| `order_created` | Credit pack purchase — add `credits` to `Organization.managedCreditsBalance`, create `CreditPurchase` row |

### Environment variables
```
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_STARTER_VARIANT_ID=      # $29/mo subscription variant
LEMONSQUEEZY_PRO_VARIANT_ID=          # $49/mo subscription variant

# Credit pack one-time product IDs (Lemon Squeezy product — not variant)
LEMONSQUEEZY_CREDITS_100_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_500_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_1500_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_5000_PRODUCT_ID=
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

### LinkedIn messaging (ConnectSafely)

ConnectSafely is a REST API accessed via plain `fetch` with `Authorization: Bearer CONNECT_SAFELY_API_KEY`. There is no SDK.

```
POST /api/delivery/jobs { run_id, contact_ids? }
  └── Auth + Pro gate check
  └── Fetches GeneratedMessage rows for run (deliveryStatus = 'pending'; optional contact_ids filter)
  └── Creates DeliveryJob row (status: scheduled)
  └── Links messages to job (deliveryJobId)
  └── Fire-and-forget processDeliveryJob(jobId, notifyEmail) — returns { job } immediately

processDeliveryJob(jobId, notifyEmail):
  └── Set DeliveryJob.status = 'running', startedAt
  └── For each GeneratedMessage (sequential):
        └── connectsafely.sendMessage({
              personUrl: runResult.linkedinUrl,
              text:      editedBody ?? body
            })
        └── On success: GeneratedMessage.sentAt = now(), deliveryStatus = 'sent', sentCount++
        └── On failure: deliveryStatus = 'failed', failedCount++
        └── Delay DELIVERY_DELAY_MS (default 3000ms)
  └── Set DeliveryJob.status = 'complete', completedAt
  └── sendDeliveryComplete(notifyEmail, jobId, sentCount, failedCount) — non-fatal
```

### Migration co-existence (Phase 9 transition)

During the staged migration, both LinkedAPI and ConnectSafely can be active simultaneously via feature flags:

- `CONNECT_SAFELY_DELIVERY_ENABLED=true` → delivery uses ConnectSafely; else LinkedAPI (legacy fallback)
- `CONNECT_SAFELY_ENRICHMENT_ENABLED=true` → enrichment uses ConnectSafely; else LinkedAPI (legacy fallback)

Once both flags are stable in production, LinkedAPI is removed entirely (Stage 9c).

### Test mode

When `LINKED_API_TEST_DELIVERY=true`, all messages are redirected to `LINKED_API_TEST_DELIVERY_PROFILE` with body `"test delivery for {actualRecipientUrl}"`. This flag works with both ConnectSafely and the LinkedAPI fallback. Notifications fire normally.

### Live progress (client)

`GET /api/delivery/jobs/[jobId]/messages` returns per-message status, body, sentAt, and contact URL ordered by `runResult.rowIndex`. The delivery page polls this endpoint every **3 seconds** for running jobs, showing:
- Pulsing dot on the first `pending` message (currently sending)
- Green check + sentAt timestamp for sent messages
- Red × for failed messages

Job-level counts (`sentCount`, `failedCount`, status) are polled every **10 seconds** from `GET /api/delivery/jobs`.

### Scheduling

Only "Send now" is implemented. `scheduledAt` is never written. A "Schedule for later" UI teaser exists in `DeliverySchedulerModal` (coming-soon, non-interactive).

**Notes:**
- `CONNECT_SAFELY_API_KEY` is the single credential for both enrichment and delivery (platform-managed)
- Delivery is serialised (one message at a time) to respect LinkedIn rate limits
- `DeliveryJob.channel` field is retained in the schema for future email channel addition; only `linkedin` is implemented in v1
- `OrgIntegration` model exists in schema for future BYOK credential support; unused in v1

---

## Team Architecture

- All data (Runs, ScoringModels, MessageTemplates, DeliveryJobs) is scoped to `orgId`
- `User.role`: `admin` | `member`
  - `admin`: can invite/remove members, delete any model, manage billing
  - `member`: can create runs, save models, cannot delete others' models, cannot manage billing
- Invite flow: `POST /api/org/invite` → sends magic-link email with `inviteToken` → on sign-in, token resolves to `orgId`

---

## Database Migrations

### Production strategy

All DB schema changes use **`prisma migrate deploy`** — the only command in the Vercel build:

```
npx prisma generate && npx prisma migrate deploy && npm run build
```

- Applies only committed migrations from `prisma/migrations/` in order
- Skips already-applied migrations (idempotent)
- Never drops data implicitly — all destructive operations must be explicit in a migration file
- Fails fast on conflict rather than silently proceeding

Vercel applies migrations before swapping traffic, so the old code is still live during the migration window. Every migration must be backward-compatible with the previous deployment.

### `package.json` scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `db:migrate` | `prisma migrate deploy` | Apply pending migrations (production / CI) |
| `db:migrate:dev` | `prisma migrate dev` | Create and apply a new migration locally |
| `db:status` | `prisma migrate status` | Show which migrations are pending or failed |
| `db:resolve:applied` | `prisma migrate resolve --applied <name>` | Mark a migration as already applied (e.g. after a manual schema fix) |
| `db:resolve:rolled-back` | `prisma migrate resolve --rolled-back <name>` | Mark a failed migration as not applied so the next deploy can retry |

### No-downtime migration rules

| Change | Safe? | Notes |
|--------|-------|-------|
| Add nullable column | ✅ | Old code ignores unknown columns |
| Add new table | ✅ | Old code never references it |
| Add index | ✅ | Use `CREATE INDEX CONCURRENTLY` for large tables |
| Rename column | ⚠️ | Two-step: add new → deploy → backfill → drop old |
| Drop column still used by current code | ❌ | Remove from code first, deploy, then drop |
| Change column type without compatible cast | ❌ | Two-step with a temporary column |

**Never use `prisma db push` in production.** It bypasses the migration history, silently drops objects, and leaves the DB in a state that `migrate deploy` cannot reconcile.

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

CONNECT_SAFELY_API_KEY=             # ConnectSafely REST API key (enrichment + messaging)
# Migration flags (Phase 9 transition — remove once both are stable in production)
CONNECT_SAFELY_DELIVERY_ENABLED=    # true = use ConnectSafely for delivery (false = LinkedAPI fallback)
CONNECT_SAFELY_ENRICHMENT_ENABLED=  # true = use ConnectSafely for enrichment (false = LinkedAPI fallback)
```
