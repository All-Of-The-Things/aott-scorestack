# Scorestack — UI Specification (Growth)

## Design Principles

- Existing Tailwind design language and colour palette remain unchanged
- Gates are surfaced as modals — never as broken/disabled states without explanation
- Usage quota is always visible to logged-in users
- Enrichment is always async — submit and navigate away; no live-watching option

---

## New / Modified Screens

---

### 1. Auth — Sign In / Sign Up (`/auth/signin`)

**Layout:** Centered card, 400px max-width, full-height background.

**Content:**
- Scorestack logo + tagline
- Single input: email address
- CTA button: "Send magic link"
- Supporting copy: "We'll email you a sign-in link. No password needed."
- On submit: show "Check your inbox" confirmation state with email address displayed

**States:**
- Default → email input
- Submitting → spinner on button, input disabled
- Sent → green checkmark, "Magic link sent to {email}. Check your spam if you don't see it."
- Error → red inline error
- **Already authenticated** → server-side `redirect(callbackUrl)` immediately, form never shown

**Notes:**
- No sign-up page — first sign-in creates the account automatically.
- `SignInForm` sets an `auth_next` cookie (`encodeURIComponent(destination); max-age=600; SameSite=Lax`) AND sends the magic link with `callbackUrl: '/auth/confirmed?next=<encodedDestination>'`. The destination is in both places: the cookie works for same-browser flows; the URL param works when the email is opened on a different device.
- If a session already exists: server component `redirect(destination)` immediately — form never shown.
- `/auth/verified` still exists for `SaveModelButton`'s direct-to-NextAuth callbackUrl path (passes `next` as query param). It decodes `searchParams.next` before the `startsWith('/')` guard.

---

### 1b. Auth Confirmation (`/auth/confirmed`)

**Shown:** Immediately after a magic link is clicked and the session is created. Every sign-in flows through this page — direct and notify-me.

**Layout:** Centered card, max-w-sm, same visual language as the sign-in page.

**Content:**
- Green checkmark icon
- Heading: "You're signed in"
- Sub-copy: "Signed in as {email}"
- Progress bar animating over 2.5s → auto-redirects to `next` param on completion
- "Continue →" link for immediate navigation without waiting

**Server component (`page.tsx`):**
- Reads `next` from `searchParams.next` (URL param from `callbackUrl`); falls back to `auth_next` cookie; default `/`. Both paths sanitise to relative paths only (open-redirect guard: `startsWith('/')`)
- If no session: `redirect('/auth/signin')` (magic link expired or already used)
- If session: render `ConfirmedClient` with `{ email, next }`

**Client component (`ConfirmedClient.tsx`):**
- `useEffect` with 2500ms timeout → `router.push(next)`
- Progress bar uses a CSS `@keyframes grow` animation timed to match the delay

---

### 2. Onboarding (`/onboarding`) — **Removed**

The workspace naming concept has been removed. There is no onboarding step.

`/onboarding` is a stub that `redirect('/')` — kept only for backward-compatibility with any existing links. Orgs are bootstrapped automatically in the `signIn` callback; `orgName` is an internal DB default (`"My Workspace"`) never shown to users.

**Future plan:** Replace with a company LinkedIn URL input in org settings, used to provide scoring context to the AI model.

---

### 3. Home Page — modifications (`/`)

**Auth state — logged out:**
- Existing hero + upload form remain
- Add: "Sign in" link in top-right nav

**Auth state — logged in:**
- Add persistent **usage banner** (see component below)
- Add user email + plan badge + dropdown in nav (plan settings, sign out)
- Existing upload form + saved models sidebar remain

---

### 4. Usage Banner (global component)

**Position:** Below the main nav, above page content. Present on all authenticated pages.

**Content by plan:**

- **Free:** `"Free plan · 50 contacts per run"` + "Upgrade →" link. No progress bar — limit is per-run, not cumulative.
- **Starter / Pro:** Credit balance bar showing `managedCreditsBalance` remaining. Colour thresholds: green > 200, amber 51–200, red ≤ 50. Bar width = `balance / 500`. "Buy more →" link to `/settings/billing`.
- **Enterprise:** Hidden (returns null).

Credit balance represents managed credit packs purchased on top of the monthly subscription — subscription covers enrichment, but purchased packs accumulate in `managedCreditsBalance` and are shown here.

---

### 5. Pre-Enrichment Confirm + Enrichment Submitted

All enrichment is asynchronous. There is no "Wait here" option.

**Pre-enrichment confirm screen** (`EnrichmentConfirm` component) — shown between upload confirmation and enrichment start:

```
┌─────────────────────────────────────────────────────┐
│  contacts.csv                                       │
│  Ready to enrich                                    │
│                                                     │
│  Notify me when done                                │
│  [ you@example.com              ]                   │
│                                                     │
│  [ Start enrichment → ]                             │
└─────────────────────────────────────────────────────┘
```

- Email input pre-filled from `session.user.email` if authenticated; always required
- On submit: `POST /api/enrich` → returns `{ run_id }` → transitions to `submitted` stage
- Submit button disabled while request is in flight; shows spinner

**Enrichment submitted screen** (`EnrichmentSubmitted` component):

```
┌─────────────────────────────────────────────────────┐
│  ✓                                                  │
│  Enrichment started                                 │
│  We'll email you@example.com when results are ready │
│                                                     │
│  View all enrichments →   (/runs)                   │
└─────────────────────────────────────────────────────┘
```

- Static confirmation card — no polling on this screen
- "View all enrichments →" links to `/runs`
- "Start another enrichment" secondary link resets to upload stage

**Completion email** (sent by server when enrichment finishes):
- **Single CTA: "Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:runId/score`
- No direct results link — clicking the sign-in link verifies the user and grants a session in one step

**Run detail status view** (nice-to-have, `/run/:runId`):
- If user navigates to a run while `status` is `pending` or `enriching`:
  - Show spinner + "Enriching… {enrichedCount} / {totalContacts} contacts processed"
  - Poll `/api/runs/:runId/status` every 5s
  - Show partial results table as `RunResult` rows arrive
  - When `status === 'scoring'`: show "Ready to score →" CTA to `/run/:runId/score`

---

### 6. Results Page — modifications (`/run/[runId]/results`)

**Session required.** Unauthenticated visitors see an inline sign-in prompt (not a redirect):
- Lock icon + "Sign in to view results" heading
- Copy: "Scored contact lists are private. Sign in to access your ranked results and save scoring models."
- "Sign in →" CTA → `/auth/signin?callbackUrl=/run/:runId/results`
- Note: "No account yet? Signing in creates one automatically."

**Save as model button** (`SaveModelButton`) — authenticated state only:

| State | Condition | Behaviour |
|-------|-----------|-----------|
| "Save as model" (blue pill) | Authenticated | Opens `SaveModelModal` |
| "Saved as {name}" (green pill, checkmark) | Model already saved | Read-only confirmation |

**Activation banner** — shown when `?activated=1` is in the URL:
- Green banner: "Account activated — you can now save scoring models and reuse them on future uploads."
- Auto-removes `?activated=1` from the URL via `router.replace`.

**Model limit gate** — when `POST /api/models` returns 409:
- `SaveModelModal` fires `onLimitReached` callback + closes itself
- `SaveModelButton` opens `UpgradeModal` with `trigger="You've reached your model limit"` and `requiredPlan="starter"`

**New: Pagination (`ResultsTable`)**

Pagination controls appear at the top (between card header and table) and bottom (after table) when `results.length > pageSize`. Both positions use the shared `PaginationBar` sub-component.

- Default page size: read from `RESULTS_PAGE_SIZE` env var (server-side), defaults to `25`. Passed as `defaultPageSize` prop.
- User-selectable: 25 / 50 / 100 rows per page. Changing page size resets to page 1.
- Counter: `"{start+1}–{end} of {total}"` displayed between prev/next arrows.
- Header always shows total contact count regardless of current page.

**New: Export button (`ExportButton`)**

Position: Left side of the actions row above the results card (alongside "Save as model" on the right).

- All tiers see the "Export CSV" button — no lock icon, no `UpgradeModal`.
- **Free tier:** Downloads top 10 enriched contacts (`_top10` suffix in filename). Hint text below button: `"Free plan: top 10 contacts. Upgrade for all."` with link to `/settings/billing`.
- **Paid tier:** Downloads all enriched contacts. No hint text.
- Trigger: `document.createElement('a')` with `href = /api/runs/:runId/export` — browser-native file download, no `fetch` + Blob URL dance.
- Loading state: button label changes to `"Preparing…"` for 1.5s after click.

**New: Messages tab**

Add a tab bar below the run summary:

```
[ Scores ]  [ Messages ]
```

**Scores tab:** Existing `ResultsTable` component (unchanged).

**Messages tab:** See component below.

---

### 7. Messages Tab (within Results page)

**Layout:** Full-width panel below the tab bar.

**State A — no messages generated yet:**
```
┌──────────────────────────────────────────────────────────────┐
│  Generate personalised outreach messages for your contacts.  │
│                                                              │
│  Template:  [Select or create template ▼]                   │
│  Generate for: [Top 50 ▼]  [Generate messages]              │
│                                                              │
│  (locked on Free with upgrade CTA)                          │
└──────────────────────────────────────────────────────────────┘
```

**State B — messages generated:**
- Table with columns: rank, name, subject (if email), message preview (truncated), actions
- Each row: "View/Edit" expander → shows full message with editable textarea
- Inline edit saves to `GeneratedMessage.editedBody`
- "Regenerate" button per row (replaces message)
- Bulk action bar: "Schedule delivery" button (opens DeliveryScheduler modal)

**Template selector:**
- Dropdown listing org's saved templates
- "Create new template" option → opens `MessageTemplateModal`

**MessageTemplateModal:**
- Fields: Name, Tone (dropdown: professional / friendly / direct / casual), Goal (text: "book a call", "share a resource", etc.), System prompt (textarea, shown for Pro+, hidden for Starter with placeholder defaults)
- Save → POST /api/messages/templates

---

### 8. Delivery Scheduler Modal

**Triggered from:** "Schedule delivery" button in Messages tab.

**Single step — LinkedIn via LinkedAPI:**
```
┌─────────────────────────────────────────────────────┐
│  Send LinkedIn messages                             │
│                                                     │
│  Contacts:  47 messages ready to send              │
│  Channel:   LinkedIn (via your LinkedAPI account)  │
│                                                     │
│  Send time:  ● Send now                            │
│              ○ Schedule for  [date/time picker]    │
│                                                     │
│  [Cancel]              [Create delivery job]       │
└─────────────────────────────────────────────────────┘
```

- No credentials to enter — LinkedAPI keys are shared with enrichment (server-side env vars)
- Contact count shown is the number of `GeneratedMessage` rows in the selected run with `deliveryStatus = 'pending'`
- Optional contact filter: "Top 50 by score" / "All" dropdown

**On success:** Show confirmation banner with link to Delivery Jobs page.

---

### 9. Delivery Jobs Page (`/delivery`)

**Layout:** Table listing all delivery jobs for the org.

**Columns:** Run name, channel (email/LinkedIn icon), status badge, contacts, sent, failed, scheduled/started at, actions.

**Status badges:**
- scheduled → grey
- running → blue with spinner
- complete → green
- failed → red
- cancelled → grey strikethrough

**Actions per row:**
- View details → expand row to show per-message status
- Cancel (if scheduled/running) → confirm dialog → DELETE /api/delivery/jobs/:id

**Live updates:** Poll `/api/delivery/jobs/:id` every 10s for running jobs.

---

### 10. Settings — Billing (`/settings/billing`)

**Layout:** Two-column: plan summary left, usage details right.

**Content:**
- Current plan name + price
- **Free plan:** "50 contacts per run limit" — no bar, just text + "Upgrade to Starter" CTA
- **Starter / Pro plan:** Credit balance bar — "{managedCreditsBalance} enrichment credits remaining" + "Buy more credits →" (opens credit pack selector). Thresholds: green > 200, amber 51–200, red ≤ 50.
- **Enterprise:** No credit bar
- "Upgrade" / "Change plan" CTA → Lemon Squeezy hosted checkout
- "Manage invoices & payment methods" → Lemon Squeezy Customer Portal. Shown as an active button when `lsCustomerId` is set; shown as a dashed disabled row with a "Soon" badge when `lsCustomerId` is null (brief window before `subscription_created` webhook fires).
- Credit packs section: hidden unless `ENABLE_CREDITS=true`. When enabled, renders pack buttons dynamically from `fetchCreditPacks()` — name and price come from LS variants of `LEMONSQUEEZY_CREDITS_PRODUCT_ID`. Variant naming convention: `"N Credits"` (leading number = credit count).
- Subscription status badge (active / trialing / past_due)
- Renewal date (from `Subscription.currentPeriodEnd`; hidden on Free)

**Post-checkout confirmation page** (`/settings/billing/confirmation`):
- Lemon Squeezy redirects here after payment (no query params — PendingCheckout pattern)
- Shows: green checkmark, "Welcome to {plan}!" heading, feature highlights list
- CTAs: "Go to dashboard" + "View billing settings"

---

### 11. Settings — Team (`/settings/team`)

**Layout:** Members list + invite form.

**Members list:**
- Avatar, name, email, role badge (admin / member)
- "Remove" button (admin only, cannot remove self)

**Invite form:**
- Email input + role select (member / admin)
- CTA: "Send invite"
- On success: "Invite sent to {email}"

**Seat counter:** "2 / 3 seats used" shown above the invite form. If at limit: form disabled with upgrade CTA.

**Locked state (Free / Starter):**
- Section shows "Team sharing is available on Pro and above"
- Upgrade CTA

---

### 12. Upgrade Modal (global component)

**Triggered by:** Any gated feature interaction.

**Layout:** Full-screen overlay, centred card.

**Content:**
- Heading based on trigger: "Export your full results", "Generate AI messages", "Automate outreach delivery", "Invite your team"
- Plan comparison table (3 columns: Free / Starter / Pro), feature rows highlighted based on trigger
- CTA: "Start Starter — $29/mo" or "Start Pro — $49/mo" or "Start Pro trial (14 days free)"
- Dismiss: "Maybe later" link

**On CTA click:**
1. Call `POST /api/billing/checkout { plan }`
2. Redirect to returned `checkout_url`

---

## Navigation Structure

```
Top nav (authenticated):
  [Logo]  [model pill?]  [email  Plan-badge ▼]
                                └─ {email}  [Plan-badge]    ← header row
                                └─ Plan settings → /settings/billing
                                └─ Sign out

Dropdown behaviour:
  - Desktop: opens on mouseenter, closes on mouseleave (hover)
  - Mobile: opens/closes on click (onClick toggle); closes on click-outside (mousedown listener)

Main flows:
  /                     Home (upload + models)
  /run/:id/score        Criteria builder
  /run/:id/results      Results + Messages tabs
  /delivery             Delivery jobs
  /settings/billing     Billing
  /settings/team        Team management
  /auth/signin          Sign in
  /auth/confirmed       Post-login confirmation (reads next from URL param, cookie fallback)
  /auth/verified        SaveModelButton direct-to-NextAuth redirect landing
  /settings/billing/confirmation  Post-checkout confirmation (PendingCheckout pattern)
  /onboarding           Stub — redirect('/') only

Error pages (app router root):
  app/error.tsx         Root error boundary — catches unhandled server component exceptions
  app/not-found.tsx     Custom 404 page — shown for notFound() calls or unknown routes
```

---

## Component List (new / modified)

| Component | File | Status |
|-----------|------|--------|
| AppHeader | `app/components/AppHeader.tsx` | ✅ Built — `plan` prop, plan badge, hover+click dropdown (Plan settings / Sign out) |
| EnrichmentChoice | `app/components/EnrichmentChoice.tsx` | ✅ Built — pre-enrichment two-path screen |
| EnrichmentProgress | `app/components/EnrichmentProgress.tsx` | ✅ Built — `notifyEmail` prop, confirmation banner |
| EmailGate | `app/components/EmailGate.tsx` | ⚠️ Retired — soft email gate replaced by session requirement |
| NotificationCheckGate | `app/components/NotificationCheckGate.tsx` | ⚠️ Retired — replaced by session gate on score/results pages |
| WorkspaceNamePrompt | `app/components/WorkspaceNamePrompt.tsx` | ❌ Removed — workspace concept removed |
| SaveModelButton | `app/components/SaveModelButton.tsx` | ✅ Built — authenticated state; router.refresh() after save; UpgradeModal on limit |
| SaveModelModal | `app/components/SaveModelModal.tsx` | ✅ Built — calls onLimitReached callback on 409 |
| ActivationBanner | `app/components/ActivationBanner.tsx` | ✅ Built — shown on `?activated=1`, cleans URL |
| UsageBanner | `app/components/UsageBanner.tsx` | ✅ Built — free plan pill; paid plan credit balance bar |
| UpgradeModal | `app/components/UpgradeModal.tsx` | ✅ Built — plan comparison table + checkout CTA |
| BillingCTAs | `app/settings/billing/BillingCTAs.tsx` | ✅ Built — plan selector, portal link (+ "Soon" state), dynamic credit packs via `creditPacks` prop (feature-flagged) |
| ExportButton | `app/components/ExportButton.tsx` | ✅ Built — free top-10 hint, paid full export, 1.5s loading state |
| MessagesTab | `app/components/MessagesTab.tsx` | Not started |
| MessageTemplateModal | `app/components/MessageTemplateModal.tsx` | Not started |
| DeliverySchedulerModal | `app/components/DeliverySchedulerModal.tsx` | Not started |
| ResultsTable | `app/components/ResultsTable.tsx` | ✅ Built — pagination (top + bottom PaginationBar, RESULTS_PAGE_SIZE env var, 25/50/100 options); Needs: tab bar |
