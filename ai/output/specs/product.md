# Scorestack — Product Specification (Growth)

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

## Pricing Tiers

### Free
- 50 contacts per run
- 1 active scoring model
- No CSV export (top-10 preview only, watermarked)
- No AI message generation
- No delivery automation
- No team sharing
- Single user

### Starter — $29 / month
- 500 contacts per run
- 5 active scoring models
- Full CSV export (scores + enriched fields)
- AI message generation (basic templates)
- No delivery automation
- No team sharing
- Single user

### Pro — $79 / month
- 2,000 contacts per run
- Unlimited scoring models
- Full CSV export
- AI message generation (custom templates + tone/goal control)
- LinkedIn message delivery automation (via LinkedAPI)
- Team sharing — up to 3 seats
- Delivery status tracking (sent / failed counts)

### Enterprise — custom pricing
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

## Feature Gate Summary

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Contacts per run | 50 | 500 | 2,000 | Unlimited |
| Active models | 1 | 5 | Unlimited | Unlimited |
| CSV export | — | Full | Full | Full |
| AI suggestions | Basic | Basic | Custom | Custom |
| AI message gen | — | Basic | Custom | Custom |
| LinkedIn delivery | — | — | Yes | Yes |
| Delivery status tracking | — | — | Yes | Yes |
| Team seats | 1 | 1 | 3 | Unlimited |
| CRM export | — | — | — | Yes |
| API access | — | — | — | Yes |
| SSO | — | — | — | Yes |
| White-label | — | — | — | Optional |

---

## Upgrade Gates

Gate triggers shown to the user:

1. **Quota hit at enrich step** — "You've reached your 50-contact limit. Upgrade to Starter for 500 contacts/run."
2. **Export button click (free)** — "Export is available on Starter and above."
3. **AI message generation click (free)** — "AI messages are available on Starter and above."
4. **Delivery scheduler click (free/starter)** — "Delivery automation is available on Pro and above."
5. **Invite teammate click (free/starter)** — "Team sharing is available on Pro and above."
6. **Model limit hit** — "You've reached your 1-model limit. Upgrade to Starter for 5 models."

Each gate shows a modal with plan comparison and a Lemon Squeezy checkout CTA.

---

## Trial Flow

- New users start on Free automatically (no card required)
- Pro trial: 14-day free trial on Pro triggered by first upgrade CTA click (card required to start)
- Trial expiry: downgrades to Free; existing runs/models are preserved but quota enforced

---

## Key User Journeys

### Journey 1 — Quick Score (Free, single user)
1. Sign up via magic-link email
2. Upload CSV (≤50 contacts)
3. Wait for enrichment OR opt into "notify me" and return later
4. Configure scoring criteria (manual or AI-suggested)
5. View ranked results
6. Hit export CTA → upgrade gate shown

### Journey 2 — Power User (Pro, single user)
1. Sign in
2. Upload CSV (up to 2,000 contacts), choose "notify me"
3. Receive email when enrichment complete
4. Load scoring model from previous run
5. View ranked results
6. Export full CSV
7. Generate AI messages for top 100 contacts
8. Schedule LinkedIn message delivery campaign

### Journey 3 — Team Use (Pro, 3 seats)
1. Admin creates org, invites 2 teammates
2. Each member uploads their own CSV
3. All share the same scoring models
4. Admin reviews results across runs
5. Admin schedules delivery for approved list

---

## Assumptions

- LinkedIn enrichment is powered by the existing @linkedapi/node SDK; quota limits apply to contacts enriched (not uploaded)
- Message delivery uses LinkedAPI's messaging workflow (same SDK, same credentials as enrichment — no additional service needed)
- Billing is handled by Lemon Squeezy (Merchant of Record), chosen because it supports Uruguay-based sellers with no US bank account required; payouts via PayPal/Wise/bank transfer
- Authentication uses NextAuth.js magic-link email — no OAuth providers in v1
- CRM integrations and API access are scoped to Enterprise and will be specced separately
