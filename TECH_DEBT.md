# Tech Debt & Refactoring Backlog

---

## enrich/route.ts

### TD-01 — Centralize session resolution
Session is resolved inline at the top of the POST handler. The entire app resolves session ad-hoc in every route/page. There should be a single helper (e.g. `app/lib/session.ts`) that wraps `auth()`, returns a typed object with the user's `id`, `orgId`, `plan`, and any other commonly accessed fields, and is used app-wide as the canonical way to obtain session context.

### TD-02 — Encapsulate quota resolution in quota lib
The enrich route manually resolves the org's `managedCreditsBalance`, fetches plan limits, and performs the quota check inline. This logic should live in `app/lib/quota.ts` as a helper (e.g. `resolveQuota(session)`) that returns `{ plan, limits, creditsBalance, isFree }` — so the route only calls one function and acts on the result, rather than orchestrating the DB fetch itself.

### TD-03 — Soft-cap banner is never visible
The `capped` SSE event sets `cappedInfo` in `EnrichmentProgress`, which renders an amber banner. However, when enrichment completes, `onComplete(runId)` fires and the parent immediately navigates to the score page — the banner is never seen.

**Correct fix:** Add `originalTotalContacts Int? @map("original_total_contacts")` to the `Run` schema. In the enrich route, record `rows.length` on the Run before the cap truncation. On the score page, compare `run.originalTotalContacts` vs `run.totalContacts` — if the original is greater, a cap occurred and the notice should be shown inline on that page. This derives the message from real persisted data, not from transient transport state.

**Do not** pass `capped=1` or the original count as URL query params. URL params are not a source of truth — they are an artificial message that does not represent the underlying reality and can be spoofed, stale, or lost on navigation.
