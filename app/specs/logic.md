# Scorestack — Business Logic Specification (Growth)

## 1. Deferred Enrichment + Session Gate

### Intent
Enrichment of large contact lists can take several minutes. Users should not be forced to keep the browser open. Upload and enrichment are public (no auth required). Everything from the score page onwards requires a verified session — scored results contain enriched contact data and are private.

### Session gate rules

Applied in every auth-required server component:

| Page | No session | Authenticated |
|------|-----------|---------------|
| `/` (upload + enrichment choice) | Public | Show normally |
| `/run/:id/score` | `redirect('/auth/signin?callbackUrl=/run/:id/score')` | Show page |
| `/run/:id/results` | Inline sign-in prompt — not a redirect | Show page |
| `/settings/*` | `redirect('/auth/signin')` | Show page |
| `/onboarding` | — | `redirect('/')` (stub redirect — workspace concept removed) |

### Org bootstrap

Orgs are created automatically in the `signIn` callback (NextAuth) when a user first authenticates. If `session.user.orgId` is null on the billing page (race condition on first sign-in), the billing page creates the org lazily and self-redirects so the session callback re-reads `orgId` on the next request.

There is no workspace-naming step. `Organization.name` defaults to `"My Workspace"` (DB default) and is never shown to users. The org name is an internal label only. Future plan: replace with company LinkedIn URL input for scoring context.

**Session shape:**
```ts
session.user = {
  id:    string
  email: string | null
  orgId: string | null   // null only on first sign-in race; billing page handles this
  role:  'admin' | 'member'
  plan:  'free' | 'starter' | 'pro' | 'enterprise'  // defaults to 'free' if no org or DB error
}
// orgName is NOT exposed in the session
```

### Auth flow (magic link)

All magic-link sign-ins follow the same pattern regardless of trigger:

1. **`SignInPage`** (`/auth/signin`): sets `auth_next` cookie (`encodeURIComponent(destination); max-age=600; SameSite=Lax`) AND calls `signIn('resend', { callbackUrl: '/auth/confirmed?next=<encodeURIComponent(destination)>' })`. Destination is encoded in **both** the cookie and the URL param so the flow works correctly even when the magic link is opened on a different device (where the cookie is absent).
2. NextAuth sends the magic link. On click, NextAuth creates the session and redirects to `/auth/confirmed?next=<encodedDestination>`.
3. **`/auth/confirmed`** (server component): reads `next` from `searchParams.next` first (URL param, open-redirect guard: `startsWith('/')`), falls back to `auth_next` cookie, defaults to `/`. Passes destination to `ConfirmedClient`.
4. **`ConfirmedClient`**: shows "You're signed in" + 2.5s progress bar → `router.push(destination)`. Clears `auth_next` cookie on mount.
5. **`/auth/verified`** still exists for `SaveModelButton`'s direct-to-NextAuth callbackUrl path. It decodes `searchParams.next` (`decodeURIComponent` before `startsWith('/')` check) and redirects.

If already authenticated when reaching `/auth/signin`: server component `redirect(destination)` immediately.

### Session callback resilience

The `session` callback in `auth.ts` wraps its `prisma.user.findUnique` call in a `try/catch`. On DB failure it returns the session with `orgId: null`, `role: 'member'`, and `plan: 'free'` rather than propagating the exception. This prevents a cold-start DB hiccup from crashing any page that calls `auth()` and producing a Vercel NOT_FOUND.

The query joins the org relation in a single round-trip:
```ts
prisma.user.findUnique({
  where:  { id: user.id },
  select: { orgId: true, role: true, org: { select: { plan: true } } },
})
```
`plan` is read from `dbUser.org.plan` (defaults to `'free'` if no org).

### Enrichment notification (always on)

All enrichments are asynchronous. `notify_email` is always collected before enrichment starts (pre-filled from session if authenticated) and is required in the `POST /api/enrich` body.

- `notify_email` is stored as `Run.notifyEmail` at run creation
- `sendEnrichmentStarted(email, runId, totalContacts)` fires immediately after the Inngest job is triggered, giving the user a link before they navigate away
- On enrichment completion the Inngest function calls `sendEnrichmentComplete(email, runId)` — sends single-CTA sign-in email: **"Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:runId/score`
- `EnrichmentNotification { runId, email, sentAt: now() }` is created after send to prevent duplicate sends on Inngest retries

**If already signed in when clicking notification email link:** `/auth/signin` server component redirects directly to `callbackUrl`, bypassing the confirmation page.

### List models (`GET /api/models`)

- If no session: return `{ models: [] }` immediately — no DB query, no orphan records exposed.
- If session: return models scoped to `userId` only — never `userId: null` records.
- `SavedModels` component checks `useSession()` before fetching: skips the request entirely when `status === 'unauthenticated'`; waits for `status === 'authenticated'` before calling the API. The section never renders for logged-out users.

### Save model (results page)

Results page always has a session by design. `SaveModelButton` only renders in authenticated state:
- **Authenticated**: "Save as model" → opens `SaveModelModal`
- **Authenticated, model limit hit**: `SaveModelModal` fires `onLimitReached` callback on 409 → `SaveModelButton` closes the modal and opens `UpgradeModal`

### Model limit enforcement (`POST /api/models`)

1. Read session via `auth()`. Extract `userId = session?.user?.id ?? null`
2. If `userId` present: call `getPlanLimitsFor(plan)` from `app/lib/quota.ts` to get `modelLimit`
3. Count `prisma.scoringModel.count({ where: { userId } })` — if at limit → return 409 `{ error: 'model_limit_reached', limit, plan }`
4. On 409: `SaveModelModal` fires `onLimitReached?.()` + `onClose()`; `SaveModelButton` opens `UpgradeModal`; generic error state on all other failures
5. Deduplication: before creating a new model, `findFirst({ where: { userId, name } })` — if a model with the same name exists for this user, reuse it (200) and link the run without creating a duplicate; `revalidatePath` fires in both the reuse and create paths

### Enrichment rules

Enrichment is fully asynchronous — no SSE streaming. The HTTP request that starts enrichment returns in under 200ms.

1. `POST /api/enrich` — no auth required:
   - Runs quota check (free plan run limit)
   - Creates `Run` row: status `pending`, stores `blobUrl`, `linkedinColumn`, `notifyEmail`, `name`, `userId`, `orgId`
   - Fires `sendEnrichmentStarted(notifyEmail, runId, 0)` (contact count not yet known)
   - Triggers Inngest event `enrich/contacts.requested` with `{ runId }`
   - Returns `{ run_id: string }` JSON immediately
2. **Inngest `enrich-contacts` function** (runs outside Vercel timeout):
   - Updates `Run.status = 'enriching'`
   - Fetches blob from Vercel Blob using stored `Run.blobUrl`
   - Parses CSV, extracts LinkedIn URLs from `Run.linkedinColumn`
   - Applies free-plan quota cap before loop begins (truncate rows, update `Run.totalContacts`)
   - Enriches contacts sequentially via `fetchProfile()`; writes one `RunResult` row per contact as it completes (enables partial result availability)
   - On provider-level abort: updates `Run.status = 'failed'`; stops loop
   - On loop completion: updates `Run.status = 'scoring'`, `Run.enrichedCount`, `Run.failedCount`, `Run.avgEnrichmentMs`, `Run.totalEnrichmentMs`; creates `UsageLog` if `orgId` present
   - Sends completion email (deduped via `EnrichmentNotification`)
3. `GET /api/runs/:runId/status` — no auth required. Returns `{ status, enrichedCount, failedCount, totalContacts, completedAt }`.

### Polling behaviour (client)
- After submission the client navigates to the "Enrichment submitted" confirmation screen and may then go to `/runs` list.
- `/run/:runId` detail page polls `/api/runs/:runId/status` every 5 seconds while `status` is `pending` or `enriching`.
- Partial results (any `RunResult` rows already written) can be displayed once they exist.
- When `status === 'scoring'`, the page shows a "Ready to score →" CTA to `/run/:runId/score`.

---

## 2. Enrichment Quota Enforcement

### Enrichment always uses platform credentials
Enrichment calls always use the platform's LinkedAPI credentials from server env vars (`LINKED_API_TOKEN`, `LINKED_API_ID_TOKEN`). No per-org credential resolution is needed for enrichment. BYOK is only required for LinkedIn message **delivery** (see §5a).

### Quota limits (DB-backed: `PlanLimit` table + `app/lib/quota.ts`)

Limits are stored in a `plan_limits` table seeded at migration time, not hardcoded constants. This allows runtime changes without a deploy.

```sql
-- Seed values (migration 20260424153543_add_plan_limits)
INSERT INTO "plan_limits" ("plan", "run_limit", "model_limit", "seat_limit") VALUES
  ('free',       50,  1,  1),
  ('starter',    -1,  5,  1),
  ('pro',        -1, -1,  3),
  ('enterprise', -1, -1, -1);
-- -1 = unlimited
```

`app/lib/quota.ts` exports `getPlanLimitsFor(plan: string): Promise<PlanLimits>`:
- Queries `prisma.planLimit.findUnique({ where: { plan } })`
- Module-level `Map<string, CacheEntry>` cache with 5-minute TTL (no extra dependency)
- Falls back to hardcoded constants mirroring seed values on DB error

`app/api/usage/route.ts` and `app/api/models/route.ts` both import `getPlanLimitsFor` from `quota.ts`.

### Enrichment quota decision tree

`POST /api/enrich` returns `{ run_id }` JSON immediately (< 200ms). All quota logic runs inside the **Inngest `enrich-contacts` function**, outside the Vercel function timeout.

Auth context (`userId`, `orgId`, `plan`) is resolved in the HTTP handler and stored on the `Run` row before the Inngest event is fired, so the function has access without a second auth round-trip.

```
POST /api/enrich  →  resolve auth context (userId, orgId, plan)
  │
  ├── 1. Validate request body
  ├── 2. Create Run row (status: pending, stores userId + orgId + notifyEmail)
  ├── 3. Fire sendEnrichmentStarted email
  ├── 4. Trigger Inngest event enrich/contacts.requested { runId }
  └── 5. Return { run_id } immediately
        ↓
  Inngest enrich-contacts function (runs async, outside Vercel timeout):
  │
  ├── 1. Update Run.status = 'enriching'
  ├── 2. Fetch + parse CSV from Vercel Blob
  │        Update Run.totalContacts = rows.length
  │        Update Run.originalTotalContacts = rows.length  ← persisted before any truncation
  │
  ├── 3. Quota cap (free plan):
  │       isFree = (!orgId || plan === 'free')
  │
  │       FREE PATH — soft cap:
  │         If limits.runLimit !== -1 AND rows.length > limits.runLimit:
  │           rows = rows.slice(0, limits.runLimit)
  │           Update Run.totalContacts = rows.length  ← originalTotalContacts unchanged
  │           Continue enrichment with truncated rows
  │
  │       PAID PATH (starter / pro / enterprise):
  │         Enrichment proceeds with all rows, no cap.
  │
  ├── 4. Enrich contacts sequentially; write one RunResult per contact as it completes
  │
  └── 5. On completion:
        a. Update Run.status = 'scoring', enrichedCount, failedCount, avgEnrichmentMs
        b. Create UsageLog if orgId present
        c. Send enrichment completion email (deduped via EnrichmentNotification)
```

### Cap feedback in the client

`EnrichmentProgress` polls `GET /api/runs/:runId/status` and derives cap state from DB fields:

- **Cap detection**: `wasCapped = run.originalTotalContacts > run.totalContacts`. This is always correct on direct links or refreshes, not dependent on in-flight state.
- When `status === 'scoring'` and `wasCapped`, the component shows an amber cap-notice panel with original vs. enriched counts and a "Continue to scoring →" CTA before calling `onComplete(runId)`.
- Score page also reads `wasCapped` directly from DB: `run.originalTotalContacts > run.totalContacts`.

### Limits by plan

| Plan | Contacts per run | Models | Seats |
|------|-----------------|--------|-------|
| free | 50 (hard cap) | 1 | 1 |
| starter | Unlimited | 5 | 1 |
| pro | Unlimited | Unlimited | 3 |
| enterprise | Unlimited | Unlimited | Unlimited |

### Model limit

- Before `POST /api/models` succeeds, count existing models for the org.
- If count >= limit (and limit != -1): return 409 `{ error: 'model_limit_reached', limit }`.

### Seat limit

- Before `POST /api/org/invite` succeeds, count current members.
- If count >= seatsLimit: return 409 `{ error: 'seat_limit_reached', limit }`.

---

## 2a. BYOK Credential Management

BYOK is for **delivery only** (ConnectSafely). Enrichment always uses platform credentials (see §2).

### Storing credentials

```
POST /api/org/integrations { connectSafelyApiKey }
  │
  ├── Encrypt key with AES-256-GCM using ENCRYPTION_KEY env var
  ├── Upsert OrgIntegration { orgId, connectSafelyApiKey: encrypted }
  │
  └── Run a test call to ConnectSafely to verify credentials:
        On success: set OrgIntegration.connectSafelyVerifiedAt = now()
        On failure: set OrgIntegration.connectSafelyVerifiedAt = null, return 400 { error: 'invalid_credentials' }
```

### Using credentials at delivery time

```
async function getOrgConnectSafelyKey(orgId): Promise<string | null>
  → fetches OrgIntegration for org
  → if connectSafelyApiKey present: decrypt and return
  → else: return null (signals platform_agent path)
```

Delivery uses org key if present (BYOK path, `deliveryIdentity: 'byok'`), otherwise falls back to platform `CONNECT_SAFELY_API_KEY` (`deliveryIdentity: 'platform_agent'`).

### Security rules
- Encrypted values are never returned in API responses
- `GET /api/org/integrations` returns only `{ configured: boolean, verifiedAt: DateTime | null, lastError: string | null }`
- `ENCRYPTION_KEY` is a 32-byte hex string in env vars; rotation requires re-encrypting all stored credentials

---

## 2b. Managed Credit Pack Purchase Flow

Credit packs are **feature-flagged** (`ENABLE_CREDITS=true`) and **fully dynamic** — pack options are fetched from a single Lemon Squeezy product whose variants each represent one pack size.

### Credit pack discovery

`fetchCreditPacks()` in `billing.ts`:
- Reads `LEMONSQUEEZY_CREDITS_PRODUCT_ID` (LS product ID). Returns `[]` if unset.
- `GET /v1/variants?filter[product_id]=:id&sort=sort` — fetches all variants sorted by LS `sort` field.
- Filters to `status === 'published'`.
- Parses `credits` from variant name via `parseInt(attrs.name)` — convention: variant name must start with a number (e.g. `"100 Credits"` → 100). Variants where `parseInt` returns `NaN` or 0 are skipped.
- Returns `CreditPack[]`: `{ variantId, credits, price (cents), name }`.
- Cached 1 hour via Next.js `revalidate`.

**Feature flag**: `BillingPage` checks `process.env.ENABLE_CREDITS === 'true'`. If false, passes `creditPacks={null}` to `BillingCTAs`, which hides the section entirely.

### Purchase flow

```
User clicks credit pack button (name + price from LS)
  │
  └── POST /api/billing/credits { variantId, credits }
        └── createCreditCheckout(orgId, variantId, credits)
        └── Create LS checkout with custom_data: { orgId, credits }
        └── INSERT PendingCheckout { orgId, userId, lsCheckoutId, variantId, credits }
        └── Return { checkout_url }

User completes payment on LS-hosted page
  │
  └── LS fires order_created webhook → POST /api/webhooks/lemonsqueezy
        └── On event_name === 'order_created':
              credits = meta.custom_data.credits (integer)
              orgId   = meta.custom_data.orgId
              lsOrderId = data.id
              INSERT CreditPurchase { orgId, lsOrderId, credits, amountCents }
              UPDATE Organization SET managedCreditsBalance += credits (atomic)
```

---

## 3. CSV Export

### Route

`GET /api/runs/:runId/export` — auth required.

### Logic

1. Auth + session check → 401 if no session.
2. Fetch `Run` row — 404 if not found.
3. Determine tier: `isFree = (!run.orgId || plan === 'free')`.
4. Fetch `RunResult` rows:
   - Filter: `enrichmentStatus: 'success'` AND `linkedinUrl: { contains: 'linkedin' }` (excludes `row_N` fallback URLs stored for failed rows).
   - Order: `totalScore DESC`.
   - Limit: `isFree ? 10 : undefined`.
5. Build CSV via `buildCsvContent(rows)` (`app/lib/export.ts`):
   - Headers: `['linkedin_url', 'total_score', ...Object.keys(enrichedData)]` — enrichedData keys deduplicated against base headers to prevent duplicate columns (e.g. `LinkedInProfile` includes `linkedin_url`).
   - Cell escaping: values containing `,`, `"`, or `\n` are double-quoted with `""` escaping.
6. **Free tier**: top 10 rows, filename `{originalFilename_base}_scores_top10.csv`.
7. **Paid tier**: all enriched rows, filename `{originalFilename_base}_scores.csv`.
8. Return `text/csv` response with `Content-Disposition: attachment; filename="..."`.

### `app/lib/export.ts`

Pure helper — no DB calls, no auth.

```ts
interface ExportRow {
  linkedinUrl: string
  totalScore: number | null
  enrichedData: Record<string, unknown> | null
}
buildCsvContent(rows: ExportRow[]): string
```

Headers are derived from the first row that has `enrichedData`. Falls back to `['linkedin_url', 'total_score']` if no enriched rows are present.

---

## 4. AI Message Generation

### Intent
Generate a personalised outreach message per contact using their enriched LinkedIn data and their criterion score breakdown as context.

### Prompt structure

```
System (cached per template):
  You are an expert sales copywriter.
  Tone: {template.tone}
  Goal: {template.goal}
  {template.systemPrompt}
  
  Rules:
  - Write in first person
  - Reference specific details from the contact's profile
  - Keep subject lines under 50 characters
  - Keep message body under 150 words
  - Do not mention scoring or AI

User (per contact):
  Contact profile:
  {JSON.stringify(runResult.enrichedData)}
  
  Why this contact scored well:
  {JSON.stringify(runResult.criterionScores.filter(s => s.matched))}
  
  Generate a LinkedIn direct message for this contact.
  Return JSON: { "body": "..." }
  (Plain text only. No subject line. Max 300 characters for LinkedIn connection messages; up to 2000 for InMail.)
```

### Batching and caching

- System prompt is constant per template — Anthropic prompt caching applies automatically.
- Process contacts in batches of 20 concurrent requests (configurable via `MESSAGE_BATCH_SIZE` env var).
- Estimated cost per 2,000 contacts with caching: ~$0.50 at Claude Haiku pricing.

### Storage

- Each generated message stored as a `GeneratedMessage` row immediately after generation.
- If a message already exists for a `(runResultId, templateId)` pair, it is overwritten (re-generation allowed).

### Plan gate

- Free: blocked (402).
- Starter: allowed. Basic templates only (cannot create custom `systemPrompt`). Max 100 messages per run.
- Pro+: allowed. Custom templates. No message count limit.

---

## 5a. Delivery Credential Check (BYOK gate)

Delivery has two identity modes: **platform_agent** (platform's `CONNECT_SAFELY_API_KEY`) and **BYOK** (org's own key). Both are valid — BYOK is not required to start a job.

```
POST /api/delivery/jobs
  │
  ├── 1. Require auth (Pro+ plan)
  │
  ├── 2. Resolve delivery identity via getOrgConnectSafelyKey(orgId):
  │       If org key present + verifiedAt set → BYOK path (deliveryIdentity: 'byok')
  │       Else → platform_agent path (deliveryIdentity: 'platform_agent')
  │
  └── 3. If connectSafelyLastError is set on OrgIntegration:
            return 409 { error: 'integration_error', lastError }
            UI (DeliverySchedulerModal): blocks Send with error banner
```

**Note:** This gate is delivery-only. Enrichment always uses platform credentials and never requires OrgIntegration.

---

## 5. Delivery Automation

### LinkedIn delivery (ConnectSafely)

ConnectSafely is a REST API accessed via plain `fetch` with `Authorization: Bearer <key>`. There is no SDK.

1. User creates `DeliveryJob` via `POST /api/delivery/jobs { run_id, contact_ids? }`.
2. Fire-and-forget: `processDeliveryJob(jobId, notifyEmail)` runs immediately; the API returns `{ job }` without waiting.
3. Set `DeliveryJob.status = 'running'`, `startedAt = now()`.
4. For each `GeneratedMessage` linked to the job (serialised, one at a time):
   a. Resolve the `linkedinUrl` from `RunResult` via `runResultId`.
   b. Call ConnectSafely:
      ```
      connectsafely.sendMessage({
        personUrl: linkedinUrl,
        text: generatedMessage.editedBody ?? generatedMessage.body,
      })
      ```
   c. On success: `GeneratedMessage.sentAt = now()`, `deliveryStatus = 'sent'`; increment `DeliveryJob.sentCount`.
   d. Auth failure (401/403): abort job, mark remaining messages `failed`, set `OrgIntegration.connectSafelyLastError`, email user.
   e. Rate limit (429): retry; if exhausted, mark message `failed`, continue batch.
   f. Other failure: `deliveryStatus = 'failed'`; continue to next contact.
   g. Wait `DELIVERY_DELAY_MS` (default 3000ms) between each send.
5. On full completion: `DeliveryJob.status = 'complete'`, `completedAt = now()`.
6. Call `sendDeliveryComplete(notifyEmail, jobId, sentCount, failedCount)` — non-fatal.

**Notes:**
- `DeliveryJob.deliveryIdentity` records `'byok'` or `'platform_agent'` for reporting
- `DeliveryJob.failureCode` records `'auth_failed'` or `'account_disconnected'` when a job aborts
- Messages must be plain text; max 300 chars for connection request notes, up to 2,000 for InMail
- Only "Send now" is implemented; `scheduledAt` is never written

---

## 6. Team Sharing

### Org scoping

- All runs, models, message templates, and delivery jobs are scoped to `orgId`.
- Queries always filter by `orgId` derived from the session.

### Roles

| Action | admin | member |
|--------|-------|--------|
| Create run | yes | yes |
| Save model | yes | yes |
| Delete own model | yes | yes |
| Delete other's model | yes | no |
| Invite member | yes | no |
| Remove member | yes | no |
| Manage billing | yes | no |
| Create delivery job | yes | yes |
| Cancel delivery job | yes | own only |

### Invite flow

1. Admin calls `POST /api/org/invite { email, role }`.
2. Server checks seat limit.
3. Server creates an `OrgInvite` row: `{ orgId, email, role, expires: +7 days }`.
4. Send email via Resend: "You've been invited to join {org.name} on Scorestack. Click to sign in and join."
5. Link: `/auth/signin?callbackUrl=/` (standard magic-link sign-in).
6. On `signIn` callback: query `OrgInvite` for a valid (non-expired) row matching `user.email`; if found, set `User.orgId = invite.orgId`, `User.role = invite.role`, delete the invite row.

---

## 7. Billing Integration (Lemon Squeezy)

### Why Lemon Squeezy
Lemon Squeezy acts as **Merchant of Record** — they collect payments from customers, handle all global VAT/tax compliance, and pay out to the seller. Confirmed working with a Uruguayan business bank account. No US entity or bank account required.

**v1–v2 only.** Migration to a more scalable processor (Stripe or Paddle) is planned for v3. Keep billing logic isolated in `app/lib/billing.ts` to make the swap low-friction.

### Env vars (billing)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_LEMONSQUEEZY_STARTER_VARIANT_ID` | $29/mo recurring variant ID (must be `NEXT_PUBLIC_` — embedded in browser bundle) |
| `NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID` | $49/mo recurring variant ID (must be `NEXT_PUBLIC_` — embedded in browser bundle) |
| `LEMONSQUEEZY_CREDITS_PRODUCT_ID` | LS product ID whose variants are credit packs (dynamic) |
| `ENABLE_CREDITS` | Set to `"true"` to show the credits section; unset hides it |

### Plan name strategy

Plan names ("Free", "Starter", "Pro", "Enterprise") are defined in the app code, not pulled from LS. `fetchVariantDetails` returns only `price` and `interval` — the name for a given DB plan enum value is resolved via the `PLAN_LABEL` map wherever a display name is needed. This avoids the LS default variant name `"Default"` leaking into the UI.

Credit pack names DO come from LS (`CreditPack.name = attrs.name` from the variant). Convention: variant names must start with the credit count as a number (e.g. `"100 Credits"`).

### PendingCheckout pattern

Lemon Squeezy does not support URL placeholders in redirect URLs (e.g. `{checkoutId}`), so the checkout ID cannot be encoded in the success redirect. Instead:

1. `POST /api/billing/checkout { plan }` creates a `PendingCheckout` row (`orgId`, `userId`, `lsCheckoutId`, `plan`, `credits`) before redirecting to LS.
2. LS redirects to `/settings/billing/confirmation` on payment success (no query params needed).
3. The confirmation page looks up the most recent `PendingCheckout` for the session's `orgId + userId` within a 2-hour window, verifies it with the LS API, and applies the plan/credits if not already confirmed.
4. This covers both fresh redirects and page refreshes after confirmation — the 2-hour window safely handles both.

`PendingCheckout` is scoped to `orgId + userId` (not just `orgId`) to prevent one org member from confirming another's pending checkout.

### Checkout session creation

```
POST /api/billing/checkout { plan }
→ Create PendingCheckout { orgId, userId, lsCheckoutId: '', plan, credits: null }
→ POST https://api.lemonsqueezy.com/v1/checkouts
  headers: { Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}` }
  body: {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          custom: { orgId }   ← passed back in webhook
        },
        product_options: {
          redirect_url: `${APP_URL}/settings/billing/confirmation`
          // APP_URL = process.env.NEXTAUTH_URL ?? `https://${process.env.VERCEL_URL}` ?? 'http://localhost:3000'
        }
      },
      relationships: {
        store: { data: { type: 'stores', id: LEMONSQUEEZY_STORE_ID } },
        variant: { data: { type: 'variants', id: VARIANT_IDS[plan] } }
      }
    }
  }
→ Update PendingCheckout.lsCheckoutId = response.data.id
→ return { checkout_url: response.data.attributes.url }
```

### Webhook handler

Lemon Squeezy signs webhooks with HMAC-SHA256 using `LEMONSQUEEZY_WEBHOOK_SECRET`.

```
POST /api/webhooks/lemonsqueezy
→ Verify X-Signature header (crypto.createHmac('sha256', secret).update(rawBody).digest('hex'))
→ Switch on event_name:

  'subscription_created':
    orgId = meta.custom_data.orgId
    lsCustomerId = data.attributes.customer_id
    lsSubscriptionId = data.id
    plan = lookup from variant ID in data.attributes.variant_id
    Upsert Organization { lsCustomerId, plan }
    Upsert Subscription { orgId, lsSubscriptionId, lsCustomerId, plan, status: 'active', currentPeriodEnd }

  'subscription_updated':
    Find Subscription by lsSubscriptionId
    Update plan, status, currentPeriodEnd, cancelAtPeriodEnd
    Update Organization.plan to match

  'subscription_cancelled':
    Find Subscription by lsSubscriptionId
    Set Subscription.cancelAtPeriodEnd = true
    (Actual downgrade happens at period end via subscription_expired)

  'subscription_expired':
    Find Subscription by lsSubscriptionId
    Set Organization.plan = 'free'
    Update Subscription.status = 'expired'

  'subscription_payment_failed':
    Find Subscription by lsSubscriptionId
    Set Subscription.status = 'past_due'
    (Do not immediately downgrade — give 3-day grace period)
```

### Customer portal

```
POST /api/billing/portal
→ GET https://api.lemonsqueezy.com/v1/customers/{lsCustomerId}/portal
→ return { portal_url: response.data.attributes.urls.customer_portal }
```

---

## 8. Free → Paid Upgrade Flow

1. User hits a gate (quota exceeded, locked feature click, or model limit).
2. Frontend shows `UpgradeModal` with plan comparison table.
3. User clicks "Upgrade to Starter/Pro".
4. Frontend calls `POST /api/billing/checkout { plan }` → receives `checkout_url`.
5. Frontend redirects to Lemon Squeezy hosted checkout (full page redirect).
6. Payment succeeds → LS redirects to `/settings/billing/confirmation`.
7. Confirmation page finds the `PendingCheckout`, verifies with LS API, updates `Organization.plan` if not already confirmed. LS `subscription_created` webhook arrives shortly after and upserts the `Subscription` row.
8. User sees the confirmation page ("Welcome to Starter/Pro!") and can navigate to the dashboard or billing settings.
9. User can now retry the action that was previously gated.
