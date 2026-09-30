# 📊 Database Schema - Complete

**Status:** ✅ Ready for Prisma Implementation  
**Database:** PostgreSQL 15  
**Total Tables:** 20  
**Related Document:** `AREAS/04-DATABASE-ARCHITECTURE.md`

---

## 🎯 Core Principles

1. **Assessment History:** Never overwrite submissions. Every assessment attempt is a new record.
2. **Assessment Locking:** Core OCEAN locked after completion. Custom assessments editable.
3. **Soft Deletes:** Mark deleted with `deleted_at`, don't remove records.
4. **Multi-Tenancy:** Every record has `organization_id` for isolation.
5. **Audit Trail:** Track who changed what and when.

---

## 📋 Prisma Schema File

### File: `apps/api/prisma/schema.prisma`

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// 1. ORGANIZATIONS & USERS
// ============================================

model Organization {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  type              String   @default("corporate") // corporate | school | church | professional
  status            String   @default("active")    // active | inactive | suspended
  
  // Admin details
  admin_name        String
  admin_email       String
  admin_phone       String?
  
  // Subscription
  subscription_plan String   @default("free")     // free | starter | professional | enterprise
  subscription_status String @default("inactive") // inactive | active | past_due | suspended
  subscription_end_date DateTime?
  max_employees     Int      @default(10)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  members           OrganizationMember[]
  assessments       Assessment[]
  submissions       AssessmentSubmission[]
  results           AssessmentResult[]
  invitations       EmployeeInvitation[]
  custom_assessments CustomAssessment[]
  payments          Payment[]
  audit_logs        AuditLog[]
  
  @@index([slug])
  @@index([type])
  @@index([status])
}

model User {
  id                String   @id @default(cuid())
  email             String   @unique
  email_verified    Boolean  @default(false)
  email_verified_at DateTime?
  
  // Auth
  password_hash     String
  password_reset_token String?
  password_reset_expires DateTime?
  
  // Account lockout
  failed_login_attempts Int @default(0)
  locked_until      DateTime?
  
  // Profile
  first_name        String
  last_name         String
  phone_number      String?
  avatar_url        String?
  
  // Preferences
  preferred_language String @default("en")
  timezone          String @default("UTC")
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  organization_members OrganizationMember[]
  sessions          Session[]
  assessments_created Assessment[] @relation("created_by")
  submissions       AssessmentSubmission[]
  results           AssessmentResult[]
  invitations_received EmployeeInvitation[] @relation("recipient")
  invitations_sent  EmployeeInvitation[] @relation("sender")
  shareable_badges  ShareableBadge[]
  audit_logs        AuditLog[] @relation("user")
  audit_logs_actor  AuditLog[] @relation("actor")
  
  @@index([email])
  @@index([deleted_at])
}

model OrganizationMember {
  id                String   @id @default(cuid())
  user_id           String
  organization_id   String
  
  // Role
  role              String   // admin | hr | employee | member
  department        String?
  job_title         String?
  
  // Status
  status            String   @default("active") // active | inactive | invited
  
  // Permissions (JSON for flexibility)
  permissions       String[] @default([])
  
  // Timestamps
  joined_at         DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@unique([user_id, organization_id])
  @@index([organization_id])
  @@index([role])
  @@index([status])
}

// ============================================
// 2. SESSIONS & AUTHENTICATION
// ============================================

model Session {
  id                String   @id @default(cuid())
  user_id           String
  
  // Token details
  refresh_token     String   @unique
  token_version     Int      @default(1) // For refresh token rotation
  
  // Tracking
  ip_address        String
  user_agent        String
  
  // Expiry
  expires_at        DateTime
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([user_id])
  @@index([expires_at])
}

// ============================================
// 3. ASSESSMENTS (TESTS)
// ============================================

model Assessment {
  id                String   @id @default(cuid())
  organization_id   String   @default("system") // "system" for core OCEAN
  
  // Basic info
  name              String
  description       String?
  type              String   @default("full_assessment") // free_snapshot | full_assessment | custom
  framework         String   @default("ocean") // ocean | custom
  version           String   @default("1.0.0")
  
  // Configuration
  is_locked         Boolean  @default(false) // Core OCEAN is locked
  allow_retake      Boolean  @default(false)
  retake_interval_days Int  @default(180)
  
  // Scoring
  total_questions   Int
  scoring_method    String   @default("ocean") // ocean | weighted | custom
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  published_at      DateTime?
  deleted_at        DateTime?
  created_by        String?
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  creator           User?    @relation("created_by", fields: [created_by], references: [id], onDelete: SetNull)
  questions         AssessmentQuestion[]
  submissions       AssessmentSubmission[]
  
  @@index([organization_id])
  @@index([type])
  @@index([framework])
  @@index([is_locked])
}

model AssessmentQuestion {
  id                String   @id @default(cuid())
  assessment_id     String
  
  // Question details
  question_number   Int
  question_text     String
  question_type     String   @default("likert") // likert | multiple_choice | text
  
  // OCEAN mapping
  ocean_trait       String? // Openness | Conscientiousness | Extraversion | Agreeableness | Neuroticism
  ocean_direction   String? @default("positive") // positive | negative
  
  // Scoring
  weight            Float    @default(1.0)
  min_score         Int      @default(1)
  max_score         Int      @default(5)
  
  // Options (for multiple choice)
  options           String[] // JSON array of option text
  option_values     Int[]    // Corresponding scores
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  assessment        Assessment @relation(fields: [assessment_id], references: [id], onDelete: Cascade)
  answers           AssessmentAnswer[]
  
  @@index([assessment_id])
  @@index([ocean_trait])
}

// ============================================
// 4. SUBMISSIONS & RESPONSES
// ============================================

model AssessmentSubmission {
  id                String   @id @default(cuid())
  user_id           String
  organization_id   String
  assessment_id     String
  
  // Submission status
  status            String   @default("in_progress") // in_progress | completed | abandoned
  
  // Progress tracking
  current_question  Int      @default(0)
  progress_percent  Int      @default(0)
  
  // Timing
  started_at        DateTime @default(now())
  completed_at      DateTime?
  last_activity_at  DateTime @updatedAt
  duration_seconds  Int? // Time taken to complete
  
  // Version tracking (for retakes)
  submission_number Int      @default(1)
  is_current        Boolean  @default(true) // Only latest is current
  previous_submission_id String? // Link to prior attempt
  
  // Assessment lock status
  is_locked         Boolean  @default(false) // After completion
  locked_reason     String? // initial_completion | awaiting_authorization
  
  // Employee invitation
  invitation_id     String?
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  assessment        Assessment @relation(fields: [assessment_id], references: [id], onDelete: Cascade)
  invitation        EmployeeInvitation? @relation(fields: [invitation_id], references: [id], onDelete: SetNull)
  answers           AssessmentAnswer[]
  result            AssessmentResult?
  
  @@unique([user_id, assessment_id, submission_number])
  @@index([organization_id])
  @@index([assessment_id])
  @@index([status])
  @@index([is_locked])
  @@index([invitation_id])
}

model AssessmentAnswer {
  id                String   @id @default(cuid())
  submission_id     String
  question_id       String
  
  // Response
  answer_value      Int      @default(0) // Numeric score
  answer_text       String?  // For text questions
  
  // Timing
  time_spent_seconds Int     @default(0)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  submission        AssessmentSubmission @relation(fields: [submission_id], references: [id], onDelete: Cascade)
  question          AssessmentQuestion @relation(fields: [question_id], references: [id], onDelete: Cascade)
  
  @@unique([submission_id, question_id])
  @@index([submission_id])
  @@index([question_id])
}

// ============================================
// 5. RESULTS & SCORING
// ============================================

model AssessmentResult {
  id                String   @id @default(cuid())
  user_id           String
  organization_id   String
  assessment_id     String
  submission_id     String   @unique
  
  // OCEAN Scores (if applicable)
  openness_score    Float?   @default(0)
  conscientiousness_score Float? @default(0)
  extraversion_score Float?  @default(0)
  agreeableness_score Float? @default(0)
  neuroticism_score Float?  @default(0)
  
  // Overall
  overall_score     Float    @default(0)
  percentile        Int?     // User's percentile vs population
  
  // Assessment version
  result_version    String   @default("1.0.0")
  is_current        Boolean  @default(true) // Latest result for user
  previous_result_id String? // Link to prior result
  
  // AI Interpretation
  ai_interpretation String? // Full LLM-generated interpretation
  ai_generated_at   DateTime?
  ai_model          String? @default("claude-3-sonnet")
  
  // Timestamps
  calculated_at     DateTime @default(now())
  shared_at         DateTime?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  assessment        Assessment @relation(fields: [assessment_id], references: [id], onDelete: Cascade)
  submission        AssessmentSubmission @relation(fields: [submission_id], references: [id], onDelete: Cascade)
  shareable_badge   ShareableBadge?
  
  @@unique([user_id, assessment_id, submission_id])
  @@index([organization_id])
  @@index([assessment_id])
  @@index([is_current])
  @@index([ai_interpretation], type: Gin) // Full-text search support
}

// ============================================
// 6. PERSONALITY PROFILES (CONSOLIDATION)
// ============================================

model PersonalityProfile {
  id                String   @id @default(cuid())
  user_id           String
  organization_id   String
  
  // Consolidated scores
  openness_score    Float?   @default(0)
  conscientiousness_score Float? @default(0)
  extraversion_score Float?  @default(0)
  agreeableness_score Float? @default(0)
  neuroticism_score Float?  @default(0)
  
  // Profile version
  version           Int      @default(1)
  is_current        Boolean  @default(true)
  
  // Metadata
  result_ids        String[] // IDs of results used in consolidation
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@unique([user_id, organization_id])
  @@index([is_current])
}

// ============================================
// 7. SHAREABLE BADGES
// ============================================

model ShareableBadge {
  id                String   @id @default(cuid())
  user_id           String
  result_id         String   @unique
  
  // Share token
  share_token       String   @unique @default(cuid())
  share_url         String   @unique
  
  // Privacy settings
  is_public         Boolean  @default(false)
  published_at      DateTime?
  expires_at        DateTime?
  
  // Shared elements (JSON)
  // Example: { "trait_scores": true, "communication_style": true, "strengths": true, "blind_spots": false }
  shared_elements   Json     @default("{}")
  
  // Access tracking
  view_count        Int      @default(0)
  last_viewed_at    DateTime?
  
  // Custom settings
  display_name      String? // Custom badge title
  custom_message    String? // Custom message on badge
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  result            AssessmentResult @relation(fields: [result_id], references: [id], onDelete: Cascade)
  
  @@index([share_token])
  @@index([user_id])
  @@index([is_public])
}

// ============================================
// 8. EMPLOYEE INVITATIONS
// ============================================

model EmployeeInvitation {
  id                String   @id @default(cuid())
  organization_id   String
  sender_id         String
  recipient_email   String
  
  // Invitation details
  first_name        String?
  last_name         String?
  department        String?
  job_title         String?
  
  // Unique link
  invitation_token  String   @unique @default(cuid())
  invitation_url    String   @unique
  
  // Expiry
  expires_at        DateTime
  
  // Status
  status            String   @default("pending") // pending | accepted | expired | revoked
  accepted_at       DateTime?
  accepted_by_user_id String?
  
  // Assessment
  assessment_id     String
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  sender            User     @relation("sender", fields: [sender_id], references: [id], onDelete: Cascade)
  recipient         User?    @relation("recipient", fields: [accepted_by_user_id], references: [id], onDelete: SetNull)
  assessment        Assessment @relation(fields: [assessment_id], references: [id], onDelete: Cascade)
  submissions       AssessmentSubmission[]
  
  @@index([organization_id])
  @@index([recipient_email])
  @@index([status])
  @@index([expires_at])
}

// ============================================
// 9. CUSTOM ASSESSMENTS
// ============================================

model CustomAssessment {
  id                String   @id @default(cuid())
  organization_id   String
  created_by        String
  
  // Basic info
  name              String
  description       String?
  
  // Configuration
  total_questions   Int      @default(0)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  published_at      DateTime?
  deleted_at        DateTime?
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@index([organization_id])
  @@index([created_by])
}

// ============================================
// 10. PAYMENTS & SUBSCRIPTIONS
// ============================================

model Payment {
  id                String   @id @default(cuid())
  organization_id   String
  user_id           String?  // NULL for organization subscription
  
  // Payment details
  amount            Float
  currency          String   @default("USD")
  status            String   @default("pending") // pending | completed | failed | refunded
  payment_method    String   // credit_card | bank_transfer
  
  // Payment processor
  payment_provider  String   @default("paystack")
  provider_reference String  @unique
  
  // Paystack specifics
  paystack_reference String?
  authorization_url String?
  access_code       String?
  
  // Assessment/Subscription
  payment_type      String   // subscription | assessment | one_time
  assessment_id     String?  // For individual assessment
  subscription_plan String?  // For organization subscription
  
  // Metadata
  description       String?
  metadata          Json     @default("{}")
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  processed_at      DateTime?
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@index([organization_id])
  @@index([status])
  @@index([payment_provider])
  @@index([provider_reference])
}

model Subscription {
  id                String   @id @default(cuid())
  organization_id   String   @unique
  
  // Subscription details
  plan_name         String   // starter | professional | enterprise
  status            String   @default("inactive") // active | inactive | suspended | cancelled
  
  // Billing
  billing_cycle     String   @default("monthly") // monthly | annual
  amount            Float
  currency          String   @default("USD")
  
  // Period
  start_date        DateTime
  end_date          DateTime
  auto_renew        Boolean  @default(true)
  
  // Usage limits
  seats_used        Int      @default(0)
  seats_limit       Int      @default(10)
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  cancelled_at      DateTime?
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@index([status])
}

// ============================================
// 11. AUDIT LOGS
// ============================================

model AuditLog {
  id                String   @id @default(cuid())
  organization_id   String
  user_id           String
  actor_id          String   // User who performed action
  
  // Action details
  action            String   // auth.login | auth.logout | assessment.submit | payment.process
  resource_type     String   // user | organization | assessment | payment
  resource_id       String
  
  // Changes
  changes           Json?    // { before: {...}, after: {...} }
  
  // Context
  ip_address        String?
  user_agent        String?
  status            String   @default("success") // success | failure
  error_message     String?
  
  // Timestamps
  created_at        DateTime @default(now())
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  actor             User     @relation("actor", fields: [actor_id], references: [id], onDelete: Cascade)
  
  @@index([organization_id])
  @@index([user_id])
  @@index([action])
  @@index([resource_type])
  @@index([created_at])
}

// ============================================
// 12. REPORTS & EXPORTS
// ============================================

model Report {
  id                String   @id @default(cuid())
  organization_id   String
  user_id           String
  
  // Report details
  report_type       String   // individual_assessment | team_summary | personality_evolution
  title             String
  
  // Content
  pdf_url           String?
  generated_at      DateTime
  
  // Timestamps
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  deleted_at        DateTime?
  
  // Relations
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@index([organization_id])
  @@index([report_type])
}
```

---

## 🔄 Key Relationships

### Assessment History Flow

```
User takes assessment
  → Creates AssessmentSubmission (status: in_progress)
    → User answers questions → AssessmentAnswer records
      → Submission completed (status: completed)
        → Calculates AssessmentResult (is_current: true)
          → User views result
            → User shares (creates ShareableBadge)

User retakes assessment (after 6 months)
  → Creates new AssessmentSubmission (submission_number: 2)
    → Previous submission marked (is_current: false)
    → New result created (is_current: true)
    → Previous result still accessible for comparison
```

### Employee Assessment Flow

```
HR sends invitation
  → Creates EmployeeInvitation (status: pending, expires in 14 days)
    → Employee receives email with unique link
      → Employee clicks link (creates User if needed)
        → Employee completes assessment via invitation link
          → Creates AssessmentSubmission (invitation_id: xxx)
            → Assessment locks (is_locked: true)
              → Result shown to employee
              → HR sees result in dashboard
                → HR authorizes retake
                  → New invitation generated (new token, 14-day expiry)
                    → Employee can retake
```

---

## 📊 Indexes Strategy

### High-Priority Indexes (Always Create)

```sql
-- Multi-tenancy filtering
CREATE INDEX idx_org_based ON assessment_submission(organization_id);
CREATE INDEX idx_org_assessment ON assessment_result(organization_id, assessment_id);

-- User-specific queries
CREATE INDEX idx_user_submissions ON assessment_submission(user_id, is_locked);
CREATE INDEX idx_user_results ON assessment_result(user_id, is_current);

-- Time-based queries
CREATE INDEX idx_session_expiry ON session(expires_at);
CREATE INDEX idx_invitation_expiry ON employee_invitation(expires_at);

-- Status-based queries
CREATE INDEX idx_payment_status ON payment(status);
CREATE INDEX idx_submission_status ON assessment_submission(status);

-- Foreign key relations
CREATE INDEX idx_submission_user ON assessment_submission(user_id);
CREATE INDEX idx_result_submission ON assessment_result(submission_id);
```

### Optional Indexes (Add if Performance Issues)

```sql
-- Full-text search on AI interpretation
CREATE INDEX idx_ai_interpretation ON assessment_result USING GIN(ai_interpretation);

-- Time-range queries
CREATE INDEX idx_audit_log_timestamp ON audit_log(created_at);

-- Sorting/ordering
CREATE INDEX idx_assessment_created ON assessment(created_at DESC);
```

---

## 🔒 Data Integrity Constraints

### Business Rules to Enforce

```sql
-- Assessment locking (can only lock a completed submission)
ALTER TABLE assessment_submission
  ADD CONSTRAINT check_lock_status 
  CHECK (is_locked = false OR status = 'completed');

-- Result exists only for completed submission
ALTER TABLE assessment_result
  ADD CONSTRAINT check_result_completed
  CHECK (submission.status = 'completed');

-- Only one current result per user per assessment
ALTER TABLE assessment_result
  ADD CONSTRAINT unique_current_result
  UNIQUE (user_id, assessment_id) 
  WHERE is_current = true;

-- Shareable badge only for shared results
ALTER TABLE shareable_badge
  ADD CONSTRAINT check_public_badge
  CHECK (is_public = false OR published_at IS NOT NULL);
```

---

## 📈 Performance Considerations

### Query Optimization

**Slow Query Examples to Avoid:**

```sql
-- ❌ SLOW: Full table scan
SELECT * FROM assessment_submission WHERE user_id = 'xxx';

-- ✅ FAST: Use index
SELECT * FROM assessment_submission 
WHERE user_id = 'xxx' AND organization_id = 'yyy';

-- ❌ SLOW: No organization filter
SELECT * FROM assessment_result WHERE is_current = true;

-- ✅ FAST: Multi-tenancy aware
SELECT * FROM assessment_result 
WHERE organization_id = 'yyy' AND is_current = true;
```

### Materialized Views (Add if needed later)

```sql
-- Team assessment summary (updated daily)
CREATE MATERIALIZED VIEW team_assessment_summary AS
SELECT 
  organization_id,
  assessment_id,
  COUNT(*) as total_assessments,
  AVG(overall_score) as avg_score,
  MAX(calculated_at) as last_assessment_date
FROM assessment_result
WHERE is_current = true
GROUP BY organization_id, assessment_id;

-- Personality distribution (for charts)
CREATE MATERIALIZED VIEW personality_distribution AS
SELECT
  organization_id,
  COUNT(CASE WHEN openness_score > 50 THEN 1 END) as high_openness,
  COUNT(CASE WHEN conscientiousness_score > 50 THEN 1 END) as high_conscientiousness,
  COUNT(*) as total_users
FROM assessment_result
WHERE is_current = true
GROUP BY organization_id;
```

---

## 🚀 Migration Strategy

### Phase 1: Core Tables (Week 3)

```sql
-- Users & Auth
- users
- sessions
- organizations
- organization_members

-- Assessments
- assessments
- assessment_questions

-- Submissions
- assessment_submissions
- assessment_answers
- assessment_results
```

### Phase 2: Features (Week 4-5)

```sql
-- Invitations
- employee_invitations

-- Payments
- payments
- subscriptions

-- Sharing
- shareable_badges
- personality_profiles

-- Admin
- audit_logs
- reports
```

---

## 📝 Prisma Commands

```bash
# Generate Prisma client
npx prisma generate

# Create first migration
npx prisma migrate dev --name init

# Apply migrations
npx prisma migrate deploy

# Seed database
npx prisma db seed

# Introspect existing database
npx prisma db pull

# Format schema
npx prisma format

# Reset database (dev only)
npx prisma migrate reset
```

---

## ✅ Ready for Implementation

This schema:
- ✅ Supports all MVP requirements
- ✅ Handles assessment history (no overwrites)
- ✅ Enforces multi-tenancy
- ✅ Supports future features (compatibility, profiles)
- ✅ Optimized for common queries
- ✅ Includes audit trail for compliance

**Next step:** Implement in Prisma schema file, create migrations, seed initial data.

