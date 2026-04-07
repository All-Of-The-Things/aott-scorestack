/*
  Warnings:

  - The `status` column on the `runs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `enrichment_status` on the `run_results` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('pending', 'enriching', 'scoring', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('success', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "run_results" DROP COLUMN "enrichment_status",
ADD COLUMN     "enrichment_status" "EnrichmentStatus" NOT NULL;

-- AlterTable
ALTER TABLE "runs" DROP COLUMN "status",
ADD COLUMN     "status" "RunStatus" NOT NULL DEFAULT 'pending';
