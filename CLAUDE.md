# ScoreStack — Project Context

## Project Type

Generic SaaS — LinkedIn contact scoring and outreach tool.  
Platform: Next.js 14 (App Router) + Prisma 7 + PostgreSQL + Vercel.  
Auth: NextAuth v5-beta (magic-link via Resend). Billing: Lemon Squeezy.

---

## Current Phase

**Phases 1–13 complete.** See `/app/docs/tasks.md` for the full task list.

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
