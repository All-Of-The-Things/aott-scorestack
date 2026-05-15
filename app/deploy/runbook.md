# ScoreStack — Operations Runbook

Common post-launch procedures. All SQL runs against the production PostgreSQL database.

---

## Database access

```bash
# Via Vercel CLI (if using Vercel Postgres)
vercel env pull .env.local
npx prisma studio          # GUI browser at localhost:5555

# Direct psql
psql $DATABASE_URL
```

---

## Check migration status

```bash
npx prisma migrate status
```

If a migration is flagged as "applied but missing from filesystem" (can happen after a revert), resolve it:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## Manual org plan override

Use when a customer's plan didn't update after a Lemon Squeezy webhook (e.g., network failure).

```sql
UPDATE organizations
SET plan = 'pro'   -- or 'starter', 'free', 'enterprise'
WHERE id = '<org_cuid>';
```

Then replay the missed webhook from the Lemon Squeezy dashboard:
**Event logs → find the event → Resend.**

---

## Credit balance adjustment

Add or remove enrichment credits for an org:

```sql
-- Add 500 credits
UPDATE organizations
SET managed_credits_balance = managed_credits_balance + 500
WHERE id = '<org_cuid>';

-- Set to exact value
UPDATE organizations
SET managed_credits_balance = 1000
WHERE id = '<org_cuid>';
```

---

## Org bootstrap failure

Symptoms: user signs in but lands on a blank page or gets a 503 from `/api/usage`.

Diagnosis:
```sql
SELECT id, email, org_id, role FROM users WHERE email = '<user_email>';
```

If `org_id` is null:
```sql
-- 1. Create the org
INSERT INTO organizations (id, name, plan, managed_credits_balance, created_at)
VALUES (gen_random_uuid(), 'My Workspace', 'free', 0, now())
RETURNING id;

-- 2. Link the user (use the ID returned above)
UPDATE users
SET org_id = '<new_org_id>', role = 'admin'
WHERE email = '<user_email>';
```

---

## Replay a Lemon Squeezy webhook

1. Log in to the Lemon Squeezy dashboard
2. Navigate to **Settings → Webhooks → Event logs**
3. Find the failed event (filter by endpoint URL)
4. Click **Resend**

The webhook handler at `/api/webhooks/lemonsqueezy` is idempotent — replaying a `subscription_created` or `order_created` event is safe.

---

## Remove a user from an org (admin action)

```sql
UPDATE users
SET org_id = NULL, role = 'member'
WHERE id = '<user_id>';
```

The user will be treated as a new member on next sign-in and will be bootstrapped into a new org.

---

## Cancel and expire a subscription manually

Use when Lemon Squeezy cancellation webhook failed to fire:

```sql
-- Mark subscription cancelled
UPDATE subscriptions
SET cancel_at_period_end = true
WHERE org_id = '<org_cuid>';

-- To immediately downgrade (after period ends):
UPDATE organizations SET plan = 'free' WHERE id = '<org_cuid>';
UPDATE subscriptions SET status = 'expired' WHERE org_id = '<org_cuid>';
```

---

## ENCRYPTION_KEY rotation (destructive)

Rotating `ENCRYPTION_KEY` requires re-encrypting every stored BYOK API key. There is no zero-downtime path — plan for a maintenance window.

1. Fetch all rows from `org_integrations` where `connect_safely_api_key IS NOT NULL`
2. Decrypt each value with the old key
3. Re-encrypt each value with the new key
4. Update rows in a transaction
5. Deploy with the new `ENCRYPTION_KEY` env var

Until a migration script is written for this, **do not rotate the key in production without a tested script.**

---

## Check pending org invites

```sql
SELECT oi.email, oi.role, oi.expires, o.name AS org_name
FROM org_invites oi
JOIN organizations o ON o.id = oi.org_id
WHERE oi.expires > now()
ORDER BY oi.expires;
```

---

## Find and reclaim orphaned runs

Runs created before a user's org was bootstrapped may have `org_id = NULL`.

```sql
-- Runs without an org (review before reassigning)
SELECT id, name, user_id, notify_email, status, created_at
FROM runs
WHERE org_id IS NULL
ORDER BY created_at DESC;

-- Assign orphaned runs to a user's org
UPDATE runs
SET org_id = '<org_cuid>'
WHERE user_id = '<user_id>' AND org_id IS NULL;
```

---

## Vercel rollback

1. Go to **Vercel → Project → Deployments**
2. Find the last known-good deployment
3. Click the **⋯** menu → **Promote to Production**

The database schema is not rolled back — ensure the previous code version is compatible with the current schema before promoting.
