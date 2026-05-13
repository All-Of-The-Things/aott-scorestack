# Phase 7: AI Message Generation

## Phase

EXECUTION

## Command

PLAN::ARCHITECTURE + PLAN::TASKS

## Project Type

SaaS

## Agents Selected

- Architecture Agent
- Planning Agent
- React Frontend Engineer
- Node Backend Engineer
- API Designer

## Skills Used

- React Frontend Engineer
- Node Backend Engineer
- API Designer
- Data Modeler

---

## PLAN::ARCHITECTURE

### Overview

Phase 7 adds the Messages tab to the results page, enabling users to generate personalised LinkedIn outreach messages for their top-scored contacts using Claude AI.

The DB schema is **already complete** — `MessageTemplate`, `GeneratedMessage`, and `DeliveryJob` tables exist. No migration is needed for message generation.

---

### Data Flow

```
Results page (authenticated user)
  │
  ├── Tab bar: [ Scores ] [ Messages ]
  │
  └── Messages tab selected
        │
        ├── GET /api/messages/templates  → list org's saved templates
        │
        ├── User selects template + contact count (Top 25 / Top 50 / Top 100 / All)
        │
        ├── POST /api/messages/generate { runId, templateId, count }
        │     │
        │     ├── Plan gate: free → 402; starter → max 100; pro+ → unlimited
        │     ├── Fetch RunResult rows (enriched only, ordered by score desc, capped by count)
        │     ├── For each result → Claude API call (system prompt cached per template)
        │     ├── Upsert GeneratedMessage { runResultId, templateId, body }
        │     └── Return { generated: N, failed: N }
        │
        ├── GET /api/runs/:runId/messages?templateId=:id  → list messages with contact data
        │
        └── Render message table
              └── Per row: expand → edit textarea → PATCH /api/messages/:id { editedBody }
```

---

### API Surface (Phase 7)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/messages/templates` | Required | List templates for session org |
| POST | `/api/messages/templates` | Required | Create template |
| POST | `/api/messages/generate` | Required | Generate messages (batch) |
| GET | `/api/runs/:runId/messages` | Required | List messages for a run + template |
| PATCH | `/api/messages/:messageId` | Required | Update `editedBody` on one message |

---

### Claude API Usage

- **Model:** `claude-haiku-4-5-20251001` (fast + affordable; ~$0.50/2000 contacts with caching)
- **System prompt:** Per template — constant per call, benefits from Anthropic prompt cache automatically
- **User prompt:** Per contact — `enrichedData` (JSON) + matched `criterionScores`
- **Response format:** JSON `{ "body": "..." }` — plain text only (LinkedIn DM constraints)
- **Concurrency:** `MESSAGE_BATCH_SIZE` env var (default: 20 parallel requests per batch)
- **Timeout:** Standard Vercel function timeout; suitable for ≤100 contacts synchronously

---

### Plan Gate Matrix

| Plan | Generate messages | Custom `systemPrompt` | Max per run |
|------|------------------|----------------------|-------------|
| free | 402 blocked | N/A | 0 |
| starter | ✅ | No (ignored, default used) | 100 |
| pro | ✅ | Yes | Unlimited |
| enterprise | ✅ | Yes | Unlimited |

---

### Tab Routing

Results page (`app/run/[runId]/results/page.tsx`) is a server component. It reads `searchParams.tab` and passes the active tab down. The tab bar is a client component that updates the URL via `router.replace` (shallow, no full reload).

Default tab: `scores`.

---

### Key Constraints

- `GeneratedMessage` upsert is keyed on `(runResultId, templateId)` — re-generating overwrites existing messages for that pair.
- Starter plan: `systemPrompt` field in `MessageTemplate` is stored but overridden by a platform default at generation time (not blocked at template creation — the field is present but ignored server-side).
- Free plan: the Messages tab renders in a locked state with an upgrade CTA — no API calls attempted.
- Generation is synchronous (single API response). No SSE needed for ≤100 contacts. Spinner + loading state covers the wait.

---

## PLAN::TASKS

### Execution Order

```
T-52 (UsageBanner — independent)

T-53 (tab bar in results page)
  │
  └── T-57 (MessagesTab UI shell) → T-58 (MessageTemplateModal)
        │
        ├── T-54 (GET /api/messages/templates)
        ├── T-55 (POST /api/messages/templates)
        ├── T-56 (POST /api/messages/generate)  ← depends on T-54 + T-55
        ├── T-59 (GET /api/runs/:runId/messages)
        └── T-60 (PATCH /api/messages/:messageId)
```

---

### T-52 — `UsageBanner` component

**File:** `app/components/UsageBanner.tsx`

Server component (no interactivity needed). Receives `plan: string` prop. Already spec'd in `ui.md §4`.

```tsx
interface UsageBannerProps { plan: string }

export default function UsageBanner({ plan }: UsageBannerProps) {
  if (plan === 'enterprise') return null
  if (plan === 'free') return (
    <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
      <span>Free plan · 50 contacts per run</span>
      <a href="/settings/billing" className="font-medium underline hover:text-amber-900">Upgrade →</a>
    </div>
  )
  // starter / pro
  const label = plan === 'starter' ? 'Starter plan' : 'Pro plan'
  return (
    <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs text-blue-800 flex items-center gap-2">
      <span>{label} · Unlimited enrichment</span>
      <a href="/settings/billing" className="font-medium underline hover:text-blue-900">Plan settings →</a>
    </div>
  )
}
```

**Wire in:** Render `<UsageBanner plan={plan} />` in `AppHeader.tsx` just below the nav bar, conditionally when `plan` prop is present.

---

### T-53 — Tab bar on results page

**File:** `app/run/[runId]/results/page.tsx` + new `app/components/ResultsTabs.tsx`

Results page reads `searchParams`:

```typescript
interface ResultsPageProps {
  params: { runId: string }
  searchParams: { tab?: string }
}
// ...
const activeTab = searchParams.tab === 'messages' ? 'messages' : 'scores'
```

`ResultsTabs` is a client component:

```tsx
'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface ResultsTabsProps { activeTab: 'scores' | 'messages' }

export default function ResultsTabs({ activeTab }: ResultsTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function navigate(tab: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 mb-4 border-b border-gray-200">
      {(['scores', 'messages'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => navigate(tab)}
          className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
            activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab === 'scores' ? 'Scores' : 'Messages'}
        </button>
      ))}
    </div>
  )
}
```

Results page renders either `<ResultsTable ... />` or `<MessagesTab ... />` based on `activeTab`.

---

### T-54 — `GET /api/messages/templates`

**File:** `app/api/messages/templates/route.ts`

```typescript
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return new Response(null, { status: 401 })

  const templates = await prisma.messageTemplate.findMany({
    where: { orgId: session.user.orgId! },
    select: { id: true, name: true, tone: true, goal: true, systemPrompt: true },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ templates })
}
```

---

### T-55 — `POST /api/messages/templates`

**File:** `app/api/messages/templates/route.ts` (add `POST` to same file)

- Auth + plan gate: free → 402
- Body: `{ name: string, tone: string, goal: string, systemPrompt?: string }`
- Starter: `systemPrompt` stored but overridden at generation time
- Creates `MessageTemplate` scoped to `orgId`
- Returns `{ template: { id, name, tone, goal } }`

---

### T-56 — `POST /api/messages/generate`

**File:** `app/api/messages/generate/route.ts`

Core logic:

```
1. Auth check + plan gate (free → 402)
2. Parse body: { runId, templateId, count: number | 'all' }
3. Resolve limit: starter → min(count, 100); pro+ → count (no cap)
4. Fetch template (must belong to same org)
5. Fetch RunResult rows:
   where: { runId, enrichmentStatus: 'success' }
   orderBy: { totalScore: 'desc' }
   take: resolvedLimit (or undefined if 'all')
6. Build systemPrompt:
   - starter: use platform default template (ignores template.systemPrompt)
   - pro+: use template.systemPrompt
7. Process in batches of MESSAGE_BATCH_SIZE (default 20):
   - Call Anthropic API with cached system prompt + contact user prompt
   - Parse JSON response { body: string }
   - Upsert GeneratedMessage { runResultId, templateId, body }
8. Return { generated: N, failed: N }
```

**System prompt (platform default for Starter):**
```
You are an expert sales copywriter specialising in LinkedIn outreach.
Write a personalised LinkedIn direct message for the contact below.
Rules: first person, reference specific profile details, max 300 characters, plain text only, no mention of AI or scoring.
Return JSON: { "body": "..." }
```

**User prompt (per contact):**
```
Contact profile:
{JSON.stringify(result.enrichedData)}

Why this contact matched:
{JSON.stringify(criterionScores.filter(s => s.matched))}

Generate the LinkedIn message.
```

---

### T-57 — `MessagesTab` component

**File:** `app/components/MessagesTab.tsx`

Client component. Props: `{ runId: string, plan: string, totalResults: number }`

**State A — locked (free plan):**
```
┌─────────────────────────────────────────────┐
│  ✦ Generate AI outreach messages            │
│                                             │
│  Personalised LinkedIn messages for your    │
│  top contacts. Available on Starter+.       │
│                                             │
│  [Upgrade to Starter]                       │
└─────────────────────────────────────────────┘
```

**State B — no messages yet (paid):**
```
┌─────────────────────────────────────────────┐
│  Template:  [Select template ▼] [+ New]     │
│  Generate for: [Top 25 ▼]                   │
│                       [Generate messages]   │
└─────────────────────────────────────────────┘
```
- Template dropdown fetches from `GET /api/messages/templates`
- Count selector: Top 25 / Top 50 / Top 100 (capped at `totalResults`)
- On generate: POST /api/messages/generate → loading state → refetch messages

**State C — messages generated:**
Table columns: `#`, `Contact`, `Message preview`, `Actions`
- Contact: LinkedIn URL truncated (same style as ResultsTable)
- Message preview: first 80 chars, truncated
- Expand row: full message in read-only `<pre>` + "Edit" button
- Edit: textarea replaces preview, PATCH /api/messages/:id on blur/save
- "Regenerate" button: re-calls POST /api/messages/generate with count 1 for that contact

---

### T-58 — `MessageTemplateModal` component

**File:** `app/components/MessageTemplateModal.tsx`

Client component. Props: `{ open: boolean, onClose: () => void, onCreated: (template) => void, plan: string }`

Fields:
- Name (text input, required)
- Tone (select: `professional` / `friendly` / `direct` / `casual`)
- Goal (text input: e.g. "book a discovery call")
- System prompt (textarea — rendered only when `plan === 'pro' || plan === 'enterprise'`; Starter sees: _"System prompt customisation is available on Pro+"_)

Submit → POST /api/messages/templates → `onCreated(template)` → close modal

---

### T-59 — `GET /api/runs/:runId/messages`

**File:** `app/api/runs/[runId]/messages/route.ts`

```
GET /api/runs/:runId/messages?templateId=:id

Returns {
  messages: Array<{
    id, body, editedBody, deliveryStatus, generatedAt,
    runResult: { linkedinUrl, enrichedData }
  }>
}
```

- Auth required, verify run belongs to session user's org
- Filter by `templateId` query param if provided

---

### T-60 — `PATCH /api/messages/:messageId`

**File:** `app/api/messages/[messageId]/route.ts`

- Auth required
- Body: `{ editedBody: string }`
- Verify message belongs to a run in the session user's org (join RunResult → Run → orgId)
- Update `GeneratedMessage.editedBody`
- Return updated message

---

## Verification

### UsageBanner
1. Sign in as free user — amber banner visible on home, results, billing pages.
2. Sign in as Starter — blue "Starter plan · Unlimited enrichment" banner.
3. Enterprise user — no banner.

### Tab bar
1. Results page defaults to "Scores" tab, ResultsTable visible.
2. Click "Messages" → URL updates to `?tab=messages`, MessagesTab renders.
3. Browser back → returns to Scores tab.

### Message generation — Starter
1. Create template (system prompt field hidden, saved without it).
2. Generate Top 25 → 25 GeneratedMessage rows created.
3. Attempt Top 100 with 150 contacts → generates exactly 100 (plan cap).
4. Free user clicking tab → sees locked state, "Upgrade to Starter" CTA.

### Message generation — Pro
1. System prompt field visible in template modal.
2. Generate "All" → all enriched contacts receive a message.
3. Edit a message body → saved, visible on refresh.
4. Regenerate single message → row updates.

### API security
1. `GET /api/messages/templates` unauthenticated → 401.
2. `POST /api/messages/generate` as free plan → 402.
3. `PATCH /api/messages/:id` for a message belonging to a different org → 403.
