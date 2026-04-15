# Scorestack — Build Tasks (feat/07-paid-features)

**Phase:** EXECUTION  
**Command:** BUILD::IMPLEMENT  
**Source specs:** `/ai/output/specs/`  
**Total tasks:** 49 across 10 phases

Phases must be executed in order. Each phase's output is a hard dependency for the next.

---

## Phase 1 — Foundation: Dependencies + Schema
**Goal:** All new models in the database; NextAuth wired up; app boots with auth.

- [x] **T-01** Install dependencies
  ```
  npm install next-auth@beta @auth/prisma-adapter resend
  ```
  Note: `@lemonsqueezy/lemonsqueezy-js` does not exist on npm. Phase 3 billing will use the Lemon Squeezy REST API directly via `fetch` — no SDK needed.

- [x] **T-02** Extend `prisma/schema.prisma`
  - Add models: `User`, `Account`, `Session`, `VerificationToken` (NextAuth adapter)
  - Add models: `Organization`, `Subscription`, `UsageLog`, `EnrichmentNotification`
  - Add models: `MessageTemplate`, `GeneratedMessage`, `DeliveryJob`
  - Modify `Run`: add `userId String?`, `orgId String?`, `notifyEmail String?`
  - Modify `ScoringModel`: add `orgId String?`
  - Add enums: `Plan`, `UserRole`, `SubscriptionStatus`, `DeliveryStatus`, `DeliveryChannel`, `JobStatus`

- [ ] **T-03** Run migration — **blocked: requires `DATABASE_URL` in `.env.local`**
  ```
  # 1. Create .env.local at project root:
  # DATABASE_URL=postgresql://user:password@host:5432/dbname
  # NEXTAUTH_SECRET=<random 32-byte string>
  # NEXTAUTH_URL=http://localhost:3000
  # RESEND_API_KEY=<your key>
  # RESEND_FROM_EMAIL=noreply@yourdomain.com

  # 2. Then run:
  npx prisma migrate dev --name growth-schema
  ```
  Note: Prisma 7 removed `url` from schema.prisma datasource. URL lives in `prisma.config.ts` only, loaded from env at migration time.

- [x] **T-04** Create `app/lib/auth.ts`
  - `PrismaAdapter` + `EmailProvider` (via Resend)
  - `callbacks.session`: attach `userId`, `orgId`, `role` to session
  - `callbacks.signIn`: if `User.orgId` null → create default `Organization` (plan: `free`), set `User.orgId`
  - Export `{ handlers, auth, signIn, signOut }`

- [x] **T-05** Create `app/api/auth/[...nextauth]/route.ts`
  - Re-export `{ GET, POST }` from `app/lib/auth.ts`

- [x] **T-06** Create `middleware.ts` (project root)
  - NextAuth `auth` middleware
  - Public: `/`, `/auth/*`, `/api/auth/*`, `/api/health`, `/api/webhooks/*`
  - Protected: all other routes → redirect `/auth/signin` or 401 for API routes

---

## Phase 2 — Auth UI + Onboarding
**Goal:** Users can sign in and complete first-time org setup.

- [ ] **T-07** Create `app/auth/signin/page.tsx`
  - Email input → `signIn('email', { email })`
  - States: default / submitting / sent
  - Post-sign-in redirect: `/onboarding` if `orgId` null, else `/`

- [ ] **T-08** Create `app/onboarding/page.tsx`
  - Step 1: org name → `PATCH /api/org`
  - Step 2: optional invite (locked on Free)
  - Complete → redirect `/`

- [ ] **T-09** Create `app/api/org/route.ts`
  - `PATCH { name }` → update `Organization.name` for session org

- [ ] **T-10** Update `app/layout.tsx` / create `app/components/Nav.tsx`
  - Authenticated: user avatar dropdown (sign out, settings), render `<UsageBanner />`
  - Unauthenticated: sign-in link

---

## Phase 3 — Billing (Lemon Squeezy)
**Goal:** Users can upgrade plans; webhooks keep org plan in sync.

- [ ] **T-11** Create `app/lib/billing.ts`
  - `createCheckout(orgId, plan)` → LS Checkout API → `checkout_url`
  - `createPortalUrl(lsCustomerId)` → LS portal URL
  - `getPlanFromVariantId(variantId)` → `Plan` enum
  - Env vars: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_STARTER_VARIANT_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`

- [ ] **T-12** Create `app/api/billing/checkout/route.ts`
  - `POST { plan }` → auth → `createCheckout` → `{ checkout_url }`

- [ ] **T-13** Create `app/api/billing/portal/route.ts`
  - `POST` → auth → `createPortalUrl` → `{ portal_url }`

- [ ] **T-14** Create `app/api/webhooks/lemonsqueezy/route.ts`
  - Verify `X-Signature` (HMAC-SHA256, `LEMONSQUEEZY_WEBHOOK_SECRET`)
  - `subscription_created` → upsert `Organization.plan` + `lsCustomerId`, create `Subscription`, reset usage
  - `subscription_updated` → update `Subscription` + `Organization.plan`
  - `subscription_cancelled` → set `cancelAtPeriodEnd = true`
  - `subscription_expired` → downgrade org to `free`
  - `subscription_payment_failed` → set `status = 'past_due'`

- [ ] **T-15** Create `app/settings/billing/page.tsx`
  - Fetch `/api/usage` → show plan, renewal date, usage bar
  - Upgrade CTA → `POST /api/billing/checkout` → redirect
  - Manage invoices → `POST /api/billing/portal` → redirect
  - `?success=1` param → success banner

- [ ] **T-16** Create `app/components/UpgradeModal.tsx`
  - Props: `trigger: string`, `requiredPlan: Plan`
  - Plan comparison table (Free / Starter / Pro)
  - CTA → `POST /api/billing/checkout` → full-page redirect
  - Dismiss link

---

## Phase 4 — Quota + Usage
**Goal:** Free-tier limits enforced at enrich time; usage visible in UI.

- [ ] **T-17** Create `app/lib/quota.ts`
  - `PLAN_LIMITS`: `{ free: 50, starter: 500, pro: 2000, enterprise: -1 }`
  - `checkQuota(orgId, incomingCount)` → `{ allowed, used, limit, plan }`
  - `recordUsage(orgId, runId, count)` → insert `UsageLog`

- [ ] **T-18** Update `app/api/enrich/route.ts`
  - Start: `checkQuota(orgId, csvRowCount)` → 402 if exceeded
  - Complete: `recordUsage(orgId, runId, enrichedCount)`
  - 402 body: `{ error: 'quota_exceeded', used, limit, plan, upgrade_url }`

- [ ] **T-19** Create `app/api/usage/route.ts`
  - `GET` → `{ plan, contactsUsed, contactsLimit, resetDate, modelsUsed, modelsLimit, seats, seatsLimit }`

- [ ] **T-20** Create `app/components/UsageBanner.tsx`
  - Fetch `/api/usage`
  - Progress bar: green <70% / amber 70–90% / red >90%
  - Upgrade link → `<UpgradeModal />`
  - Hidden if `plan === 'enterprise'` or limit is `-1`

---

## Phase 5 — Deferred Enrichment
**Goal:** Users can navigate away during enrichment and return or be notified when done.

- [ ] **T-21** Create `app/lib/notify.ts`
  - `sendEnrichmentComplete(email, runId)` → Resend email
  - Subject: "Your Scorestack run is ready"
  - Body: link to `/run/:runId/score`

- [ ] **T-22** Update `app/api/enrich/route.ts` (deferred path)
  - Accept `notify_email` in request body
  - Store in `Run.notifyEmail` at run creation
  - On completion: if `notifyEmail` set and `EnrichmentNotification.sentAt` null → `sendEnrichmentComplete()`, set `sentAt`

- [ ] **T-23** Create `app/api/runs/[runId]/status/route.ts`
  - `GET` → `{ status, enrichedCount, failedCount, totalContacts, completedAt }`
  - No auth required

- [ ] **T-24** Update `app/components/EnrichmentProgress.tsx`
  - After upload confirmed: show "Wait here" / "Notify me" choice
  - "Notify me": email input (pre-filled from session) → pass `notify_email` to enrich request → confirmation banner → unblock navigation

- [ ] **T-25** Update `app/run/[runId]/score/page.tsx`
  - If `status === 'enriching'` on load: show spinner, poll `/api/runs/:runId/status` every 5s
  - On `status === 'complete'`: render criteria builder
  - On `status === 'failed'`: show error state

---

## Phase 6 — CSV Export
**Goal:** Paid users can download full scored results as CSV.

- [ ] **T-26** Create `app/lib/export.ts`
  - `buildExportCsv(runId, plan, topN?)` → CSV string
  - Columns: `rank`, `linkedin_url`, `total_score`, per-criterion scores, all enriched fields
  - Free: top 10 + `note` watermark column
  - Paid: all rows, no watermark

- [ ] **T-27** Create `app/api/runs/[runId]/export/route.ts`
  - `GET` → auth → verify run complete + belongs to org → `buildExportCsv` → `text/csv` stream
  - `Content-Disposition: attachment; filename="scorestack-{runId}-{date}.csv"`
  - Optional `?topN=N`

- [ ] **T-28** Create `app/components/ExportButton.tsx`
  - Free: lock icon → `<UpgradeModal trigger="Export your full results" requiredPlan="starter" />`
  - Paid: download → `GET /api/runs/:runId/export`
  - Dropdown: Top 50 / Top 100 / All (when > 100 results)

- [ ] **T-29** Update `app/run/[runId]/results/page.tsx`
  - Add `<ExportButton runId={runId} plan={plan} />` to top-right of results section

---

## Phase 7 — AI Message Generation
**Goal:** Paid users can generate personalised LinkedIn messages per contact.

- [ ] **T-30** Create `app/api/messages/templates/route.ts`
  - `GET` → list `MessageTemplate` for org
  - `POST { name, tone, goal, systemPrompt }` → create

  Create `app/api/messages/templates/[templateId]/route.ts`
  - `PUT` → update
  - `DELETE` → delete

- [ ] **T-31** Create `app/lib/messages.ts`
  - `generateMessages(runId, templateId, contactIds?)`:
    - Fetch `RunResult` rows + `MessageTemplate`
    - Batch Anthropic calls, 20 concurrent, with prompt caching on system prompt
    - Model: `claude-haiku-4-5-20251001`
    - System: `template.systemPrompt` (cached)
    - User: `enrichedData` JSON + matched `criterionScores` JSON
    - Parse `{ body }` from response
    - Upsert `GeneratedMessage` rows

- [ ] **T-32** Create `app/api/messages/generate/route.ts`
  - `POST { run_id, template_id, top_n?, contact_ids? }` → plan gate (Starter+) → `generateMessages()` → `{ generated, messages }`
  - Starter cap: 100 messages/run

- [ ] **T-33** Create `app/components/MessageTemplateModal.tsx`
  - Fields: name, tone (dropdown), goal (text), system prompt (Pro+ only)
  - Save → `POST /api/messages/templates`

- [ ] **T-34** Create `app/components/MessagesTab.tsx`
  - State A: template selector + generate button (locked on Free)
  - State B: table with preview, View/Edit expander, Regenerate per row
  - Inline edit → `PATCH /api/messages/:id`
  - "Schedule delivery" → `<DeliverySchedulerModal />`

- [ ] **T-35** Create `app/api/messages/[messageId]/route.ts`
  - `PATCH { editedBody }` → update `GeneratedMessage.editedBody`

- [ ] **T-36** Update `app/run/[runId]/results/page.tsx`
  - Add tab bar: "Scores" | "Messages"
  - Render `<MessagesTab runId={runId} plan={plan} />` in Messages tab

---

## Phase 8 — LinkedIn Delivery
**Goal:** Pro users can send generated messages via LinkedAPI.

- [ ] **T-37** Create `app/lib/delivery.ts`
  - `processDeliveryJob(jobId)`:
    - Fetch job + messages, set `status = 'running'`
    - Per message: `client.sendMessage.execute({ recipientUrl, message })` → poll `result`
    - On success: `sentAt`, `deliveryStatus = 'sent'`, `sentCount++`
    - On failure: `deliveryStatus = 'failed'`, `failedCount++`, continue
    - Delay `DELIVERY_DELAY_MS` (default 3000ms) between sends
    - On done: `status = 'complete'`, `completedAt`
  - ⚠️ Confirm `client.sendMessage` method exists in SDK before implementing; fall back to LinkedAPI REST API if not

- [ ] **T-38** Create `app/api/delivery/jobs/route.ts`
  - `GET` → plan gate (Pro+) → list jobs for org (filter `runId`, `status`)
  - `POST { run_id, scheduled_at?, contact_ids? }` → plan gate → create job, link messages → process immediately if `scheduledAt` null

  Create `app/api/delivery/jobs/[jobId]/route.ts`
  - `GET` → job with counts
  - `DELETE` → cancel if `status === 'scheduled'`

- [ ] **T-39** Create `app/components/DeliverySchedulerModal.tsx`
  - Contact count display
  - Send now vs datetime picker
  - No credential input (LinkedAPI keys from server env)
  - Submit → `POST /api/delivery/jobs` → confirmation + link to `/delivery`

- [ ] **T-40** Create `app/delivery/page.tsx`
  - Table: run name, channel, status badge, sent/failed, timestamps, actions
  - Cancel button → confirm → `DELETE /api/delivery/jobs/:id`
  - Poll running jobs every 10s

---

## Phase 9 — Team Management
**Goal:** Pro orgs can invite teammates; all data scoped to org.

- [ ] **T-41** Create `app/api/org/members/route.ts`
  - `GET` → list `User` for org (id, name, email, role)

  Create `app/api/org/members/[userId]/route.ts`
  - `DELETE` → admin only → set `User.orgId = null`

- [ ] **T-42** Create `app/api/org/invite/route.ts`
  - `POST { email, role }` → admin + Pro+ gate → seat limit check (409 if exceeded)
  - Create `VerificationToken` with `identifier = invite:{orgId}:{email}`
  - Send invite email via Resend
  - Return `{ invited: true }`

- [ ] **T-43** Update `app/lib/auth.ts` — invite acceptance
  - In `callbacks.signIn`: check for `VerificationToken` with `identifier = invite:*:{email}`
  - If found: set `User.orgId`, `User.role` from token → delete token

- [ ] **T-44** Create `app/settings/team/page.tsx`
  - Members list with role badge, remove button (admin only)
  - Seat counter "X / Y seats used"
  - Invite form (email + role) — locked on Free/Starter with `<UpgradeModal />`

---

## Phase 10 — Gates, Limits, Polish
**Goal:** All limits enforced; all queries org-scoped.

- [ ] **T-45** Update `app/api/models/route.ts`
  - `POST`: count org models → 409 if at plan limit

- [ ] **T-46** Update `app/components/SaveModelButton.tsx`
  - On 409: open `<UpgradeModal trigger="You've reached your model limit" requiredPlan="starter" />`

- [ ] **T-47** Update upload/enrich UI
  - On 402 from `/api/enrich`: open `<UpgradeModal trigger="You've reached your contact limit" requiredPlan="starter" />`

- [ ] **T-48** Scope existing queries to `orgId`
  - `app/api/models/route.ts` — filter by `orgId`
  - `app/api/score/route.ts` — verify run belongs to org
  - `app/api/suggest/route.ts` — verify run belongs to org
  - `app/api/enrich/route.ts` — attach `userId` + `orgId` to run on creation

- [ ] **T-49** Verify billing success redirect
  - Confirm `/settings/billing?success=1` optimistic plan display resolves correctly after LS webhook fires

---

## New files summary

| File | Phase |
|------|-------|
| `app/lib/auth.ts` | 1 |
| `app/api/auth/[...nextauth]/route.ts` | 1 |
| `middleware.ts` | 1 |
| `app/auth/signin/page.tsx` | 2 |
| `app/onboarding/page.tsx` | 2 |
| `app/api/org/route.ts` | 2 |
| `app/components/Nav.tsx` | 2 |
| `app/lib/billing.ts` | 3 |
| `app/api/billing/checkout/route.ts` | 3 |
| `app/api/billing/portal/route.ts` | 3 |
| `app/api/webhooks/lemonsqueezy/route.ts` | 3 |
| `app/settings/billing/page.tsx` | 3 |
| `app/components/UpgradeModal.tsx` | 3 |
| `app/lib/quota.ts` | 4 |
| `app/api/usage/route.ts` | 4 |
| `app/components/UsageBanner.tsx` | 4 |
| `app/lib/notify.ts` | 5 |
| `app/api/runs/[runId]/status/route.ts` | 5 |
| `app/lib/export.ts` | 6 |
| `app/api/runs/[runId]/export/route.ts` | 6 |
| `app/components/ExportButton.tsx` | 6 |
| `app/api/messages/templates/route.ts` | 7 |
| `app/api/messages/templates/[templateId]/route.ts` | 7 |
| `app/lib/messages.ts` | 7 |
| `app/api/messages/generate/route.ts` | 7 |
| `app/components/MessageTemplateModal.tsx` | 7 |
| `app/components/MessagesTab.tsx` | 7 |
| `app/api/messages/[messageId]/route.ts` | 7 |
| `app/lib/delivery.ts` | 8 |
| `app/api/delivery/jobs/route.ts` | 8 |
| `app/api/delivery/jobs/[jobId]/route.ts` | 8 |
| `app/components/DeliverySchedulerModal.tsx` | 8 |
| `app/delivery/page.tsx` | 8 |
| `app/api/org/members/route.ts` | 9 |
| `app/api/org/members/[userId]/route.ts` | 9 |
| `app/api/org/invite/route.ts` | 9 |
| `app/settings/team/page.tsx` | 9 |

## Modified files summary

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | 1 | Add all new models + enums |
| `app/layout.tsx` | 2 | Add Nav + UsageBanner |
| `app/api/enrich/route.ts` | 4, 5 | Quota check + deferred notify |
| `app/components/EnrichmentProgress.tsx` | 5 | Two-path UX |
| `app/run/[runId]/score/page.tsx` | 5 | Polling fallback |
| `app/run/[runId]/results/page.tsx` | 6, 7 | Export button + Messages tab |
| `app/api/models/route.ts` | 9, 10 | orgId scope + limit check |
| `app/api/score/route.ts` | 10 | orgId scope |
| `app/api/suggest/route.ts` | 10 | orgId scope |
| `app/components/SaveModelButton.tsx` | 10 | Model limit gate |
| `app/lib/auth.ts` | 9 | Invite acceptance callback |

## New environment variables

```
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://app.scorestack.io

RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@scorestack.io

LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_STARTER_VARIANT_ID=
LEMONSQUEEZY_PRO_VARIANT_ID=

DELIVERY_DELAY_MS=3000
```
