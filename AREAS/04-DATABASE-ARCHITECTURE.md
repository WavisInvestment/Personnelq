# Area 4: Database Architecture

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Foundation for entire system  
**Depends On:** Area 1 ✅, Area 2 🔴, Area 3 🔴

---

## Overview

The database is the **foundation** of the platform. This document defines:
- All tables and their structure
- Relationships between tables
- Indexes for performance
- Constraints and validation
- Audit and security requirements

**Database:** PostgreSQL (recommended in tech stack)  
**ORM:** Prisma (recommended)  
**Approach:** Relational database with strong constraints

---

## 🗂️ Database Schema Overview

### Core Domain Models

```
User Management
├── users
├── user_profiles
├── user_passwords (audit)
└── user_sessions

Organization Management
├── organizations (companies, schools, churches)
├── organization_users (memberships)
├── organization_roles
└── organization_permissions

Assessment Management
├── assessments
├── sections
├── questions
├── question_options
├── question_bank (reusable questions)
└── custom_tests

Submission & Scoring
├── submissions
├── answers
├── results
└── result_interpretations

User Results
├── personality_profiles
├── career_recommendations
└── team_compatibility_scores

Reporting & Analytics
├── reports (generated reports)
├── report_configs (white-label)
├── report_generations (history)
└── analytics_cache

Payments
├── payments
├── payment_subscriptions
├── payment_invoices
└── refunds

Communications
├── emails (audit log)
├── email_templates
└── notifications

Security & Compliance
├── audit_logs
├── api_keys
└── encryption_keys
```

---

## 📊 Detailed Table Schemas

### 1. USERS

Stores individual user accounts.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  full_name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  profile_picture_url VARCHAR(512),
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'en',
  
  -- Account Status
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Indexes
  CREATE INDEX idx_users_email ON users(email);
  CREATE INDEX idx_users_created_at ON users(created_at);
);
```

### 2. ORGANIZATIONS

Stores companies, schools, churches, communities.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  type ENUM('company', 'school', 'church', 'community') NOT NULL,
  industry VARCHAR(100),
  size ENUM('1-10', '11-50', '51-200', '200+'),
  
  -- Contact Info
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(512),
  
  -- Address
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  postal_code VARCHAR(20),
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Branding (for white-label reports)
  logo_url VARCHAR(512),
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7),
  brand_name VARCHAR(255),
  
  -- Status
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  
  -- Plan & Billing
  plan_type ENUM('free', 'basic', 'professional', 'enterprise') DEFAULT 'free',
  plan_seats INT DEFAULT 1,
  plan_expires_at TIMESTAMP,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  CREATE INDEX idx_organizations_type ON organizations(type);
  CREATE INDEX idx_organizations_created_at ON organizations(created_at);
);
```

### 3. ORGANIZATION_USERS

Maps users to organizations (membership).

```sql
CREATE TABLE organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Role in this organization
  role ENUM('admin', 'manager', 'member', 'viewer') DEFAULT 'member',
  
  -- Permissions (JSON for flexibility)
  permissions JSONB,
  
  -- Status
  status ENUM('active', 'inactive', 'invited') DEFAULT 'active',
  invited_at TIMESTAMP,
  accepted_at TIMESTAMP,
  
  -- Metadata
  department VARCHAR(100),
  job_title VARCHAR(100),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, user_id),
  
  -- Indexes
  CREATE INDEX idx_org_users_org_id ON organization_users(organization_id);
  CREATE INDEX idx_org_users_user_id ON organization_users(user_id);
  CREATE INDEX idx_org_users_role ON organization_users(role);
);
```

### 4. ASSESSMENTS

The tests themselves (OCEAN, custom tests, etc.).

```sql
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  
  -- Structure
  version INT DEFAULT 1,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  
  -- Metadata
  estimated_duration_minutes INT,
  question_count INT,
  
  -- Instructions
  instructions TEXT,
  welcome_message TEXT,
  completion_message TEXT,
  
  -- Scoring
  total_possible_score INT DEFAULT 100,
  passing_score INT,
  
  -- Permissions
  created_by UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id), -- NULL = platform test
  visibility ENUM('public', 'private', 'organizational') DEFAULT 'public',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  archived_at TIMESTAMP,
  
  -- Indexes
  CREATE INDEX idx_assessments_status ON assessments(status);
  CREATE INDEX idx_assessments_org_id ON assessments(organization_id);
  CREATE INDEX idx_assessments_created_at ON assessments(created_at);
);
```

### 5. SECTIONS

Dimensions/traits within an assessment (e.g., "Openness", "Conscientiousness").

```sql
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Scoring
  order_index INT NOT NULL,
  weight DECIMAL(3, 2) DEFAULT 1.0, -- 0.0 to 1.0
  min_score INT DEFAULT 0,
  max_score INT DEFAULT 100,
  
  -- Interpretation
  interpretation_template TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_sections_assessment_id ON sections(assessment_id);
  CREATE INDEX idx_sections_order ON sections(assessment_id, order_index);
);
```

### 6. QUESTIONS

Individual questions in an assessment.

```sql
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  
  text TEXT NOT NULL,
  description TEXT,
  
  -- Type & Structure
  type ENUM('radio', 'slider', 'matrix', 'checkbox', 'dropdown', 'ranking') NOT NULL,
  order_index INT NOT NULL,
  
  -- Scoring
  reverse_scored BOOLEAN DEFAULT false,
  max_score INT DEFAULT 5,
  
  -- Validation
  required BOOLEAN DEFAULT true,
  help_text VARCHAR(512),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_questions_assessment ON questions(assessment_id);
  CREATE INDEX idx_questions_section ON questions(section_id);
  CREATE INDEX idx_questions_order ON questions(assessment_id, order_index);
);
```

### 7. QUESTION_OPTIONS

Answer choices for questions.

```sql
CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  
  text VARCHAR(500) NOT NULL,
  value INT NOT NULL, -- Score value (1, 2, 3, 4, 5, etc.)
  order_index INT NOT NULL,
  
  -- For sliders
  label_left VARCHAR(100),
  label_right VARCHAR(100),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_options_question ON question_options(question_id);
);
```

### 8. SUBMISSIONS

When a user takes an assessment.

```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who & What
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  user_id UUID REFERENCES users(id), -- NULL for anonymous/invite submissions
  
  -- Organization context
  organization_id UUID REFERENCES organizations(id), -- If invited by org
  
  -- Status
  status ENUM('in_progress', 'submitted', 'scored') DEFAULT 'in_progress',
  
  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_answered_at TIMESTAMP,
  submitted_at TIMESTAMP,
  scored_at TIMESTAMP,
  
  -- Analytics
  time_taken_seconds INT,
  questions_answered INT,
  
  -- Scoring (calculated after submission)
  total_score INT,
  percentile INT,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_submissions_user ON submissions(user_id);
  CREATE INDEX idx_submissions_assessment ON submissions(assessment_id);
  CREATE INDEX idx_submissions_status ON submissions(status);
  CREATE INDEX idx_submissions_created_at ON submissions(created_at);
);
```

### 9. ANSWERS

Individual answers within a submission.

```sql
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  
  -- Answer Data (support multiple types)
  answer_value INT, -- For radio/slider (1-5)
  answer_text VARCHAR(500), -- For text answers
  selected_options JSONB, -- For multi-select ["option1", "option2"]
  ranked_order JSONB, -- For ranking [1, 2, 3]
  
  -- Scoring
  points_awarded INT, -- Points earned for this answer
  
  -- Timing
  answered_at TIMESTAMP DEFAULT NOW(),
  time_spent_seconds INT, -- How long on this question
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_answers_submission ON answers(submission_id);
  CREATE INDEX idx_answers_question ON answers(question_id);
);
```

### 10. RESULTS

Calculated results for a submission.

```sql
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  submission_id UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- Overall Score
  total_score INT NOT NULL,
  total_percentile INT,
  
  -- Section Scores (JSON for flexibility)
  section_scores JSONB NOT NULL, -- [{section_id, name, score, percentile}, ...]
  
  -- Interpretation
  summary_text TEXT,
  strengths TEXT[],
  growth_areas TEXT[],
  
  -- Career/Team Insights
  career_suggestions TEXT[],
  team_role_suggestion VARCHAR(100),
  
  -- Status
  status ENUM('pending', 'ready', 'shared') DEFAULT 'ready',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_results_submission ON results(submission_id);
  CREATE INDEX idx_results_user ON results(user_id);
  CREATE INDEX idx_results_assessment ON results(assessment_id);
);
```

### 11. REPORTS

Generated report records (for audit & re-download).

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  result_id UUID NOT NULL REFERENCES results(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  user_id UUID REFERENCES users(id),
  
  -- Report Details
  report_type ENUM('pdf', 'html', 'email') NOT NULL,
  format_version VARCHAR(20),
  
  -- File Storage
  file_path VARCHAR(512), -- S3 or Cloudinary path
  file_size_bytes INT,
  file_hash VARCHAR(64), -- SHA256 for verification
  
  -- White-Label Branding
  branding_config JSONB, -- {logo, colors, brand_name}
  
  -- Audit
  generated_by UUID REFERENCES users(id), -- Admin who generated
  generated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_reports_result ON reports(result_id);
  CREATE INDEX idx_reports_user ON reports(user_id);
  CREATE INDEX idx_reports_type ON reports(report_type);
);
```

### 12. PAYMENTS

Payment transactions.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who & What
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- Amount & Currency
  amount_cents INT NOT NULL, -- Store as cents to avoid float issues
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Payment Method
  payment_method ENUM('paystack', 'stripe', 'bank_transfer') NOT NULL,
  payment_gateway_id VARCHAR(255), -- Reference from payment provider
  
  -- What They're Paying For
  payment_type ENUM('assessment', 'subscription', 'refund') NOT NULL,
  assessment_id UUID REFERENCES assessments(id),
  
  -- Status
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  
  -- Metadata
  receipt_url VARCHAR(512),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  
  -- Indexes
  CREATE INDEX idx_payments_user ON payments(user_id);
  CREATE INDEX idx_payments_status ON payments(status);
  CREATE INDEX idx_payments_created_at ON payments(created_at);
);
```

### 13. INVITATIONS

One-time links for employees/students/members.

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who's Inviting
  created_by UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Who's Invited
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  
  -- What They're Invited To
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  
  -- Metadata
  department VARCHAR(100),
  job_title VARCHAR(100),
  employee_id VARCHAR(100), -- Internal employee ID
  
  -- Secure Link
  token VARCHAR(255) UNIQUE NOT NULL, -- SHA256 hash of link token
  token_plain TEXT, -- Only stored temporarily before sending
  expires_at TIMESTAMP NOT NULL,
  
  -- Status & Tracking
  status ENUM('pending', 'sent', 'opened', 'completed') DEFAULT 'pending',
  
  -- Linking
  user_id UUID REFERENCES users(id), -- Set when user completes assessment
  submission_id UUID REFERENCES submissions(id), -- Link to their submission
  
  -- Timestamps
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_invitations_org ON invitations(organization_id);
  CREATE INDEX idx_invitations_token ON invitations(token);
  CREATE INDEX idx_invitations_status ON invitations(status);
);
```

### 14. EMAIL_LOGS

Audit trail of emails sent.

```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  
  -- Email Details
  template_name VARCHAR(100),
  subject VARCHAR(255),
  body TEXT,
  
  -- Status
  status ENUM('queued', 'sent', 'failed', 'bounced') DEFAULT 'queued',
  
  -- Context
  submission_id UUID REFERENCES submissions(id),
  invitation_id UUID REFERENCES invitations(id),
  
  -- Metadata
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  open_count INT DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_emails_to ON email_logs(to_email);
  CREATE INDEX idx_emails_status ON email_logs(status);
  CREATE INDEX idx_emails_created_at ON email_logs(created_at);
);
```

### 15. AUDIT_LOGS

Comprehensive audit trail for compliance.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who Did It
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- What Happened
  action VARCHAR(100) NOT NULL, -- 'user_created', 'assessment_published', etc.
  entity_type VARCHAR(50), -- 'user', 'assessment', 'submission'
  entity_id UUID,
  
  -- Changes
  old_values JSONB, -- Previous state
  new_values JSONB, -- New state
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CREATE INDEX idx_audit_action ON audit_logs(action);
  CREATE INDEX idx_audit_user ON audit_logs(user_id);
  CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
);
```

---

## 🔑 Key Relationships

### User → Assessment Flow

```
User
  ├── Organization_Users (many org memberships)
  ├── Submissions (assessments they took)
  │   ├── Answers (their responses)
  │   └── Results (their scores)
  └── Payments (what they paid)
```

### Organization → Employee Flow

```
Organization
  ├── Organization_Users (members)
  ├── Invitations (invites sent to employees)
  │   ├── Submission (when employee completes)
  │   └── Email_Logs (tracking)
  └── Assessments (tests they use)
```

### Assessment → Scoring Flow

```
Assessment
  ├── Sections (traits being measured)
  │   ├── Questions (individual items)
  │   │   └── Question_Options (answer choices)
  └── Submissions (when taken)
      ├── Answers (responses to questions)
      └── Results (calculated scores)
```

---

## 📈 Indexes for Performance

### High-Priority Indexes

```sql
-- User queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Organization membership
CREATE INDEX idx_org_users_org_id ON organization_users(organization_id);
CREATE INDEX idx_org_users_user_id ON organization_users(user_id);

-- Assessment lookup
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_org_id ON assessments(organization_id);

-- Submission queries
CREATE INDEX idx_submissions_user ON submissions(user_id);
CREATE INDEX idx_submissions_assessment ON submissions(assessment_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_created_at ON submissions(created_at);

-- Results lookup
CREATE INDEX idx_results_user ON results(user_id);
CREATE INDEX idx_results_submission ON results(submission_id);

-- Invitations
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_status ON invitations(status);

-- Payments
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Audit
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

---

## 🔒 Constraints & Validation

### Referential Integrity
- All foreign keys have ON DELETE CASCADE where appropriate
- User deletion cascades to submissions, but not to organization membership

### Unique Constraints
- Email must be unique per user
- Assessment slug must be unique
- Invitation token must be unique
- Organization-user relationship must be unique

### Check Constraints
- Total score must be 0-100
- Percentile must be 0-100
- Organization plan_seats must be positive

---

## 🔐 Data Security

### Sensitive Data Encryption
```
- passwords (bcrypt, never stored plaintext)
- payment info (never stored, only token from Paystack)
- API keys (encrypted at rest)
- invitation tokens (hashed)
- email addresses (consider encryption for GDPR)
```

### Data Retention
```
- User data: Keep until account deletion + 30 days
- Submissions: Keep for 7 years (legal requirement)
- Audit logs: Keep for 7 years
- Email logs: Keep for 1 year
- Payment records: Keep for 7 years (financial records)
```

---

## 📊 Database Capacity Planning

### Expected Volume (Year 1)

```
Users: 10,000
Organizations: 500
Assessments: ~1,000 (platform + custom)
Submissions: 50,000+ (5 per user average)
Answers: 2.5M+ (50 questions per assessment)
Email Logs: 100,000+
Audit Logs: 1M+
```

### Storage Estimate
```
Total: ~500 GB (including file storage for PDFs)
```

---

## ✅ Migration Strategy

### Phase 1 (Week 3)
- Create core schema (users, organizations, assessments)
- Seed OCEAN test questions

### Phase 2 (Week 4)
- Add submissions, answers, results tables
- Setup scoring logic

### Phase 3 (Week 5)
- Add payments, emails, invitations

### Phase 4 (Week 6+)
- Add audit logs, optimize indexes
- Add white-label branding tables

---

## ❓ Open Questions for Client

1. **Data Retention:**
   - How long to keep submission responses? 7 years legally?
   - How long to keep audit logs?

2. **Multi-Tenancy:**
   - Can organizations have their own sub-organizations (departments)?
   - Should we support white-label fully separate databases or shared?

3. **Reporting:**
   - Do we need historical results? (Can user see their scores from 2 years ago?)
   - Should we archive old submissions?

4. **Performance:**
   - Expected query patterns? (e.g., "Get all submissions for org in last 30 days")
   - Caching strategy for assessment questions?

5. **Compliance:**
   - GDPR right-to-be-forgotten implementation?
   - How to handle data deletion cascade?

---

## 📋 Next Steps

1. **Review & Approve** this database schema
2. Move to **Area 5: Auth & Authorization** (JWT, roles, permissions)
3. Then **Area 6: Payment Architecture** (Paystack integration)
4. Then **Area 7: Result & Report System** (PDF generation)

**Time estimate:** 20 minutes to review, 10 minutes questions

