-- Fix schema drift: columns present in schema.prisma but absent from migration history.
-- These were added via prisma db push rather than prisma migrate dev, so no migration
-- file was generated. After prisma migrate reset (or a fresh staging/prod deploy) the
-- columns were missing, causing runtime errors.

-- runs: nullable columns safe to add alongside existing rows
ALTER TABLE "runs" ADD COLUMN "name" TEXT;
ALTER TABLE "runs" ADD COLUMN "original_total_contacts" INTEGER;

-- plan_limits: boolean feature-gate columns (DEFAULT false = free-tier behaviour)
ALTER TABLE "plan_limits" ADD COLUMN "export_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_limits" ADD COLUMN "messages_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_limits" ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Seed correct per-spec values; free stays all-false which matches the column DEFAULT.
UPDATE "plan_limits" SET
  "export_enabled"  = true,
  "messages_enabled" = true,
  "delivery_enabled" = false
WHERE "plan" = 'starter';

UPDATE "plan_limits" SET
  "export_enabled"  = true,
  "messages_enabled" = true,
  "delivery_enabled" = true
WHERE "plan" IN ('pro', 'enterprise');
