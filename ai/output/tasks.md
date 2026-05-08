# Scorestack — Build Tasks (feat/07-paid-features)

**Phase:** EXECUTION  
**Command:** BUILD::IMPLEMENT  
**Source specs:** `/ai/output/specs/`
**Last replanned:** PLAN::ARCHITECTURE + PLAN::TASKS 2026-05-07 — Dual-provider architecture made permanent (LinkedAPI = enrichment, ConnectSafely = delivery, env-var controlled); Stage 9c (LinkedAPI removal) dropped; BYOK promoted to Phase 10; Team Management → Phase 11; Gates/Polish → Phase 12  
**Total tasks:** 57 across 12 phases  
**Current phase:** Phase 11 (Team Management) — Phase 10a + 10b complete (2026-05-08)

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

## Phase 7 — AI Message Generation ✅
**Goal:** Paid users can generate personalised LinkedIn messages per contact.
**Completed:** 2026-04-27

- [x] **T-30** Create `app/api/messages/templates/route.ts`
  - `GET` → list `MessageTemplate` for org
  - `POST { name, tone, goal, systemPrompt }` → create

  Create `app/api/messages/templates/[templateId]/route.ts`
  - `PUT` → update
  - `DELETE` → delete

- [x] **T-31** Create `app/lib/messages.ts` + `app/lib/message-defaults.ts`
  - `generateMessages(runId, templateId, contactIds?)`:
    - Fetch `RunResult` rows + `MessageTemplate`
    - Batch Anthropic calls, 20 concurrent, with prompt caching on system prompt
    - Model: `claude-haiku-4-5-20251001`
    - System: `template.systemPrompt` (cached with `cache_control: { type: 'ephemeral' }`)
    - User: `enrichedData` JSON + matched `criterionScores` JSON
    - Parse `{ body }` from response
    - Upsert `GeneratedMessage` rows (unique constraint on runResultId + templateId)
  - `DEFAULT_SYSTEM_PROMPT` extracted to `message-defaults.ts` (client-safe)
  - Added `@@unique([runResultId, templateId])` to `prisma/schema.prisma`

- [x] **T-32** Create `app/api/messages/generate/route.ts`
  - `POST { run_id, template_id, top_n?, contact_ids? }` → plan gate (Starter+) → `generateMessages()` → `{ generated, failed, messages }`
  - Starter cap: 100 messages/run

- [x] **T-33** Create `app/components/MessageTemplateModal.tsx`
  - Fields: name, tone (dropdown), goal (text), system prompt (Pro+ only)
  - Save → `POST /api/messages/templates`

- [x] **T-34** Create `app/components/MessagesTab.tsx`
  - State machine: loading → no_templates → select_template → generating → ready | error
  - Ready state: table with contact URL, score, message preview, Edit/Regenerate/Send(stub) actions
  - Inline edit → `PATCH /api/messages/:id`
  - "Send" button stubbed with Phase 8 tooltip

- [x] **T-35** Create `app/api/messages/[messageId]/route.ts`
  - `PATCH { editedBody }` → update `GeneratedMessage.editedBody`

- [x] **T-36** Update `app/run/[runId]/results/page.tsx`
  - Add `searchParams` for URL-based tab navigation (`?tab=messages`)
  - New `app/components/ResultsTabBar.tsx` — "Scores" | "Messages" tab links
  - Render `<MessagesTab runId={runId} plan={plan} />` in Messages tab

---

## Phase 8 — LinkedIn Delivery ✅
**Goal:** Pro users can send generated messages via LinkedAPI.
**Completed:** 2026-04-28

- [x] **T-37** Create `app/lib/delivery.ts`
  - `processDeliveryJob(jobId, notifyEmail)`: sequential send via `client.sendMessage.execute({ personUrl, text })` + poll result
  - On complete: sends delivery report email via `sendDeliveryComplete` in `app/lib/notify.ts`
  - `app/lib/linkedapi.ts`: exported `getClient()` for reuse
  - SDK params confirmed: `{ personUrl, text }` (not `recipientUrl`/`message` as originally noted)

- [x] **T-38** Create `app/api/delivery/jobs/route.ts`
  - `GET` → Pro gate → list jobs for org (optional `?runId=` filter)
  - `POST { run_id, contact_ids? }` → Pro gate → create job → fire-and-forget `processDeliveryJob` → return job immediately

  Create `app/api/delivery/jobs/[jobId]/route.ts`
  - `GET` → job with counts (org-scoped)
  - `DELETE` → cancel if `status === 'scheduled'`; unlinks messages back to pending

- [x] **T-39** Create `app/components/DeliverySchedulerModal.tsx`
  - "Send now" CTA + grayed-out "Schedule for later — Coming soon" teaser
  - No credential input (LinkedAPI keys from server env)
  - Submit → `POST /api/delivery/jobs` → `router.push('/delivery')`
  - Updated `app/components/MessagesTab.tsx`: removed stub Pro UpgradeModal; Send button opens DeliverySchedulerModal for Pro users, UpgradeModal for others

- [x] **T-40** Create `app/delivery/page.tsx` + `app/components/DeliveryJobsTable.tsx`
  - Card layout per job: run name, status badge, sent/failed counts, start/completion timestamps
  - Running jobs auto-expand showing per-message live list (contact handle, status dot, message preview, sentAt timestamp)
  - `GET /api/delivery/jobs/[jobId]/messages` polls every **3s** for running jobs; job-level list polls every **10s**
  - First `pending` message in queue shown with pulsing dot as "currently sending"
  - Completed/cancelled jobs show collapsible message history
  - Cancel action for `scheduled` jobs
  - Nav link added to `AppHeader` (Pro/Enterprise only)
  - `LINKED_API_TEST_DELIVERY` / `LINKED_API_TEST_DELIVERY_PROFILE` env vars for test mode

**Post-ship refinements (not in original spec):**
- Messages not retrieved on page return → added `GET /api/messages/generate?run_id&template_id` + load on mount in `MessagesTab`
- Bulk message selection → checkboxes + selection bar → `contact_ids` forwarded to scheduler
- `ON CONFLICT` bug (missing DB unique constraint) → replaced all `upsert` calls with `findFirst + update/create`
- JSON output suffix stripped from user-facing prompt field; appended automatically in `messages.ts`
- Breadcrumb + nav coexistence → nav hidden when breadcrumb is present

---

## Phase 9 — Dual-Provider LinkedIn Architecture ✅
**Goal:** Establish LinkedAPI and ConnectSafely as permanent co-existing providers with distinct roles, controlled via env vars. This is not a migration — LinkedAPI is retained.

- **ConnectSafely** — message delivery (`CONNECT_SAFELY_DELIVERY_ENABLED`)
- **LinkedAPI** — data enrichment (`LINKED_API_ENRICHMENT_ENABLED`)

**Motivation:** LinkedAPI is shared with other workflows and delivers richer enrichment data (industry, company_size). ConnectSafely handles delivery at a lower price point via plain REST. Separating roles lets each provider do what it does best.

---

### Bug fixes (discovered during Phase 9 validation)

- [x] **T-BF1** Schema drift migration — `prisma/migrations/20260429170000_fix_schema_drift/migration.sql`
  - Added 5 missing columns (`runs.name`, `runs.original_total_contacts`, `plan_limits.export_enabled/messages_enabled/delivery_enabled`)
  - Seeded correct per-plan values for `plan_limits` boolean columns

- [x] **T-BF2** Auth reliability — `app/lib/auth.ts` session callback fallback org bootstrap
  - NextAuth v5 signIn callback is skipped during email verificationRequest phase; session callback added as reliable fallback
  - Both callbacks are idempotent

- [x] **T-BF3** Run claiming — `app/lib/auth.ts` signIn callback + `app/run/[runId]/score/page.tsx` + `app/run/[runId]/results/page.tsx`
  - signIn callback now runs `updateMany` to claim all orphaned runs matching `notifyEmail`
  - Score and results pages each claim the specific run as a belt-and-suspenders guard

- [x] **T-BF4** SaveModelButton frontend gate removed — `app/components/SaveModelButton.tsx`
  - Removed `isFreePlan` gate that incorrectly blocked free users from opening the modal
  - Backend 409 (`model_limit_reached`) is the sole enforcement point

- [x] **T-BF5** MessagesTab send button plan routing — `app/components/MessagesTab.tsx`
  - Introduced shared `handleSend(contactIds: string[])` function
  - Pro/Enterprise → opens DeliverySchedulerModal; Starter and below → shows upgrade modal with `requiredPlan='pro'`
  - Single `upgradeRequiredPlan` state replaces ad-hoc duplicate modal logic
  - All props typed with Prisma-generated `Plan` type (no inline string union casts)

- [x] **T-BF6** Orphaned runs invisible on Enrichments page — `app/runs/page.tsx` + `app/lib/auth.ts`
  - `/runs` query widened to `OR: [{ orgId }, { userId }]` so runs created while authenticated but before org bootstrap propagated are visible immediately
  - signIn callback now runs a second `updateMany({ where: { userId: user.id, orgId: null }, data: { orgId } })` to retroactively assign orgId on next login

- [x] **T-BF7** ConnectSafely enrichment profile mapping — `app/lib/connectsafely.ts`
  - Fixed `location`: was `p.location` (object) → `p.geoLocation?.fullLocation` (string)
  - Fixed `experience` lookup: was `data.experience` (undefined) → `p.experience` (correct nesting under `data.profile`)
  - Added retry logic to `fetchProfile` (same 2-retry / 3s-delay / retryable-error pattern already used by `sendMessage`)
  - Unified constants: `MAX_RETRIES`, `isRetryableError` (previously duplicated per function)

- [x] **T-BF8** Seniority derivation + company enrichment — `app/lib/connectsafely.ts` + `app/lib/linkedapi.ts`
  - Added exported `deriveSeniority(title)` helper to `connectsafely.ts`; applied to both CS `fetchProfile` and LinkedAPI `fetchProfile`
  - Fixed `CONNECT_SAFELY_ENRICHMENT_ENABLED` flag ordering: now checked before `LINKED_API_ENABLED` mock guard
  - LinkedAPI: added best-effort `client.fetchCompany` (`st.openCompanyPage`) secondary call after `fetchPerson` to populate `industry` and `company_size`

- [x] **T-BF9** Scoring criteria data validation — `app/run/[runId]/score/page.tsx` + `app/components/CriteriaBuilder.tsx`
  - `deriveAvailableFields` now checks `value != null` (not just key presence) so `industry`/`company_size` never surface for CS-enriched runs
  - `CriteriaBuilder`: "no data" amber badge on criterion field labels; disabled option in dropdown preserves correct field name display
  - Pre-scoring modal lists unavailable fields; on "Score anyway", strips those criteria and proportionally renormalizes remaining weights before API submission

---

### Stage 9a — Delivery (ConnectSafely for message sending)

- [x] **T-CS1** Install / configure ConnectSafely
  - Add `CONNECT_SAFELY_API_KEY` to `.env` and `.env.example`
  - Add `CONNECT_SAFELY_DELIVERY_ENABLED` env var (defaults to `false`)
  - No npm package — all calls are plain `fetch`

- [x] **T-CS2** Create `app/lib/connectsafely.ts`
  - HTTP client singleton reading `CONNECT_SAFELY_API_KEY`; throws on missing key (mirroring `getClient()` in `linkedapi.ts`)
  - `sendMessage(personUrl: string, text: string): Promise<{ success: boolean; error?: string }>`
    - POST to ConnectSafely's message-send endpoint with `Authorization: Bearer CONNECT_SAFELY_API_KEY`
    - Map response to `{ success, error }` — no SDK types exposed outside this file
  - Confirm exact endpoint + request shape against ConnectSafely API docs before implementing

- [x] **T-CS3** Update `app/lib/delivery.ts`
  - Import `sendMessage as csSendMessage` from `./connectsafely`
  - At top of `processDeliveryJob`: `const useConnectSafely = process.env.CONNECT_SAFELY_DELIVERY_ENABLED === 'true'`
  - In the per-message send loop, branch:
    - `useConnectSafely === true` → `await csSendMessage({ personUrl, text })` → map `{ success }` to sent/failed
    - `useConnectSafely === false` → existing `client.sendMessage.execute / result` path (unchanged)
  - Test mode (`LINKED_API_TEST_DELIVERY` / `LINKED_API_TEST_DELIVERY_PROFILE`) applies to both branches — personUrl + text are built before the branch

  **Verification (9a):** `CONNECT_SAFELY_DELIVERY_ENABLED=true`, `LINKED_API_TEST_DELIVERY=true` → create delivery job → confirm messages reach `sent` with `sentAt` timestamps

---

### Stage 9b — Enrichment (ConnectSafely for profile fetching)

- [x] **T-CS4** Add `CONNECT_SAFELY_ENRICHMENT_ENABLED` env var to `.env` and `.env.example` (defaults to `false`)

- [x] **T-CS5** Extend `app/lib/connectsafely.ts`
  - Add `fetchProfile(linkedinUrl: string): Promise<FetchProfileResult>`
    - Imports `FetchProfileResult` and `LinkedInProfile` from `./linkedapi` (interfaces stay there until Stage 9c)
    - GET / POST to ConnectSafely's enrichment endpoint
    - Map response to `LinkedInProfile` shape (same fields: `full_name`, `headline`, `current_title`, `company_name`, `location`, etc.)
    - Returns `{ status: 'failed', profile: null, error }` on any HTTP error
  - Confirm exact endpoint + response shape against ConnectSafely API docs before implementing

- [x] **T-CS6** Update `app/lib/linkedapi.ts` → `fetchProfile`
  - Add at the very top of `fetchProfile` (after the mock check):
    ```ts
    if (process.env.CONNECT_SAFELY_ENRICHMENT_ENABLED === 'true') {
      return fetchProfileCS(linkedinUrl) // imported from ./connectsafely
    }
    ```
  - All existing LinkedAPI logic remains untouched below that guard
  - `LINKED_API_ENABLED` mock shortcut continues to work for both paths

  **Verification (9b):** `CONNECT_SAFELY_ENRICHMENT_ENABLED=true` → upload CSV → enriched profiles return valid `full_name`, `headline`, `company_name`

---

## Phase 10a — Platform Generic Agent Delivery ✅
**Completed:** 2026-05-08

**Gate:** Pro (unchanged)  
**Goal:** Surface the existing platform delivery as a named identity ("ScoreStack Outreach Agent") and record identity mode on each job.

### Delivery identity model

| Mode | Gate | Description |
|------|------|-------------|
| **Platform Generic Agent** | Pro | Messages sent from the ScoreStack outreach agent (our LinkedIn account). Zero setup — this is the default. |
| **BYOK** | Pro | Org connects their own ConnectSafely API key. Messages sent from their own LinkedIn account. |

### Tasks

- [x] **T-10A1** Schema: add `deliveryIdentity` + `failureCode` to `DeliveryJob`
  - `prisma/migrations/20260508120000_phase10_delivery_identity/migration.sql`

- [x] **T-10A2** Update `app/lib/delivery.ts`
  - BYOK key resolution; writes `deliveryIdentity` (`byok` or `platform_agent`) when starting a job

- [x] **T-10A3** Update `app/components/DeliverySchedulerModal.tsx`
  - Dynamic identity label: platform agent / BYOK connected / BYOK error (amber, Send blocked)
  - Fetches `GET /api/org/integrations` on modal open

---

## Phase 10b — BYOK Delivery ✅
**Completed:** 2026-05-08

**Gate:** Pro  
**Goal:** Pro org admins connect their own ConnectSafely API key. Credential errors abort the job early with actionable feedback — never silently fail the full batch.

### Failure handling

| Failure | Detection | Handling |
|---------|-----------|----------|
| Invalid/revoked API key | 401 from ConnectSafely | Abort job; mark all remaining messages `failed`; email user; set `connectSafelyLastError` in DB |
| LinkedIn account disconnected | 403 / CS body | Same abort path; distinct error message |
| Rate limited | 429 | Existing retry logic (2 retries, 3s); if exhausted, mark message `failed`, continue batch |
| Transient network error | 5xx / timeout | Retry; if exhausted, mark message `failed`, continue batch |
| `ENCRYPTION_KEY` missing | Env var absent | Throws on `credentials.ts` import — never silently falls back to platform key |

**Job-abort rule:** auth errors (`auth_failed`, `account_disconnected`) are non-retryable and affect the whole account — stop the job immediately.

### Tasks

- [x] **T-10B1** Schema: `OrgIntegration` extended with `connectSafelyApiKey`, `connectSafelyVerifiedAt`, `connectSafelyLastError`

- [x] **T-10B2** Create `app/lib/credentials.ts` — AES-256-GCM encrypt/decrypt + `getOrgConnectSafelyKey`

- [x] **T-10B3** Update `app/lib/connectsafely.ts` — structured `SendResult` type; 401→`auth_failed`, 403→`account_disconnected`, 429→`rate_limited`; optional `apiKey` param

- [x] **T-10B4** Update `app/lib/delivery.ts` — BYOK key resolution; abort-on-auth-error via `$transaction`

- [x] **T-10B5** Update `app/lib/notify.ts` — `sendByokCredentialError` with error-code-specific email copy

- [x] **T-10B6** Create `app/api/org/integrations/route.ts` — GET/POST/DELETE; POST validates key via test call before saving

- [x] **T-10B7** Create `app/settings/integrations/page.tsx` + `ConnectSafelyCard.tsx` — three-state card (not connected / healthy / error); Connect modal with inline validation; Disconnect confirmation

- [x] **T-10B8** Update `app/components/DeliverySchedulerModal.tsx` — dynamic sender label; Send blocked when `lastError` set

**Post-ship refinements:**
- `SettingsNav` tab strip added to both Billing and Integrations pages (Billing ↔ Integrations navigation)
- Hardcoded `maskKey('cskey')` removed; masked key display uses static `cs_••••••••••••••••`

---

## Phase 11 — Team Management
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

## Phase 12 — Gates, Limits, Polish
**Goal:** All limits enforced; all queries org-scoped.
**Note:** T-47 moved to Phase 4 (completes the quota story there). Phase 11 adds `PLAN_SEAT_LIMITS` to `quota.ts` and seat enforcement to invite route.

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
| `app/lib/connectsafely.ts` | 9 |
| `app/lib/credentials.ts` | 10b |
| `app/api/org/integrations/route.ts` | 10b |
| `app/settings/integrations/page.tsx` | 10b |
| `app/api/org/members/route.ts` | 11 |
| `app/api/org/members/[userId]/route.ts` | 11 |
| `app/api/org/invite/route.ts` | 11 |
| `app/settings/team/page.tsx` | 11 |

## Modified files summary

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | 1 | Add all new models + enums |
| `app/layout.tsx` | 2 | Add Nav + UsageBanner |
| `app/api/enrich/route.ts` | 4, 5 | Quota check + deferred notify |
| `app/components/EnrichmentProgress.tsx` | 5 | Two-path UX |
| `app/run/[runId]/score/page.tsx` | 5, 9 (bug fix) | Polling fallback; run claiming on page load |
| `app/run/[runId]/results/page.tsx` | 6, 7, 9 (bug fix) | Export button + Messages tab; run claiming on page load |
| `app/lib/delivery.ts` | 9 | ConnectSafely delivery feature flag |
| `app/lib/linkedapi.ts` | 9 | Flag ordering fix; deriveSeniority; fetchCompany secondary call for industry + company_size |
| `app/api/models/route.ts` | 10, 11 | orgId scope + limit check |
| `app/api/score/route.ts` | 11 | orgId scope |
| `app/api/suggest/route.ts` | 11 | orgId scope |
| `app/components/SaveModelButton.tsx` | 9 (bug fix), 11 | Remove incorrect free-plan frontend gate; model limit gate |
| `app/lib/auth.ts` | 9 (bug fix), 10 | Org bootstrap session fallback + run claiming (email + userId); invite acceptance callback |
| `app/components/MessagesTab.tsx` | 9 (bug fix) | Shared handleSend + upgradeRequiredPlan state + Plan typing |
| `prisma/migrations/20260429170000_fix_schema_drift/migration.sql` | 9 (bug fix) | Schema drift — 5 missing columns + plan_limits seed |
| `app/lib/connectsafely.ts` | 9 (bug fix) | Profile mapping fixes; retry logic for fetchProfile; deriveSeniority helper |
| `app/runs/page.tsx` | 9 (bug fix) | Widen query to OR [orgId, userId] |
| `app/run/[runId]/score/page.tsx` | 5, 9 (bug fix) | Polling fallback; run claiming; null-value check in deriveAvailableFields |
| `app/components/CriteriaBuilder.tsx` | 9 (bug fix) | No-data modal, criteria stripping, weight normalization |

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

ENCRYPTION_KEY=                        # 32-byte hex string — AES-256-GCM for BYOK credential storage (Phase 10)

# Phase 9 — Dual-provider LinkedIn architecture
CONNECT_SAFELY_API_KEY=                # ConnectSafely REST API key (delivery)
CONNECT_SAFELY_DELIVERY_ENABLED=       # true = route delivery through ConnectSafely (permanent control)
CONNECT_SAFELY_ENRICHMENT_ENABLED=     # true = route enrichment through ConnectSafely (alternative)
LINKED_API_ENRICHMENT_ENABLED=         # true = route enrichment through LinkedAPI (primary path; default)
```
