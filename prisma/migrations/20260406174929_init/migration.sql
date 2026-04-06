-- CreateTable
CREATE TABLE "scoring_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scoring_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "total_contacts" INTEGER NOT NULL,
    "enriched_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "ai_suggested_criteria" JSONB,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "row_index" INTEGER NOT NULL,
    "linkedin_url" TEXT NOT NULL,
    "enriched_data" JSONB NOT NULL,
    "enrichment_status" TEXT NOT NULL,
    "total_score" DECIMAL(65,30) NOT NULL,
    "criterion_scores" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "scoring_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_results" ADD CONSTRAINT "run_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
