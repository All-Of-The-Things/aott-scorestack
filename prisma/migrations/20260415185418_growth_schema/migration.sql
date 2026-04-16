/*
  Warnings:

  - The primary key for the `run_results` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `runs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `scoring_models` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'expired');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('linkedin');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('scheduled', 'running', 'complete', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "EnrichmentSource" AS ENUM ('byok', 'managed_credits');

-- DropForeignKey
ALTER TABLE "run_results" DROP CONSTRAINT "run_results_run_id_fkey";

-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_model_id_fkey";

-- AlterTable
ALTER TABLE "run_results" DROP CONSTRAINT "run_results_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "run_id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "run_results_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "runs" DROP CONSTRAINT "runs_pkey",
ADD COLUMN     "avg_enrichment_ms" INTEGER,
ADD COLUMN     "notify_email" TEXT,
ADD COLUMN     "org_id" TEXT,
ADD COLUMN     "scoring_criteria" JSONB,
ADD COLUMN     "total_enrichment_ms" INTEGER,
ADD COLUMN     "user_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "model_id" SET DATA TYPE TEXT,
ALTER COLUMN "total_contacts" SET DEFAULT 0,
ALTER COLUMN "enriched_count" SET DEFAULT 0,
ALTER COLUMN "failed_count" SET DEFAULT 0,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "runs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "scoring_models" DROP CONSTRAINT "scoring_models_pkey",
ADD COLUMN     "org_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "scoring_models_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","provider_account_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Workspace',
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "managed_credits_balance" INTEGER NOT NULL DEFAULT 0,
    "ls_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ls_subscription_id" TEXT NOT NULL,
    "ls_customer_id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_integrations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "linked_api_token" TEXT NOT NULL,
    "linked_api_id_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ls_order_id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "contacts_consumed" INTEGER NOT NULL,
    "enrichment_source" "EnrichmentSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_notifications" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "enrichment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_messages" (
    "id" TEXT NOT NULL,
    "run_result_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited_body" TEXT,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "delivery_job_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "generated_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'linkedin',
    "status" "JobStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_ls_customer_id_key" ON "organizations"("ls_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_org_id_key" ON "subscriptions"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_ls_subscription_id_key" ON "subscriptions"("ls_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_integrations_org_id_key" ON "org_integrations"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_purchases_ls_order_id_key" ON "credit_purchases"("ls_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_notifications_run_id_key" ON "enrichment_notifications"("run_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_integrations" ADD CONSTRAINT "org_integrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_notifications" ADD CONSTRAINT "enrichment_notifications_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_run_result_id_fkey" FOREIGN KEY ("run_result_id") REFERENCES "run_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_delivery_job_id_fkey" FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_models" ADD CONSTRAINT "scoring_models_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "scoring_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_results" ADD CONSTRAINT "run_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
