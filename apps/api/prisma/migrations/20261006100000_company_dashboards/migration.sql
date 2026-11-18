/*
  Company dashboards.

  - OrganizationMember.consented_at: set when a person accepts a company invitation (which states that the
    company sees the results they take through it). Only members with it set count as the team.
  - Indexes for the dashboard queries (a company's current results, a person's results over time,
    invitations by status, a company's audit trail).
*/

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN "consented_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AssessmentResult_organization_id_is_current_idx" ON "AssessmentResult"("organization_id", "is_current");
CREATE INDEX "AssessmentResult_user_id_created_at_idx" ON "AssessmentResult"("user_id", "created_at");
CREATE INDEX "EmployeeInvitation_organization_id_status_idx" ON "EmployeeInvitation"("organization_id", "status");
CREATE INDEX "AuditLog_organization_id_created_at_idx" ON "AuditLog"("organization_id", "created_at");
