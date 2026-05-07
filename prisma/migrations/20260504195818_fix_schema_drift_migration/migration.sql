/*
  Warnings:

  - A unique constraint covering the columns `[run_result_id,template_id]` on the table `generated_messages` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "generated_messages_run_result_id_template_id_key" ON "generated_messages"("run_result_id", "template_id");
