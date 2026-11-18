/*
  Staff actions and suspension.

  - User.suspended_at / suspended_reason: platform staff can block an account.
  - Organization.suspended_at / suspended_reason: platform staff can suspend a company (Organization.status already exists).
  - OrganizationMember.suspended_reason: a company administrator can pause one member's access (status "suspended").
  - StaffAction: what platform staff did to a person, company or payment, and why.
*/

-- AlterTable
ALTER TABLE "User" ADD COLUMN "suspended_at" TIMESTAMP(3), ADD COLUMN "suspended_reason" TEXT;
ALTER TABLE "Organization" ADD COLUMN "suspended_at" TIMESTAMP(3), ADD COLUMN "suspended_reason" TEXT;
ALTER TABLE "OrganizationMember" ADD COLUMN "suspended_reason" TEXT;

-- CreateTable
CREATE TABLE "StaffAction" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffAction_target_type_target_id_created_at_idx" ON "StaffAction"("target_type", "target_id", "created_at");
CREATE INDEX "StaffAction_actor_id_idx" ON "StaffAction"("actor_id");
