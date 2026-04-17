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
- No sign-up page — first sign-in creates the account automatically
- `SignInForm` wraps the `callbackUrl` through `/auth/confirmed?next=<callbackUrl>` before calling `signIn()`. This routes every magic-link sign-in through the confirmation page.
- The page is a server component: `auth()` is called before rendering. If a session exists, the user is redirected straight to `callbackUrl` (bypasses the confirmation page — they're already signed in).

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
- Reads `next` query param; sanitises to relative paths only (open-redirect guard)
- If no session: `redirect('/auth/signin?callbackUrl=<next>')` (magic link expired or already used)
- If session: render `ConfirmedClient` with `{ email, next }`

**Client component (`ConfirmedClient.tsx`):**
- `useEffect` with 2500ms timeout → `router.push(next)`
- Progress bar uses a CSS `@keyframes grow` animation timed to match the delay

---

### 2. Onboarding (`/onboarding`)

**Trigger:** `session.user.orgName === "My Workspace"`. Auth-required server components render `<WorkspaceNamePrompt>` as a fixed overlay (`z-50`) on the current page — the user never navigates away. `router.refresh()` after a successful `PATCH /api/org` re-runs the server component, the session callback fetches the updated `orgName` from DB, and the overlay unmounts. `/onboarding` exists as a standalone fallback for direct navigation only.

**Layout:** Centered card, max-w-sm, same visual language as the sign-in page.

**Content:**
- Heading: "Name your workspace"
- Sub-copy: "This is how your team and scoring models will be labelled."
- Text input — label: "Workspace name", placeholder: derived from email domain (e.g. `martin@acme.com` → `"Acme"`)
- CTA button: "Get started"
- States: Default → Submitting → overlay dismissed via `router.refresh()`

**Validation:** Non-empty, ≤ 80 characters.

**On submit:** `PATCH /api/org { name }` → on 200: `router.refresh()` (inline) or `router.push(callbackUrl)` (standalone page).

---

### 3. Home Page — modifications (`/`)

**Auth state — logged out:**
- Existing hero + upload form remain
- Add: "Sign in" link in top-right nav

**Auth state — logged in:**
- Add persistent **usage banner** (see component below)
- Add user avatar / email + dropdown in nav (sign out, settings)
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

**Completion email** (sent by server when enrichment finishes with `notifyEmail` set):
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
- Usage bar (contacts this month)
- "Upgrade" / "Change plan" CTA → Stripe Checkout
- "Manage invoices & payment methods" → Stripe Portal
- Subscription status badge (active / trialing / past due)
- Renewal date

**Success state (after Stripe redirect):**
- Green banner: "You're now on the {plan} plan. Enjoy!"

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
- CTA: "Start Starter — $29/mo" or "Start Pro — $79/mo" or "Start Pro trial (14 days free)"
- Dismiss: "Maybe later" link

**On CTA click:**
1. Call `POST /api/billing/checkout { plan }`
2. Redirect to returned `checkout_url`

---

## Navigation Structure

```
Top nav (authenticated):
  [Logo]  [Usage banner]  [Settings ▼]  [User avatar ▼]
                                          └─ Billing
                                          └─ Team
                                          └─ Sign out

Main flows:
  /                     Home (upload + models)
  /run/:id/score        Criteria builder
  /run/:id/results      Results + Messages tabs
  /delivery             Delivery jobs
  /settings/billing     Billing
  /settings/team        Team management
  /auth/signin          Sign in
  /auth/confirmed       Post-login confirmation (auto-redirects to next)
  /onboarding           First-run workspace setup (standalone fallback)
```

---

## Component List (new / modified)

| Component | File | Status |
|-----------|------|--------|
| EnrichmentChoice | `app/components/EnrichmentChoice.tsx` | ✅ Built — pre-enrichment two-path screen |
| EnrichmentProgress | `app/components/EnrichmentProgress.tsx` | ✅ Built — `notifyEmail` prop, confirmation banner |
| EmailGate | `app/components/EmailGate.tsx` | ⚠️ Retired — soft email gate replaced by session requirement |
| NotificationCheckGate | `app/components/NotificationCheckGate.tsx` | ⚠️ Retired — replaced by session gate on score/results pages |
| WorkspaceNamePrompt | `app/components/WorkspaceNamePrompt.tsx` | ✅ Built — fixed overlay; `router.refresh()` on submit |
| SaveModelButton | `app/components/SaveModelButton.tsx` | ✅ Built — authenticated state only |
| SaveModelModal | `app/components/SaveModelModal.tsx` | ✅ Built — 409 upgrade prompt inline |
| ActivationBanner | `app/components/ActivationBanner.tsx` | ✅ Built — shown on `?activated=1`, cleans URL |
| UsageBanner | `app/components/UsageBanner.tsx` | Not started |
| UpgradeModal | `app/components/UpgradeModal.tsx` | Not started |
| ExportButton | `app/components/ExportButton.tsx` | Not started |
| MessagesTab | `app/components/MessagesTab.tsx` | Not started |
| MessageTemplateModal | `app/components/MessageTemplateModal.tsx` | Not started |
| DeliverySchedulerModal | `app/components/DeliverySchedulerModal.tsx` | Not started |
| ResultsTable | `app/components/ResultsTable.tsx` | Needs: export btn + tab bar |
