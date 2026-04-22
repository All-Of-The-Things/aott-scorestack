# Scorestack — UI Specification (Growth)

## Design Principles

- Existing Tailwind design language and colour palette remain unchanged
- Gates are surfaced as modals — never as broken/disabled states without explanation
- Usage quota is always visible to logged-in users
- Deferred enrichment path is presented as a first-class choice, not a fallback

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
- **Starter / Pro:** `"{managedCreditsBalance} enrichment credits remaining"` + "Buy more →" link → `/settings/billing`. Progress bar: green if > 200, amber if 51–200, red if ≤ 50.
- **Enterprise:** Hidden — no credit cap.

No `resetDate` or `contactsUsedThisMonth` — the quota model uses a per-run cap (free) or a pre-purchased credit balance (paid), neither of which resets on a schedule.

---

### 5. Pre-Enrichment Choice + Enrichment Progress

**Pre-enrichment choice screen** (`EnrichmentChoice` component) — shown between upload confirmation and enrichment start (NOT during enrichment):

```
┌─────────────────────────────────────────────────────┐
│  contacts.csv                                       │
│  Ready to enrich — how would you like to proceed?  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  Wait here                                  │   │
│  │  Stay on this page and watch progress       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  Notify me by email                         │   │
│  │  Start in background, email me when ready   │   │
│  │  [ you@example.com ] [Start & notify]       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

- "Wait here" immediately transitions to `EnrichmentProgress` (SSE stream starts)
- "Notify me" expands email input on click → submit passes `notify_email` in `POST /api/enrich` → transitions to `EnrichmentProgress`
- `EnrichmentProgress` shows bottom banner when `notifyEmail` prop is set: "We'll email {email} when results are ready. You can safely close this tab."

**In-browser completion (browser still open, user unauthenticated):**
- When the SSE `complete` event fires and `notifyEmail` is set (user is not signed in):
  - Client sets `auth_next` cookie to `/run/:runId/score`
  - Client calls `signIn('resend', { email: notifyEmail, redirect: false })` silently
  - Transitions to `link-sent` stage:
    - Green envelope icon
    - Heading: "Check your inbox"
    - Copy: "Enrichment complete! We sent a sign-in link to {notifyEmail}. Click it to score your contacts."
    - "Didn't receive it? Start over" link
  - No second email prompt — the email from `EnrichmentChoice` is reused

**Completion email** (sent by server when enrichment finishes with `notifyEmail` set — covers the "navigated away" case):
- **Single CTA: "Sign in to view your results →"** → `/auth/signin?callbackUrl=/run/:runId/score`
- No direct results link — clicking the sign-in link verifies the user and grants a session in one step

**Polling fallback (returning user):**
- If user navigates to `/run/:runId` while status is `enriching`:
  - Show spinner + "Still enriching… {enrichedCount} / {totalContacts} processed"
  - Poll `/api/runs/:runId/status` every 5s
  - On `status === 'complete'`: auto-redirect to `/run/:runId/score`

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

**Model limit gate** — shown inside `SaveModelModal` (not as a modal replacement) when `POST /api/models` returns 409:
- Amber block: "You've reached your {limit}-model limit on the {plan} plan. Upgrade to Starter to save up to 5 models."
- Link to `/settings/billing`
- Save button disabled

**New: Export button**

Position: Top-right of results section, alongside "Save as model".

- **Free tier:** Button labelled "Export CSV" with a lock icon. On click: opens `UpgradeModal` for Starter.
- **Paid tier:** Button labelled "Export CSV". On click: triggers `GET /api/runs/:runId/export` file download.
  - Optional dropdown: "Top 50", "Top 100", "All" (only if > 100 results).

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
- "Manage invoices & payment methods" → Lemon Squeezy Customer Portal
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
| SaveModelButton | `app/components/SaveModelButton.tsx` | ✅ Built — authenticated state only |
| SaveModelModal | `app/components/SaveModelModal.tsx` | ✅ Built — 409 upgrade prompt inline |
| ActivationBanner | `app/components/ActivationBanner.tsx` | ✅ Built — shown on `?activated=1`, cleans URL |
| UsageBanner | `app/components/UsageBanner.tsx` | Not started |
| UpgradeModal | `app/components/UpgradeModal.tsx` | ✅ Built — plan comparison table + checkout CTA |
| BillingCTAs | `app/settings/billing/BillingCTAs.tsx` | ✅ Built — plan selector, portal link, credit packs |
| ExportButton | `app/components/ExportButton.tsx` | Not started |
| MessagesTab | `app/components/MessagesTab.tsx` | Not started |
| MessageTemplateModal | `app/components/MessageTemplateModal.tsx` | Not started |
| DeliverySchedulerModal | `app/components/DeliverySchedulerModal.tsx` | Not started |
| ResultsTable | `app/components/ResultsTable.tsx` | Needs: export btn + tab bar |
