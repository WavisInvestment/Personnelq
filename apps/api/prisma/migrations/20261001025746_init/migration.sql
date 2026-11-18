-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'corporate',
    "status" TEXT NOT NULL DEFAULT 'active',
    "admin_name" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "admin_phone" TEXT,
    "subscription_plan" TEXT NOT NULL DEFAULT 'free',
    "subscription_status" TEXT NOT NULL DEFAULT 'inactive',
    "subscription_end_date" TIMESTAMP(3),
    "max_employees" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT NOT NULL,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "avatar_url" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "job_title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL DEFAULT 'system',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'full_assessment',
    "framework" TEXT NOT NULL DEFAULT 'ocean',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "allow_retake" BOOLEAN NOT NULL DEFAULT false,
    "retake_interval_days" INTEGER NOT NULL DEFAULT 180,
    "total_questions" INTEGER NOT NULL,
    "scoring_method" TEXT NOT NULL DEFAULT 'ocean',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "question_number" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL DEFAULT 'likert',
    "ocean_trait" TEXT,
    "ocean_direction" TEXT DEFAULT 'positive',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "min_score" INTEGER NOT NULL DEFAULT 1,
    "max_score" INTEGER NOT NULL DEFAULT 5,
    "options" TEXT[],
    "option_values" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSubmission" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "current_question" INTEGER NOT NULL DEFAULT 0,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "submission_number" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "previous_submission_id" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_reason" TEXT,
    "invitation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "AssessmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer_value" INTEGER NOT NULL DEFAULT 0,
    "answer_text" TEXT,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "openness_score" DOUBLE PRECISION DEFAULT 0,
    "conscientiousness_score" DOUBLE PRECISION DEFAULT 0,
    "extraversion_score" DOUBLE PRECISION DEFAULT 0,
    "agreeableness_score" DOUBLE PRECISION DEFAULT 0,
    "neuroticism_score" DOUBLE PRECISION DEFAULT 0,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentile" INTEGER,
    "result_version" TEXT NOT NULL DEFAULT '1.0.0',
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "previous_result_id" TEXT,
    "ai_interpretation" TEXT,
    "ai_generated_at" TIMESTAMP(3),
    "ai_model" TEXT DEFAULT 'claude-3-sonnet',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalityProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "openness_score" DOUBLE PRECISION DEFAULT 0,
    "conscientiousness_score" DOUBLE PRECISION DEFAULT 0,
    "extraversion_score" DOUBLE PRECISION DEFAULT 0,
    "agreeableness_score" DOUBLE PRECISION DEFAULT 0,
    "neuroticism_score" DOUBLE PRECISION DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "result_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareableBadge" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "share_url" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "shared_elements" JSONB NOT NULL DEFAULT '{}',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "display_name" TEXT,
    "custom_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ShareableBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeInvitation" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "department" TEXT,
    "job_title" TEXT,
    "invitation_token" TEXT NOT NULL,
    "invitation_url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "assessment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAssessment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "total_questions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "CustomAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_method" TEXT NOT NULL,
    "payment_provider" TEXT NOT NULL DEFAULT 'paystack',
    "provider_reference" TEXT NOT NULL,
    "paystack_reference" TEXT,
    "authorization_url" TEXT,
    "access_code" TEXT,
    "payment_type" TEXT NOT NULL,
    "assessment_id" TEXT,
    "subscription_plan" TEXT,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "seats_used" INTEGER NOT NULL DEFAULT 0,
    "seats_limit" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "changes" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdf_url" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "Organization"("type");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deleted_at_idx" ON "User"("deleted_at");

-- CreateIndex
CREATE INDEX "OrganizationMember_organization_id_idx" ON "OrganizationMember"("organization_id");

-- CreateIndex
CREATE INDEX "OrganizationMember_role_idx" ON "OrganizationMember"("role");

-- CreateIndex
CREATE INDEX "OrganizationMember_status_idx" ON "OrganizationMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_user_id_organization_id_key" ON "OrganizationMember"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refresh_token_key" ON "Session"("refresh_token");

-- CreateIndex
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");

-- CreateIndex
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

-- CreateIndex
CREATE INDEX "Assessment_organization_id_idx" ON "Assessment"("organization_id");

-- CreateIndex
CREATE INDEX "Assessment_type_idx" ON "Assessment"("type");

-- CreateIndex
CREATE INDEX "Assessment_framework_idx" ON "Assessment"("framework");

-- CreateIndex
CREATE INDEX "Assessment_is_locked_idx" ON "Assessment"("is_locked");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessment_id_idx" ON "AssessmentQuestion"("assessment_id");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_ocean_trait_idx" ON "AssessmentQuestion"("ocean_trait");

-- CreateIndex
CREATE INDEX "AssessmentSubmission_organization_id_idx" ON "AssessmentSubmission"("organization_id");

-- CreateIndex
CREATE INDEX "AssessmentSubmission_assessment_id_idx" ON "AssessmentSubmission"("assessment_id");

-- CreateIndex
CREATE INDEX "AssessmentSubmission_status_idx" ON "AssessmentSubmission"("status");

-- CreateIndex
CREATE INDEX "AssessmentSubmission_is_locked_idx" ON "AssessmentSubmission"("is_locked");

-- CreateIndex
CREATE INDEX "AssessmentSubmission_invitation_id_idx" ON "AssessmentSubmission"("invitation_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSubmission_user_id_assessment_id_submission_numbe_key" ON "AssessmentSubmission"("user_id", "assessment_id", "submission_number");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_submission_id_idx" ON "AssessmentAnswer"("submission_id");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_question_id_idx" ON "AssessmentAnswer"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAnswer_submission_id_question_id_key" ON "AssessmentAnswer"("submission_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_submission_id_key" ON "AssessmentResult"("submission_id");

-- CreateIndex
CREATE INDEX "AssessmentResult_organization_id_idx" ON "AssessmentResult"("organization_id");

-- CreateIndex
CREATE INDEX "AssessmentResult_assessment_id_idx" ON "AssessmentResult"("assessment_id");

-- CreateIndex
CREATE INDEX "AssessmentResult_is_current_idx" ON "AssessmentResult"("is_current");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_user_id_assessment_id_submission_id_key" ON "AssessmentResult"("user_id", "assessment_id", "submission_id");

-- CreateIndex
CREATE INDEX "PersonalityProfile_is_current_idx" ON "PersonalityProfile"("is_current");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalityProfile_user_id_organization_id_key" ON "PersonalityProfile"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ShareableBadge_result_id_key" ON "ShareableBadge"("result_id");

-- CreateIndex
CREATE UNIQUE INDEX "ShareableBadge_share_token_key" ON "ShareableBadge"("share_token");

-- CreateIndex
CREATE UNIQUE INDEX "ShareableBadge_share_url_key" ON "ShareableBadge"("share_url");

-- CreateIndex
CREATE INDEX "ShareableBadge_share_token_idx" ON "ShareableBadge"("share_token");

-- CreateIndex
CREATE INDEX "ShareableBadge_user_id_idx" ON "ShareableBadge"("user_id");

-- CreateIndex
CREATE INDEX "ShareableBadge_is_public_idx" ON "ShareableBadge"("is_public");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeInvitation_invitation_token_key" ON "EmployeeInvitation"("invitation_token");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeInvitation_invitation_url_key" ON "EmployeeInvitation"("invitation_url");

-- CreateIndex
CREATE INDEX "EmployeeInvitation_organization_id_idx" ON "EmployeeInvitation"("organization_id");

-- CreateIndex
CREATE INDEX "EmployeeInvitation_recipient_email_idx" ON "EmployeeInvitation"("recipient_email");

-- CreateIndex
CREATE INDEX "EmployeeInvitation_status_idx" ON "EmployeeInvitation"("status");

-- CreateIndex
CREATE INDEX "EmployeeInvitation_expires_at_idx" ON "EmployeeInvitation"("expires_at");

-- CreateIndex
CREATE INDEX "CustomAssessment_organization_id_idx" ON "CustomAssessment"("organization_id");

-- CreateIndex
CREATE INDEX "CustomAssessment_created_by_idx" ON "CustomAssessment"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_reference_key" ON "Payment"("provider_reference");

-- CreateIndex
CREATE INDEX "Payment_organization_id_idx" ON "Payment"("organization_id");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_payment_provider_idx" ON "Payment"("payment_provider");

-- CreateIndex
CREATE INDEX "Payment_provider_reference_idx" ON "Payment"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organization_id_key" ON "Subscription"("organization_id");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "AuditLog_organization_id_idx" ON "AuditLog"("organization_id");

-- CreateIndex
CREATE INDEX "AuditLog_user_id_idx" ON "AuditLog"("user_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_resource_type_idx" ON "AuditLog"("resource_type");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "Report_organization_id_idx" ON "Report"("organization_id");

-- CreateIndex
CREATE INDEX "Report_report_type_idx" ON "Report"("report_type");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "EmployeeInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "AssessmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "AssessmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalityProfile" ADD CONSTRAINT "PersonalityProfile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareableBadge" ADD CONSTRAINT "ShareableBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareableBadge" ADD CONSTRAINT "ShareableBadge_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "AssessmentResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAssessment" ADD CONSTRAINT "CustomAssessment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
