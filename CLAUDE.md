# ScoreStack — Project Context

## Project Type

Generic SaaS — LinkedIn contact scoring and outreach tool.  
Platform: Next.js 14 (App Router) + Prisma 7 + PostgreSQL + Vercel.  
Auth: NextAuth v5-beta (magic-link via Resend). Billing: Lemon Squeezy.

---

## Current Phase

**EXECUTION — Phase 12 (Gates, Limits, Polish).**  
Phases 1–11 are complete. See `/app/docs/tasks.md` for the full task list.

### Remaining Phase 12 tasks

- **T-45** Enforce model limit in `app/api/models/route.ts`
- **T-46** Open UpgradeModal on 409 in `app/components/SaveModelButton.tsx`
- **T-48** Scope queries to `orgId` in models, score, suggest, enrich routes
- **T-49** Verify billing success redirect at `/settings/billing?success=1`

### Incomplete earlier tasks (carry-forward)

- **T-03** `prisma migrate dev` — blocked until `DATABASE_URL` set in `.env.local`
- **T-09** `app/api/org/route.ts` — `PATCH { name }` to update org name
- **T-18** Quota check + `UsageLog` insert in `app/api/enrich/route.ts`
- **T-20** `app/components/UsageBanner.tsx`
- **T-23** `app/api/runs/[runId]/status/route.ts`
- **T-47** Quota exceeded → UpgradeModal in `app/components/EnrichmentProgress.tsx`

---

## AI Orchestration Data Paths

All `/app/...` paths in `.aott/CLAUDE.md` resolve to this project's root `app/` directory:

| Path | Contents |
|------|----------|
| `/app/input/idea.json` | Product definition |
| `/app/specs/` | product, architecture, api, data-model, logic, ui specs |
| `/app/context/decisions.json` | 12 architectural decisions (D-001 – D-012) |
| `/app/docs/tasks.md` | Full build task list with phase/status tracking |
| `/app/docs/` | Plans, documentation, system notes |

---

## Key Architectural Decisions

- **D-001** `prisma migrate deploy` only — never `db push --accept-data-loss`
- **D-002** Session gate from score page onwards — no soft gates
- **D-008** Permanent dual-provider architecture (LinkedAPI enrichment + ConnectSafely delivery)
- **D-009** Two delivery identities only: `platform_agent` | `byok`
- **D-010** Auth errors abort entire delivery job atomically
- **D-011** Header nav always visible; breadcrumb in page content only
- **D-012** Dedicated `OrgInvite` model — not `VerificationToken`
