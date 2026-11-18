/*
  Launch flows.

  - User: email verification token (hashed) and a pending address for email changes. Accounts that existed before
    verification was introduced are treated as verified.
  - EmployeeInvitation.role_key: the company role the invited person joins with.
  - RetakeRequest: a company member asking to repeat an assessment (or HR allowing it first).
  - Subscription.last_expiry_notice and an end_date index for the expiry job.
*/

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email_verify_token" TEXT, ADD COLUMN "email_verify_expires" TIMESTAMP(3), ADD COLUMN "pending_email" TEXT;
UPDATE "User" SET "email_verified" = true, "email_verified_at" = COALESCE("email_verified_at", now()) WHERE "email_verified" = false;

ALTER TABLE "EmployeeInvitation" ADD COLUMN "role_key" TEXT NOT NULL DEFAULT 'employee';

ALTER TABLE "Subscription" ADD COLUMN "last_expiry_notice" TEXT;
CREATE INDEX "Subscription_end_date_idx" ON "Subscription"("end_date");

-- CreateTable
CREATE TABLE "RetakeRequest" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_by" TEXT NOT NULL DEFAULT 'member',
    "decided_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetakeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetakeRequest_organization_id_status_idx" ON "RetakeRequest"("organization_id", "status");
CREATE INDEX "RetakeRequest_user_id_assessment_id_status_idx" ON "RetakeRequest"("user_id", "assessment_id", "status");

ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
