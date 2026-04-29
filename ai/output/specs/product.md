# Scorestack — Product Specification (Growth)
_Last refined: SPEC::REFINE Phase 09 — ConnectSafely replaces LinkedAPI for enrichment + delivery (feature-flagged, staged migration); Teams support deferred to Phase 10_

## Overview

Scorestack is a LinkedIn-enriched contact scoring and outreach tool for sales, RevOps, and recruiting teams. Users upload a CSV of LinkedIn URLs, define weighted scoring criteria (manually or via AI suggestions), and receive a ranked contact list ready for outreach.

This spec covers the **growth / monetisation layer** on top of the existing MVP.

---

## Problem

Sales and recruiting teams spend hours manually researching LinkedIn contacts, scoring them inconsistently, and then crafting individual outreach messages. Existing enrichment tools charge per-record and return raw data with no scoring layer. CRM-native scoring is rigid and hard to configure.

---

## Solution

Scorestack automates the full pipeline:

1. Upload CSV with LinkedIn URLs
2. Enrich profiles automatically
3. Define and apply weighted scoring criteria
4. Export ranked results
5. Generate personalised AI outreach messages
6. Automate delivery at scale

---

## Enrichment & Delivery Cost Model

### Enrichment — Platform-managed credentials
- Enrichment always uses Scorestack's platform ConnectSafely credentials (server env vars)
- No user setup required — works on all plans including free
- Contact-per-run caps apply per plan (free = 50 contacts)
- Managed credits are a future add-on: users buy credit packs; Scorestack deducts per enriched contact

### Messaging & Delivery — BYOK (Bring Your Own ConnectSafely Account)
- LinkedIn message delivery requires the user's own ConnectSafely API key
- Users provide their `CONNECT_SAFELY_API_KEY` in org settings (Settings → Integrations)
- Scorestack stores credentials encrypted per org; all delivery calls use the user's account
- **Why BYOK for delivery:** LinkedIn ToS and rate limits make it infeasible for Scorestack to absorb delivery at scale; users are responsible for their own outreach volume
- Enrichment and delivery are independent — a user can enrich without ever configuring BYOK

### Credit pack pricing (managed enrichment)
| Pack | Credits | Price | Per contact |
|------|---------|-------|-------------|
| Starter | 100 | $6 | $0.06 |
| Standard | 500 | $25 | $0.05 |
| Pro | 1,500 | $60 | $0.04 |
| Bulk | 5,000 | $175 | $0.035 |

---

## Pricing Tiers

### Anonymous / Free
- **No sign-in required** to run the core scoring pipeline
- Email is captured at one of two natural moments (see "Email Capture Gates" below) — not as a hard auth wall
- 50 contacts per run (hard cap)
- 1 active scoring model
- No CSV export (top-10 preview only, watermarked)
- No AI message generation
- No delivery automation
- No team sharing
- Single user

#### Pre-enrichment notification (optional)

`EnrichmentChoice` offers a "Notify me by email" option for users who want to close the tab:
- Email input revealed on selection; on submit, `notify_email` is included in the `POST /api/enrich` body and stored in `Run.notifyEmail`

**If the browser is still open when enrichment completes (unauthenticated):**
- Client silently fires a magic link to the already-known email (no second email prompt)
- Sets `auth_next` cookie to `/run/:id/score` before calling `signIn()`
- Shows "Check your inbox" screen with the email address displayed

**If the user navigated away:** Resend sends a "Your results are ready" email with a single CTA: **"Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:id/score`. Clicking the link creates a session and routes through `/auth/confirmed` → score page.

- If already signed in when clicking the link: `/auth/signin` redirects to `callbackUrl` immediately (no form shown)

#### Session gate (score + results pages)

A verified session is required from the score page onwards. Scored results contain enriched contact data and are private.

| Page | No session behaviour |
|------|---------------------|
| `/run/:id/score` | `redirect('/auth/signin?callbackUrl=/run/:id/score')` |
| `/run/:id/results` | Inline prompt: "Scored contact lists are private. Sign in to access your ranked results." + "Sign in →" CTA. Not a redirect — user can see the URL context. |

**Future backlog:** Shared scores (Pro+) — shareable read-only link to results without requiring the viewer to sign in.

#### Model limit enforcement

`POST /api/models` enforces the per-plan model limit (scoped to `userId`):
- If session but no `userId` (unexpected): returns 503
- Counts `prisma.scoringModel.count({ where: { userId } })` against `PLAN_MODEL_LIMITS`
- Returns 409 `model_limit_reached` with `{ limit, plan }` when at capacity
- `SaveModelModal` shows inline upgrade prompt on 409

### Starter — $29 / month
- Platform-managed enrichment — monthly subscription covers enrichment costs, no credit balance required
- Unlimited contacts per run
- 5 active scoring models
- Full CSV export (scores + enriched fields)
- AI message generation (basic templates, up to 100 messages per run)
- No delivery automation
- No team sharing
- Single user

### Pro — $49 / month
- Platform-managed enrichment — monthly subscription covers enrichment costs
- Unlimited contacts per run
- Unlimited scoring models
- Full CSV export
- AI message generation (custom templates + tone/goal control)
- LinkedIn message delivery automation
- Team sharing — up to 3 seats
- Delivery status tracking (sent / failed counts)

### Enterprise — custom pricing
- BYOK required (platform will not absorb enrichment at enterprise scale)
- Unlimited contacts per run
- Unlimited models
- Full CSV export
- AI message generation
- LinkedIn message delivery automation
- Unlimited team seats + role management
- CRM integrations (HubSpot, Salesforce)
- API access (programmatic runs + results retrieval)
- SSO (SAML/OIDC)
- White-label option
- Dedicated support + SLA

---

## Pricing Rationale

| Plan | Monthly revenue | Enrichment cost | Margin |
|------|----------------|-----------------|--------|
| Free | $0 | $0 (user's API) | — |
| Starter | $29 | Platform-managed (subscription covers cost) | ~$29 |
| Pro | $49 | Platform-managed (subscription covers cost) | ~$49 |
| Managed credit (Standard 500-pack) | $25 | ~$10–15 (ConnectSafely cost) | ~$10–15 per pack |

Pro was reduced from $79 → $49 because the value prop is now the scoring/export/messaging layer, not enrichment (which is BYOK). This makes the price more competitive while restoring full margin.

---

## Feature Gate Summary

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Enrichment | Platform-managed | Platform-managed | Platform-managed | Platform-managed |
| Contacts per run | 50 (hard cap) | Unlimited | Unlimited | Unlimited |
| Active models | 1 | 5 | Unlimited | Unlimited |
| CSV export | Top 10 preview | Full | Full | Full |
| AI suggestions | Basic | Basic | Custom | Custom |
| AI message gen | — | Basic | Custom | Custom |
| LinkedIn delivery | — | — | Yes | Yes |
| Delivery status tracking | — | — | Yes | Yes |
| Team seats | 1 | 1 | 3 | Unlimited |
| Managed credit packs | — | Yes | Yes | — |
| CRM export | — | — | — | Yes |
| API access | — | — | — | Yes |
| SSO | — | — | — | Yes |
| White-label | — | — | — | Optional |

---

## Upgrade Gates

1. **Free 50-contact cap hit** — "You've reached the free run limit (50 contacts). Upgrade to Starter for unlimited runs."
2. **Model limit hit** — shown inline in the Save Model modal: "You've reached your 1-model limit on the free plan. Upgrade to Starter to save up to 5 models." with link to `/settings/billing`.
3. **Export full results (free)** — Free users receive a top-10 CSV with a hint: "Free plan: top 10 contacts. Upgrade for all." The button always triggers a download — no modal gate.
4. **AI message generation click (free)** — "AI messages are available on Starter and above."
5. **Missing ConnectSafely credentials (delivery)** — "Add your ConnectSafely API key in Settings → Integrations to start sending messages." (delivery-only gate — does not affect enrichment)
6. **Delivery scheduler click (free/starter)** — "Delivery automation is available on Pro and above."
7. **Invite teammate click (free/starter)** — "Team sharing is available on Pro and above."

---

## Trial Flow

- New users start on Free automatically (no card required)
- Pro trial: 14-day free trial on Pro triggered by first upgrade CTA click (card required to start)
- Trial expiry: downgrades to Free; existing runs/models preserved; quota enforced

---

## Key User Journeys

### Journey 1 — Quick Score (Anonymous)
1. Land on homepage — no sign-in required
2. Upload CSV (≤50 contacts)
3. **Pre-enrichment choice:** "Wait here" or "Notify me by email" — choose wait
4. Watch enrichment progress in real time
5. **Results gate** shown at `/run/:id/score`: enter email → results revealed immediately + magic link sent
6. Configure scoring criteria (manual or AI-suggested)
7. View ranked results at `/run/:id/results`
8. **Save model** — "Sign in to save" button (email known from gate) → one click sends magic link → check inbox → click → account activated → save enabled
9. Hit export CTA → upgrade gate (Starter required)

### Journey 2 — Power User (Pro)
1. Sign in (or sign in prompted on first persistent action)
2. Upload CSV (large list), choose "Notify me by email" — email pre-filled from session
3. Navigate away; receive "results ready" email when enrichment completes
4. Click "View my results" link in email → score at `/run/:id/score`
5. Redirected to `/run/:id/results` → already authenticated → "Save as model" available immediately
6. Load scoring model, export full CSV
7. Generate AI messages for top 100 contacts
8. Schedule LinkedIn delivery campaign (requires ConnectSafely API key in Settings → Integrations)

### Journey 3 — Managed Credits (Starter, no ConnectSafely account)
1. Sign up, upgrade to Starter
2. Buy a 500-credit pack ($25)
3. Upload CSV — enrichment draws from credit balance
4. Credits counter shown in header ("423 / 500 credits remaining")
5. On credit exhaustion: prompt to buy another pack or connect own ConnectSafely account

---

## Assumptions

- BYOK credentials stored encrypted at rest (`ENCRYPTION_KEY` env var, AES-256)
- ConnectSafely credentials are per-org (not per-user within the org)
- Managed credit packs are purchased via Lemon Squeezy one-time products (not subscriptions)
- Free tier hard cap of 50 contacts/run is enforced even with BYOK (platform-level limit)
- Authentication uses NextAuth.js magic-link email — no OAuth providers in v1
- CRM integrations and API access are scoped to Enterprise and will be specced separately
