# Scorestack — Business Logic Specification (Growth)

## 1. Deferred Enrichment + Session Gate

### Intent
Enrichment of large contact lists can take several minutes. Users should not be forced to keep the browser open. Upload and enrichment are public (no auth required). Everything from the score page onwards requires a verified session — scored results contain enriched contact data and are private.

### Session gate rules

| Page | No session behaviour |
|------|---------------------|
| `/` (upload + enrichment choice) | Public — no gate |
| `/run/:id/score` | `redirect('/auth/signin?callbackUrl=/run/:id/score')` |
| `/run/:id/results` | Inline sign-in prompt — "Scored contact lists are private. Sign in to access your ranked results." Not a redirect. |

### Pre-enrichment notification (optional, non-blocking)

`EnrichmentChoice` offers "Notify me by email" for users who want to close the tab:
- Email input captured in the UI; sent as `notify_email` in the `POST /api/enrich` body → stored as `Run.notifyEmail`
- On enrichment completion, if `Run.notifyEmail` is set and `EnrichmentNotification` row does not exist:
  - Call `sendEnrichmentComplete(email, runId)` — sends single-CTA sign-in email: **"Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:runId/score`
  - Create `EnrichmentNotification { runId, email, sentAt: now() }` to prevent duplicate sends
- `/auth/signin` is a server component: if session already exists, redirects to `callbackUrl` immediately without showing the form

### Save model (results page)

Results page always has a session by design. `SaveModelButton` only renders in authenticated state:
- **Authenticated**: "Save as model" → opens `SaveModelModal`
- **Authenticated, model limit hit**: `SaveModelModal` shows inline 409 upgrade prompt

### Model limit enforcement (`POST /api/models`)

1. Read session via `auth()`. Extract `userId = session?.user?.id ?? null`
2. If `userId` present: look up user's org plan (if org exists), apply `PLAN_MODEL_LIMITS: { free: 1, starter: 5, pro: -1, enterprise: -1 }`, default to `free` if no org
3. Count `prisma.scoringModel.count({ where: { userId } })` — if at limit → return 409 `{ error: 'model_limit_reached', limit, plan }`
4. `SaveModelModal` renders inline upgrade prompt on 409; generic error state on all other failures

### Enrichment rules

1. `POST /api/enrich` creates the `Run` row and begins enrichment. No auth required.
2. If the request body includes `notify_email`, store it in `Run.notifyEmail` at run creation. The client can safely navigate away once the SSE `started` event is received.
3. On enrichment completion:
   - Update `Run.status = 'scoring'`, `Run.enrichedCount`, `Run.failedCount`
   - If `Run.notifyEmail` is set and `EnrichmentNotification` row does not exist:
     - Call `sendEnrichmentComplete(email, runId)` — sends single-CTA sign-in email
     - Create `EnrichmentNotification { runId, email, sentAt: now() }` to prevent duplicate sends
   - Send SSE `{ type: 'complete', run_id: runId }` → close stream
4. `GET /api/runs/:runId/status` lightweight polling. Returns `{ status, enrichedCount, failedCount, totalContacts }`. No auth required.

### Polling behaviour (client)
- When a user navigates to `/run/:runId` while `status === 'enriching'`, the page polls `/api/runs/:runId/status` every 5 seconds.
- When `status === 'complete'`, the page redirects to `/run/:runId/score`.
- A progress spinner with "Still enriching… X / Y contacts processed" is shown during polling.

---

## 2. Enrichment Quota Enforcement

### Enrichment always uses platform credentials
Enrichment calls always use the platform's LinkedAPI credentials from server env vars (`LINKED_API_TOKEN`, `LINKED_API_ID_TOKEN`). No per-org credential resolution is needed. BYOK is only required for LinkedIn message **delivery** (see §5a).

### Enrichment quota decision tree

```
POST /api/enrich
  │
  ├── 1. Get org from session (optional — anonymous runs are allowed)
  │
  ├── 2. Per-run hard cap check:
  │       If org.plan === 'free' (or no session) AND incomingCount > 50:
  │         return 402 { error: 'run_limit_exceeded', limit: 50 }
  │
  ├── 3. Future: managed credits deduction
  │       If org has managedCreditsBalance configured and source = 'managed_credits':
  │         Decrement org.managedCreditsBalance by incomingCount atomically
  │
  └── 4. Proceed with enrichment using platform credentials
        └── On completion: INSERT UsageLog { orgId, runId, contactsConsumed, enrichmentSource: 'managed_credits' }
```

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

### Storing credentials

```
POST /api/settings/integrations/linkedapi { token, idToken }
  │
  ├── Encrypt token with AES-256-GCM using ENCRYPTION_KEY env var
  ├── Encrypt idToken with AES-256-GCM using ENCRYPTION_KEY env var
  ├── Upsert OrgIntegration { orgId, linkedApiToken: encrypted, linkedApiIdToken: encrypted }
  │
  └── Run a test profile fetch to verify credentials:
        client.fetchPerson.execute({ personUrl: 'https://linkedin.com/in/williamhgates' })
        On success: set OrgIntegration.verifiedAt = now()
        On failure: set OrgIntegration.verifiedAt = null, return 422 { error: 'invalid_credentials' }
```

### Using credentials at enrichment time

```
function resolveLinkedApiClient(org) {
  if (org.integration?.verifiedAt) {
    // Decrypt and use org's own credentials
    const token = decrypt(org.integration.linkedApiToken)
    const idToken = decrypt(org.integration.linkedApiIdToken)
    return new LinkedApi({ linkedApiToken: token, identificationToken: idToken })
  }
  // Fall back to platform credentials (managed_credits path)
  return getClient() // existing singleton from app/lib/linkedapi.ts
}
```

### Security rules
- Encrypted values are never returned in API responses
- `GET /api/settings/integrations` returns only `{ configured: boolean, verifiedAt: DateTime | null }`
- `ENCRYPTION_KEY` is a 32-byte hex string in env vars; rotation requires re-encrypting all stored credentials

---

## 2b. Managed Credit Pack Purchase Flow

```
User clicks "Buy credits" → selects pack size
  │
  └── POST /api/billing/credits { packId }
        └── Look up pack config (credits, lsProductId)
        └── Create LS checkout for one-time product with custom_data.orgId + custom_data.credits
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

### Logic

1. Auth + session check.
2. Fetch Run, verify `status === 'complete'`.
3. Fetch all RunResult rows for the run, ordered by `totalScore DESC`.
4. Build CSV rows:
   - Columns: rank, linkedin_url, total_score, [criterion field scores], [enriched fields: name, headline, company, location, etc.]
5. **Free tier**: return only rows 1–10, append column `note` = "Upgrade to Starter to export all results".
6. **Starter+**: return all rows, no watermark.
7. Set `Content-Disposition: attachment; filename="scorestack-{runId}-{date}.csv"`.
8. Stream response as `text/csv`.

### Enriched fields included in export

`linkedin_url`, `full_name`, `headline`, `current_title`, `company_name`, `location`, `seniority`, `industry`, `company_size`

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

Before creating a `DeliveryJob`, verify the org has configured their own LinkedAPI account:

```
POST /api/delivery/jobs
  │
  ├── 1. Require auth (Pro+ plan)
  │
  ├── 2. Fetch OrgIntegration for org
  │       If not found OR verifiedAt is null:
  │         return 402 { error: 'byok_required', setup_url: '/settings/integrations' }
  │         UI: "Add your LinkedAPI account in Settings → Integrations to start sending messages"
  │
  └── 3. Use org's decrypted LINKED_API_TOKEN / LINKED_API_ID_TOKEN for all delivery calls
```

**Note:** This gate is delivery-only. Enrichment always uses platform credentials and never requires OrgIntegration.

---

## 5. Delivery Automation

### LinkedIn delivery (LinkedAPI)

Uses the org's own LinkedAPI credentials fetched from `OrgIntegration` (BYOK — see §5a).

1. User creates `DeliveryJob` via `POST /api/delivery/jobs { run_id, scheduled_at?, contact_ids? }`.
2. If `scheduledAt` is null or in the past: begin processing immediately; otherwise queue for the scheduled time.
3. Set `DeliveryJob.status = 'running'`, `startedAt = now()`.
4. For each `GeneratedMessage` linked to the job (serialised, one at a time):
   a. Resolve the `linkedinUrl` from `RunResult` via `runResultId`.
   b. Call LinkedAPI messaging workflow:
      ```
      const workflowId = await client.sendMessage.execute({
        recipientUrl: linkedinUrl,
        message: generatedMessage.editedBody ?? generatedMessage.body,
      })
      const result = await client.sendMessage.result(workflowId)
      ```
   c. On success: `GeneratedMessage.sentAt = now()`, `deliveryStatus = 'sent'`; increment `DeliveryJob.sentCount`.
   d. On failure: `deliveryStatus = 'failed'`; increment `DeliveryJob.failedCount`; log error; continue to next contact.
   e. Wait 3 seconds between each send to respect LinkedIn rate limits (configurable via `DELIVERY_DELAY_MS` env var).
5. On full completion: `DeliveryJob.status = 'complete'`, `completedAt = now()`.

**Notes:**
- `client.sendMessage` follows the same async workflow pattern as `client.fetchPerson` — confirm the exact method name against the LinkedAPI SDK changelog before implementation
- If the SDK does not expose a messaging workflow, fall back to the LinkedAPI REST API directly
- No webhook callbacks from LinkedAPI for delivery status — status is known synchronously from the workflow result
- Messages must be plain text (LinkedIn does not support HTML in direct messages); max 300 chars for connection request notes, up to 2,000 for InMail

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
3. Server creates a `VerificationToken` (NextAuth table) with `identifier = invite:{orgId}:{email}`.
4. Send email via Resend: "You've been invited to join {org.name} on Scorestack. Click to accept."
5. Link: `/api/auth/callback/email?token={token}&callbackUrl=/onboarding/accept-invite`
6. On sign-in callback: resolve token, set `User.orgId = orgId`, `User.role = invitedRole`.

---

## 7. Billing Integration (Lemon Squeezy)

### Why Lemon Squeezy
Lemon Squeezy acts as **Merchant of Record** — they collect payments from customers, handle all global VAT/tax compliance, and pay out to the seller. Confirmed working with a Uruguayan business bank account. No US entity or bank account required.

**v1–v2 only.** Migration to a more scalable processor (Stripe or Paddle) is planned for v3. Keep billing logic isolated in `app/lib/billing.ts` to make the swap low-friction.

### Variant IDs (configured via env vars)

- `LEMONSQUEEZY_STARTER_VARIANT_ID` → $29/mo recurring variant
- `LEMONSQUEEZY_PRO_VARIANT_ID` → $79/mo recurring variant

### Checkout session creation

```
POST /api/billing/checkout { plan }
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
          redirect_url: `${APP_URL}/settings/billing?success=1`
        }
      },
      relationships: {
        store: { data: { type: 'stores', id: LEMONSQUEEZY_STORE_ID } },
        variant: { data: { type: 'variants', id: VARIANT_IDS[plan] } }
      }
    }
  }
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
    Reset Organization.contactsUsedThisMonth = 0
    Set Organization.resetDate = now()

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
6. Payment succeeds → Lemon Squeezy redirects to `/settings/billing?success=1`.
7. LS fires webhook → org plan updated in DB.
8. `/settings/billing` page fetches `/api/usage` → shows updated plan.
9. User can now retry the action that was previously gated.

**Optimistic unlock:** After checkout success redirect, the client can optimistically show the new plan while waiting for the webhook to fire (typically fires within 2–5 seconds).
