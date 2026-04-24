-- CreateTable
CREATE TABLE "plan_limits" (
    "plan" "Plan" NOT NULL,
    "run_limit" INTEGER NOT NULL,
    "model_limit" INTEGER NOT NULL,
    "seat_limit" INTEGER NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("plan")
);

-- Seed default plan limits (-1 = unlimited)
INSERT INTO "plan_limits" ("plan", "run_limit", "model_limit", "seat_limit") VALUES
  ('free',       50,  1,  1),
  ('starter',    -1,  5,  1),
  ('pro',        -1, -1,  3),
  ('enterprise', -1, -1, -1);
