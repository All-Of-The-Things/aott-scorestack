-- Phase 10a: delivery identity tracking on DeliveryJob
ALTER TABLE "delivery_jobs"
  ADD COLUMN "delivery_identity" TEXT NOT NULL DEFAULT 'platform_agent',
  ADD COLUMN "failure_code" TEXT;

-- Phase 10b: BYOK ConnectSafely credential fields on OrgIntegration
ALTER TABLE "org_integrations"
  ADD COLUMN "connect_safely_api_key" TEXT,
  ADD COLUMN "connect_safely_verified_at" TIMESTAMPTZ,
  ADD COLUMN "connect_safely_last_error" TEXT;
