# Scorestack — Build Tasks (feat/07-paid-features)

**Phase:** EXECUTION  
**Command:** BUILD::IMPLEMENT  
**Source specs:** `/ai/output/specs/`
**Last replanned:** PLAN::ARCHITECTURE Phase 04 — seat limits deferred to Phase 9 (T-44b); T-47 moved from Phase 10 → Phase 4; Phase 5 audited (T-21/T-22/T-24 already complete)  
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

- [x] **T-11** Create `app/lib/billing.ts`
  - `createCheckout(orgId, plan)` → LS Checkout API → `checkout_url`
  - `createCreditCheckout(orgId, packId)` → LS one-time product checkout → `checkout_url`
    - `packId`: one of `'credits_100' | 'credits_500' | 'credits_1500' | 'credits_5000'`
    - Maps to `LEMONSQUEEZY_CREDITS_{N}_PRODUCT_ID` env var
    - `custom_data`: `{ orgId, credits: N }` — echoed back in `order_created` webhook
  - `createPortalUrl(lsCustomerId)` → LS portal URL
  - `getPlanFromVariantId(variantId)` → `Plan` enum
    - Compare against `LEMONSQUEEZY_STARTER_VARIANT_ID` → `'starter'`; `LEMONSQUEEZY_PRO_VARIANT_ID` → `'pro'`; else → `null`
  - Env vars: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_STARTER_VARIANT_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_CREDITS_{100|500|1500|5000}_PRODUCT_ID`

- [x] **T-12** Create `app/api/billing/checkout/route.ts`
  - `POST { plan }` → auth → `createCheckout` → `{ checkout_url }`

- [x] **T-13** Create `app/api/billing/portal/route.ts`
  - `POST` → auth → `createPortalUrl` → `{ portal_url }`

- [x] **T-14** Create `app/api/webhooks/lemonsqueezy/route.ts`
  - Verify `X-Signature` (HMAC-SHA256, `LEMONSQUEEZY_WEBHOOK_SECRET`)
  - Must use raw body for signature verification — do NOT call `req.json()` before hashing
  - `subscription_created` → upsert `Organization.plan` + `lsCustomerId`, create `Subscription`, reset usage
  - `subscription_updated` → update `Subscription` + `Organization.plan`
  - `subscription_cancelled` → set `cancelAtPeriodEnd = true`
  - `subscription_expired` → set `Organization.plan = 'free'`, update `Subscription.status = 'expired'`
  - `subscription_payment_failed` → set `status = 'past_due'` (3-day grace — do NOT immediately downgrade)
  - `order_created` → credit pack purchase handler:
    - `credits = meta.custom_data.credits` (integer)
    - `orgId  = meta.custom_data.orgId`
    - `lsOrderId = data.id`
    - `INSERT CreditPurchase { orgId, lsOrderId, credits, amountCents: data.attributes.total }`
    - `UPDATE Organization SET managedCreditsBalance += credits` (atomic — use Prisma `increment`)
    - Idempotent: skip if `CreditPurchase` with `lsOrderId` already exists

- [x] **T-14b** Create `app/api/billing/credits/route.ts`
  - `POST { packId }` → auth → `createCreditCheckout(orgId, packId)` → `{ checkout_url }`
  - Valid `packId` values: `'credits_100' | 'credits_500' | 'credits_1500' | 'credits_5000'`
  - 400 on invalid `packId`; 401 if not authenticated; 503 if `orgId` missing

- [x] **T-15** Create `app/settings/billing/page.tsx`
  - Fetch `/api/usage` → show plan, renewal date, credit balance bar
  - **Free:** "50 contacts per run" info block + "Upgrade to Starter" CTA
  - **Starter / Pro:** Credit balance bar (thresholds: green >200, amber 51–200, red ≤50) + "Buy more credits" button → `POST /api/billing/credits` → redirect to LS checkout
  - Subscription status badge (active / trialing / past_due); renewal date from `Subscription.currentPeriodEnd`
  - Upgrade / change plan CTA → `POST /api/billing/checkout` → redirect to Lemon Squeezy hosted checkout
  - Manage invoices → `POST /api/billing/portal` → redirect to Lemon Squeezy Customer Portal
  - `?success=1` param → green success banner "You're now on the {plan} plan. Enjoy!"

- [x] **T-16** Create `app/components/UpgradeModal.tsx`
  - Props: `trigger: string`, `requiredPlan: Plan`
  - Plan comparison table (Free / Starter / Pro)
  - CTA label: "Start Starter — $29/mo" or "Start Pro — $49/mo" or "Start Pro trial (14 days free)"
  - CTA → `POST /api/billing/checkout { plan }` → full-page redirect to `checkout_url`
  - Dismiss link: "Maybe later"

---

## Phase 4 — Enrich Quota + Usage Display
**Goal:** Free-tier contact cap enforced at enrichment time; quota status visible in UI. Seats are NOT in scope — seat limits belong in Phase 9 (Team Management) where the enforcement point (`POST /api/org/invite`) lives.

- [ ] **T-17** Create `app/lib/quota.ts`
  - Source of truth for run + model limit constants **only** — no seat limits (deferred to Phase 9)
  - ```ts
    export const PLAN_RUN_LIMITS: Record<string, number> = {
      free: 50, starter: -1, pro: -1, enterprise: -1,
    }
    export const PLAN_MODEL_LIMITS: Record<string, number> = {
      free: 1, starter: 5, pro: -1, enterprise: -1,
    }
    ```
  - Update `app/api/usage/route.ts` to import `PLAN_RUN_LIMITS` and `PLAN_MODEL_LIMITS` from `quota.ts`; remove the duplicate local constant blocks
  - Note: `usage/route.ts` already returns `seats`/`seatsLimit` (computed from `PLAN_SEAT_LIMITS` defined locally there). Leave those fields as-is — they are harmless and will be wired to enforcement in Phase 9. Do NOT add `PLAN_SEAT_LIMITS` to `quota.ts` yet.

- [ ] **T-18** Update `app/api/enrich/route.ts`
  - Import `PLAN_RUN_LIMITS` from `quota.ts`
  - Quota check runs **inside the SSE stream handler**, after CSV parse and before the first enrichment call:
    ```ts
    const session = await auth()
    const plan = (session?.user?.plan ?? 'free') as string
    const limit = PLAN_RUN_LIMITS[plan] ?? 50
    if (limit !== -1 && rows.length > limit) {
      await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
      send({ type: 'error', code: 'quota_exceeded', limit, plan })
      controller.close()
      return
    }
    ```
  - On completion: if `session?.user?.orgId` present, insert `UsageLog { orgId, runId, contactsConsumed: enrichedCount, enrichmentSource: 'managed_credits' }`. Skip for anonymous runs (no orgId).
  - No HTTP 402 — quota violations are SSE `{ type: 'error', code: 'quota_exceeded', limit, plan }` because streaming has already started when the count is known

- [x] **T-19** `app/api/usage/route.ts` — **COMPLETE** (implemented in Phase 3)
  - After T-17: import run + model constants from `quota.ts`; local `PLAN_SEAT_LIMITS` stays until Phase 9

- [ ] **T-20** Create `app/components/UsageBanner.tsx`
  - Client component (`'use client'`); calls `GET /api/usage` via `useState + useEffect`
  - Skip render entirely when `useSession().status !== 'authenticated'`
  - **Free plan:** Text pill — "Free plan · 50 contacts per run" + "Upgrade →" link to `/settings/billing`. No progress bar.
  - **Starter / Pro:** Compact credit balance bar:
    - Label: "{balance} enrichment credits remaining"
    - Bar color: green > 200, amber 51–200, red ≤ 50
    - "Buy more →" link to `/settings/billing`
  - **Enterprise:** return null
  - Placement: included by individual pages below `<AppHeader />` (not in `app/layout.tsx` — no session context there). Include on: `/`, `/run/[runId]/score`, `/run/[runId]/results`

- [ ] **T-47** (moved from Phase 10) Update `app/components/EnrichmentProgress.tsx`
  - Handle SSE `{ type: 'error', code: 'quota_exceeded' }` distinctly from generic errors
  - Instead of the generic error panel, open `<UpgradeModal trigger="You've reached your 50-contact limit" requiredPlan="starter" />`
  - Generic `{ type: 'error' }` (no code or different code) still renders the existing error panel
  - This completes the quota story end-to-end within Phase 4

---

## Phase 5 — Deferred Enrichment (complete remaining tasks only)
**Goal:** Users can navigate away and return to a run that's still enriching. T-21, T-22, and T-24 are already implemented — only T-23 and T-25 remain.

- [x] **T-21** `app/lib/notify.ts` — **COMPLETE**
  - `sendEnrichmentComplete(email, runId)` sends magic-link "results ready" email via Resend

- [x] **T-22** `app/api/enrich/route.ts` notify_email handling — **COMPLETE**
  - Accepts `notify_email` in body; stores in `Run.notifyEmail`; sends completion email + creates `EnrichmentNotification` on finish

- [ ] **T-23** Create `app/api/runs/[runId]/status/route.ts`
  - `GET` → no auth required
  - Returns `{ status, enrichedCount, failedCount, totalContacts, completedAt }`
  - Used by the score page when a run is still in progress on load

- [x] **T-24** `app/components/EnrichmentProgress.tsx` notify-me UX — **COMPLETE**
  - `notifyEmail` prop; shows "We'll email {email} when results are ready. You can safely close this tab." during enrichment

- [ ] **T-25** Update `app/run/[runId]/score/page.tsx`
  - Currently: assumes run is ready (fetches results immediately)
  - Add: if `run.status === 'enriching'`, render a `<EnrichingWait runId={runId} />` client component instead of the criteria builder
  - `EnrichingWait` polls `GET /api/runs/:runId/status` every 5s; on `status === 'scoring'` or `'complete'`: `router.refresh()` to re-render the server component with results
  - On `status === 'failed'`: show error state with "Start over" link to `/`

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

- [ ] **T-44b** Add seat limits to `app/lib/quota.ts` and wire enforcement
  - Add `export const PLAN_SEAT_LIMITS: Record<string, number> = { free: 1, starter: 1, pro: 3, enterprise: -1 }`
  - Update `app/api/usage/route.ts` to import `PLAN_SEAT_LIMITS` from `quota.ts` (remove local copy)
  - `POST /api/org/invite`: count `prisma.user.count({ where: { orgId } })` → 409 `{ error: 'seat_limit_reached', limit }` if at limit

---

## Phase 10 — Gates, Limits, Polish
**Goal:** All limits enforced; all queries org-scoped.
**Note:** T-47 moved to Phase 4 (completes the quota story there). Phase 9 adds `PLAN_SEAT_LIMITS` to `quota.ts` and seat enforcement to invite route.

- [ ] **T-45** Update `app/api/models/route.ts`
  - Import `PLAN_MODEL_LIMITS` from `quota.ts`
  - `POST`: count org models → 409 `{ error: 'model_limit_reached', limit, plan }` if at plan limit

- [ ] **T-46** Update `app/components/SaveModelButton.tsx`
  - On 409: open `<UpgradeModal trigger="You've reached your model limit" requiredPlan="starter" />`

- [ ] **T-48** Scope existing queries to `orgId`
  - `app/api/models/route.ts` — filter by `orgId`
  - `app/api/score/route.ts` — verify run belongs to org
  - `app/api/suggest/route.ts` — verify run belongs to org
  - `app/api/enrich/route.ts` — attach `userId` + `orgId` to run on creation (T-18 adds `userId` via session; add `orgId` in same change)

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
| `app/api/billing/credits/route.ts` | 3 |
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
LEMONSQUEEZY_STARTER_VARIANT_ID=      # $29/mo subscription variant
LEMONSQUEEZY_PRO_VARIANT_ID=          # $49/mo subscription variant

# Credit pack one-time product IDs
LEMONSQUEEZY_CREDITS_100_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_500_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_1500_PRODUCT_ID=
LEMONSQUEEZY_CREDITS_5000_PRODUCT_ID=

DELIVERY_DELAY_MS=3000

ENCRYPTION_KEY=                        # 32-byte hex string — used for AES-256 BYOK credential encryption (Phase 8)
```
