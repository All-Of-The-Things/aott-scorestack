# Scorestack — Business Logic Specification (Growth)

## 1. Deferred Enrichment

### Intent
Enrichment of large contact lists (500–2,000 rows) can take 2–10 minutes. Users should not be forced to keep the browser open.

### Rules

1. When `POST /api/enrich` is called, the server immediately creates the `Run` row and begins enrichment.
2. If the request body includes `notify_email`, store it in `Run.notifyEmail` and return an SSE event `{ type: 'deferred', runId }` within the first 2 seconds so the client can safely navigate away.
3. If no `notify_email`, behave as today — stream SSE progress events until completion.
4. On enrichment completion (regardless of notification opt-in):
   - Set `Run.status = 'complete'`, `Run.completedAt`
   - Insert `UsageLog` row with `contactsConsumed = Run.enrichedCount`
   - If `Run.notifyEmail` is set and `EnrichmentNotification.sentAt` is null:
     - Send email via Resend with subject "Your Scorestack run is ready" and a link to `/run/:runId/score`
     - Set `EnrichmentNotification.sentAt = now()`
5. `GET /api/runs/:runId/status` is a lightweight polling endpoint. Returns `{ status, enrichedCount, failedCount, totalContacts }`. No auth required if runId is valid (obscurity is sufficient for MVP — add auth gate in v2).

### Polling behaviour (client)
- When a user navigates to `/run/:runId` while `status === 'enriching'`, the page polls `/api/runs/:runId/status` every 5 seconds.
- When `status === 'complete'`, the page redirects to `/run/:runId/score`.
- A progress spinner with "Still enriching… X / Y contacts processed" is shown during polling.

---

## 2. Quota Enforcement

### Limits by plan

| Plan | Contacts per run | Active models | Seats |
|------|-----------------|--------------|-------|
| free | 50 | 1 | 1 |
| starter | 500 | 5 | 1 |
| pro | 2,000 | unlimited | 3 |
| enterprise | unlimited | unlimited | unlimited |

### Quota check logic (enrich endpoint)

```
1. Get orgId from session (or null for unauthenticated free users)
2. Count incoming contacts from CSV (before enrichment starts)
3. If orgId:
     used = SUM(UsageLog.contactsConsumed WHERE orgId = ? AND createdAt >= Organization.resetDate)
   Else:
     used = 0 (unauthenticated users always on free, no per-org tracking)
4. limit = PLAN_LIMITS[org.plan].contactsPerRun
5. If incoming > limit:
     return 402 { error: 'quota_exceeded', used: 0, limit, plan, upgrade_url }
   Note: per-run limit (not monthly accumulation) enforced at enrich time.
   Monthly accumulation tracked via UsageLog for analytics/future enforcement.
6. Proceed with enrichment.
7. On completion: INSERT UsageLog { orgId, runId, contactsConsumed: enrichedCount }
```

### Model limit

- Before `POST /api/models` succeeds, count existing models for the org.
- If count >= limit (and limit != -1): return 409 `{ error: 'model_limit_reached', limit }`.

### Seat limit

- Before `POST /api/org/invite` succeeds, count current members.
- If count >= seatsLimit: return 409 `{ error: 'seat_limit_reached', limit }`.

### Reset date

- `Organization.resetDate` is set to the first enrichment date of the billing period.
- For paid plans, it aligns to Stripe's `current_period_start` (updated via webhook).
- For free plans, it resets monthly from first use.

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

## 5. Delivery Automation

### LinkedIn delivery (LinkedAPI)

No additional credentials needed — uses the same `LINKED_API_TOKEN` and `LINKED_API_ID_TOKEN` already configured for enrichment.

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
