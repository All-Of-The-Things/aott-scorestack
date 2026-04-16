-- AlterTable
ALTER TABLE "scoring_models" ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "scoring_models" ADD CONSTRAINT "scoring_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
