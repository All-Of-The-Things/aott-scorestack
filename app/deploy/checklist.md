# ScoreStack — Deployment Checklist

Platform: **Vercel** + **PostgreSQL** + **Vercel Blob**

---

## 1. Pre-deploy: Infrastructure

- [ ] PostgreSQL database provisioned (Vercel Postgres, Supabase, Railway, or self-hosted)
- [ ] `DATABASE_URL` connection string ready (use a pooled connection URL for production)
- [ ] Vercel project created and GitHub repo connected
- [ ] Vercel Blob storage added to the project (generates `BLOB_READ_WRITE_TOKEN` automatically)

---

## 2. Pre-deploy: External Services

### Auth
- [ ] `AUTH_SECRET` generated: `openssl rand -hex 32`
- [ ] `NEXTAUTH_URL` set to the production domain (e.g. `https://app.scorestack.io`) — no trailing slash

### Email — Resend
- [ ] Resend account created; domain verified for sending
- [ ] `RESEND_API_KEY` obtained from Resend dashboard
- [ ] `RESEND_FROM_EMAIL` set to a verified sender address

### Billing — Lemon Squeezy
- [ ] Store created; `LEMONSQUEEZY_STORE_ID` noted
- [ ] Subscription product created with Starter and Pro variants
  - Note both variant IDs → `NEXT_PUBLIC_LEMONSQUEEZY_STARTER_VARIANT_ID`, `NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID`
  - Note the product ID → `LEMONSQUEEZY_PLANS_PRODUCT_ID`
- [ ] Credits product created (one-time purchase) → `LEMONSQUEEZY_CREDITS_PRODUCT_ID`
- [ ] `LEMONSQUEEZY_API_KEY` obtained (Settings → API)
- [ ] Webhook endpoint registered: `https://<domain>/api/webhooks/lemonsqueezy`
  - Required events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_failed`, `order_created`
  - Copy signing secret → `LEMONSQUEEZY_WEBHOOK_SECRET`

### LinkedIn — LinkedAPI
- [ ] `LINKED_API_TOKEN` and `LINKED_API_ID_TOKEN` obtained from LinkedAPI dashboard

### LinkedIn — ConnectSafely
- [ ] `CONNECT_SAFELY_API_KEY` obtained from ConnectSafely dashboard
- [ ] Decide routing: `CONNECT_SAFELY_DELIVERY_ENABLED=true` for delivery; `LINKED_API_ENRICHMENT_ENABLED=true` for enrichment

### AI — Anthropic
- [ ] `ANTHROPIC_API_KEY` obtained from console.anthropic.com

### Encryption (BYOK)
- [ ] `ENCRYPTION_KEY` generated: `openssl rand -hex 32`
- [ ] Store securely — rotating this key requires re-encrypting all stored org credentials (see runbook)

---

## 3. Pre-deploy: Vercel Environment Variables

Set all variables in **Vercel → Project → Settings → Environment Variables**.

**Critical: `NEXT_PUBLIC_*` vars must be set as plain Environment Variables (not Secret), otherwise the browser build will not embed them.**

| Variable | Type | Required |
|----------|------|----------|
| `DATABASE_URL` | Secret | ✅ |
| `AUTH_SECRET` | Secret | ✅ |
| `NEXTAUTH_URL` | Plain | ✅ |
| `RESEND_API_KEY` | Secret | ✅ |
| `RESEND_FROM_EMAIL` | Plain | ✅ |
| `BLOB_READ_WRITE_TOKEN` | Secret | ✅ (auto-provisioned) |
| `ANTHROPIC_API_KEY` | Secret | ✅ |
| `LEMONSQUEEZY_API_KEY` | Secret | ✅ |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Secret | ✅ |
| `LEMONSQUEEZY_STORE_ID` | Plain | ✅ |
| `LEMONSQUEEZY_PLANS_PRODUCT_ID` | Plain | ✅ |
| `LEMONSQUEEZY_CREDITS_PRODUCT_ID` | Plain | ✅ (if credits enabled) |
| `NEXT_PUBLIC_LEMONSQUEEZY_STARTER_VARIANT_ID` | Plain | ✅ |
| `NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID` | Plain | ✅ |
| `LINKED_API_TOKEN` | Secret | ✅ |
| `LINKED_API_ID_TOKEN` | Secret | ✅ |
| `LINKED_API_ENRICHMENT_ENABLED` | Plain | ✅ |
| `CONNECT_SAFELY_API_KEY` | Secret | ✅ |
| `CONNECT_SAFELY_DELIVERY_ENABLED` | Plain | ✅ |
| `ENCRYPTION_KEY` | Secret | ✅ |
| `ENABLE_CREDITS` | Plain | Optional |
| `DELIVERY_DELAY_MS` | Plain | Optional (default: 3000) |

---

## 4. Deploy

- [ ] Push to `main` branch (or trigger deploy from Vercel dashboard)
- [ ] Monitor build logs — the build command runs in this order:
  1. `npx prisma generate` — generates Prisma client from schema
  2. `npx prisma migrate deploy` — applies all pending migrations
  3. `npm run build` — Next.js production build
- [ ] **Build must not proceed to traffic swap if step 2 fails.** Vercel will hold the old deployment if the build errors out.

---

## 5. Post-deploy Validation

Work through this smoke-test checklist after every production deploy.

### Auth
- [ ] Visit `/auth/signin` → enter email → magic-link email arrives within 30 seconds
- [ ] Click link → redirected to `/runs` with active session
- [ ] User avatar visible in nav; plan badge shows "Free"

### Core flow
- [ ] Upload a CSV via `/enrich` → enrichment progress streams via SSE
- [ ] After enrichment, `/run/:id/score` loads with criteria builder
- [ ] Score → results page renders with ranked contacts

### Billing
- [ ] `/settings/billing` loads without error
- [ ] Click "Upgrade to Starter" → redirect to Lemon Squeezy hosted checkout
- [ ] (Sandbox) Complete test checkout → webhook fires → plan updates to `starter`
- [ ] `/settings/billing` reflects new plan

### Team
- [ ] `/settings/team` loads for admin user
- [ ] Invite a teammate → invite email arrives → teammate can sign in and join org

### API health
- [ ] `GET /api/health` → `{ status: "ok" }`

---

## 6. Rollback

Vercel supports **Instant Rollback** from the deployment list (Deployments tab → previous deployment → Promote to Production).

Database migrations are **forward-only** — rolling back code does not roll back the schema. Ensure every migration is backward-compatible with the previous deployment before merging.
