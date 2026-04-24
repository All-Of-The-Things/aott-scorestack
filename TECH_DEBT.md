# Tech Debt & Refactoring Backlog

---

## enrich/route.ts

### TD-01 — Centralize session resolution
Session is resolved inline at the top of the POST handler. The entire app resolves session ad-hoc in every route/page. There should be a single helper (e.g. `app/lib/session.ts`) that wraps `auth()`, returns a typed object with the user's `id`, `orgId`, `plan`, and any other commonly accessed fields, and is used app-wide as the canonical way to obtain session context.

### TD-02 — Encapsulate quota resolution in quota lib
The enrich route manually resolves the org's `managedCreditsBalance`, fetches plan limits, and performs the quota check inline. This logic should live in `app/lib/quota.ts` as a helper (e.g. `resolveQuota(session)`) that returns `{ plan, limits, creditsBalance, isFree }` — so the route only calls one function and acts on the result, rather than orchestrating the DB fetch itself.

### ~~TD-03 — Soft-cap banner is never visible~~ ✅ RESOLVED

**Resolution:** `originalTotalContacts Int? @map("original_total_contacts")` added to `Run` schema. The enrich route sets it to `rows.length` before any truncation; `totalContacts` is then updated to the capped value. Two surfaces now derive the cap state from DB:

1. **`EnrichmentProgress`** — on SSE `complete`, if a `capped` event was received during the stream, navigation is held and a `'cap-notice'` interstitial renders with "Continue to scoring →". This gives users immediate feedback before leaving the enrichment screen.
2. **Score page** — `wasCapped = run.originalTotalContacts > run.totalContacts` shows a persistent amber banner in the aside, visible on direct links and refreshes.

No URL params used anywhere in this flow.
