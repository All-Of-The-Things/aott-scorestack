-- CreateTable
CREATE TABLE "enterprise_inquiries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_inquiries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "enterprise_inquiries" ADD CONSTRAINT "enterprise_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
