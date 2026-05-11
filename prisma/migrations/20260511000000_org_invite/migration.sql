CREATE TABLE "org_invites" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'member',
  "token" TEXT NOT NULL,
  "expires" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_invites_token_key" ON "org_invites"("token");
CREATE INDEX "org_invites_email_idx" ON "org_invites"("email");

ALTER TABLE "org_invites"
  ADD CONSTRAINT "org_invites_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
