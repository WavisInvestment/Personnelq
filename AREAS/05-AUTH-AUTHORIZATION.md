# Area 5: Auth & Authorization

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Security foundation, gates API access  
**Depends On:** Area 1 ✅, Area 2 🔴, Area 4 🔴

---

## Overview

Authentication (verifying WHO you are) and Authorization (verifying WHAT you can do) are the security foundations.

**Scope:**
- How users prove their identity (login)
- How we keep sessions secure (tokens)
- What each user type can access (roles & permissions)
- How multi-tenancy works (organization isolation)

---

## 🔐 Authentication Strategy

### Password-Based Login (Individual Users & Admins)

**Flow:**

```
1. User enters email + password
   ↓
2. Backend verifies password (bcrypt)
   ↓
3. Backend generates tokens:
   - Access Token (JWT, 15 min expiry)
   - Refresh Token (HTTP-only cookie, 7 days)
   ↓
4. Return tokens to frontend
   ↓
5. Frontend stores access token in memory
   - (Refresh token stored in secure HTTP-only cookie)
   ↓
6. All API calls include access token in Authorization header
```

### One-Time Link Login (Invited Employees/Students)

**Flow:**

```
1. HR Admin invites employee@company.com
   ↓
2. System generates unique, secure link:
   https://app.com/invite/TOKEN?email=employee@company.com
   ↓
3. Email sent to employee with link
   ↓
4. Employee clicks link
   ↓
5. Frontend validates token & email match
   ↓
6. Employee takes assessment (no login needed)
   ↓
7. After submission:
   - Option A: Create account (optional)
   - Option B: Just get results (anonymous)
   ↓
8. If creates account: Generate JWT tokens for future access
```

### JWT Token Structure

**Access Token (15 minutes)**

```json
{
  "sub": "user-uuid",
  "iss": "personality-badge",
  "aud": "api",
  "type": "access",
  "org_id": "org-uuid",
  "roles": ["member", "assessor"],
  "permissions": ["read:results", "write:assessments"],
  "iat": 1696008000,
  "exp": 1696008900
}
```

**Refresh Token (7 days)**

```json
{
  "sub": "user-uuid",
  "iss": "personality-badge",
  "aud": "api",
  "type": "refresh",
  "iat": 1696008000,
  "exp": 1696612800
}
```

### Token Management

**Refresh Token Rotation:**
- When access token expires, use refresh token to get new one
- Old refresh token invalidated (prevents token replay attacks)
- Keep rotation log in database for audit

**Token Revocation:**
- Logout: Add token to blacklist
- Blacklist stored in Redis (expires with token)
- Database record for audit

---

## 👥 Role-Based Access Control (RBAC)

### User Types & Roles

#### 1. **Individual User**
- **Role:** `user`
- **Permissions:**
  - `read:own_results` — View own assessment results
  - `download:own_reports` — Download own PDF reports
  - `take:assessments` — Take available assessments
  - `manage:own_account` — Update profile, password

#### 2. **HR Administrator**
- **Role:** `hr_admin` (within organization)
- **Permissions:**
  - `manage:organization` — Update org settings
  - `invite:employees` — Send assessment invitations
  - `manage:assessments` — Create/edit/delete assessments
  - `read:team_results` — View all employee results
  - `export:results` — Export data (CSV/PDF)
  - `manage:team` — Add/remove employees
  - `view:analytics` — See team analytics

#### 3. **School Administrator**
- **Role:** `school_admin`
- **Permissions:**
  - Similar to HR admin
  - `manage:classes` — Create/edit classes
  - `manage:students` — Add/remove students
  - `read:class_analytics` — Class-level insights

#### 4. **Church/Community Leader**
- **Role:** `community_admin`
- **Permissions:**
  - `manage:groups` — Create/manage groups
  - `invite:members` — Send invitations
  - `read:group_results` — View group assessments
  - `view:community_profile` — See aggregate insights

#### 5. **Platform Admin**
- **Role:** `super_admin`
- **Permissions:**
  - `manage:all_users` — Global user management
  - `manage:all_organizations` — Global org management
  - `manage:all_assessments` — Create/edit platform tests
  - `manage:questions` — Manage question bank
  - `view:system_analytics` — System-wide metrics
  - `manage:payments` — View transactions, refunds
  - `view:audit_logs` — Access audit trails

### Permission Matrix

```
                    | Individual | HR Admin | School | Church | Super Admin
--------------------|------------|----------|--------|--------|------------
Take Assessment     |     ✓      |    ✓     |   ✓    |   ✓    |     ✓
View Own Results    |     ✓      |    ✓     |   ✓    |   ✓    |     ✓
View Team Results   |     ✗      |    ✓     |   ✓    |   ✓    |     ✓
Invite Users        |     ✗      |    ✓     |   ✓    |   ✓    |     ✓
Create Assessments  |     ✗      |    ✓     |   ✓    |   ✓    |     ✓
Manage Questions    |     ✗      |    ✗     |   ✗    |   ✗    |     ✓
Access Admin Panel  |     ✗      |    ✓     |   ✓    |   ✓    |     ✓
View Audit Logs     |     ✗      |    ✓*    |   ✓*   |   ✓*   |     ✓
* = Organization audit logs only
```

---

## 🏢 Multi-Tenancy & Organization Isolation

### Organization Scoping

Every user (except super admin) belongs to one or more organizations.

**Principle:** A user can only access data for organizations they belong to.

```
User Sarah
├── Organization: Acme Corp
│   ├── Access to: Acme's employees, assessments, results
│   ├── Role: hr_admin
│   └── Cannot see: Other companies' data
├── Organization: Tech School
│   ├── Access to: School's students, classes, results
│   ├── Role: school_admin
│   └── Cannot see: Other schools' data
└── Global Admin (super_admin)
    ├── Access to: Everything across all organizations
    └── Role: super_admin
```

### Query Filtering Example

When HR admin requests "Show me all submissions":

```sql
-- Actual query executed:
SELECT * FROM submissions
WHERE assessment_id IN (
  SELECT id FROM assessments
  WHERE organization_id = ? -- User's organization
)
OR assessment_id IN (
  SELECT id FROM assessments
  WHERE visibility = 'public' AND status = 'published'
)
```

**Rule:** Every query filtered by organization_id to prevent data leakage.

---

## 🔒 Permission Check Middleware

### Decorator Pattern (NestJS)

```typescript
// Example: Only HR admins can invite employees
@Post('/invite')
@RequirePermission('invite:employees')
@RequireRole(['hr_admin', 'school_admin', 'community_admin'])
async inviteUser(@Body() body: InviteDto) {
  // ...
}

// Example: Can only view own results
@Get('/results/:resultId')
@RequirePermission('read:own_results')
async getResult(@Param('resultId') resultId: string, @User() user: User) {
  const result = await resultsService.findById(resultId);
  
  // Check ownership
  if (result.user_id !== user.id && !user.hasPermission('read:team_results')) {
    throw new ForbiddenException();
  }
  
  return result;
}
```

---

## 📋 Session Management

### Session Storage

```
User Session
├── Session ID (Redis key)
├── User ID
├── Organization ID(s)
├── Roles
├── Permissions
├── IP Address
├── User Agent
├── Created At
├── Last Activity
└── Expiry (1 hour inactive = logout)
```

### Logout Flow

```
1. User clicks logout
   ↓
2. Frontend deletes access token from memory
   ↓
3. Frontend calls DELETE /auth/logout
   ↓
4. Backend:
   - Add refresh token to blacklist (Redis)
   - Remove session
   ↓
5. Frontend redirects to login page
```

---

## 🔑 API Key Authentication (For Integrations)

**Future feature** for HR partners to access data programmatically.

```
API Key: pk_live_XXXXXXXXXX (50+ character random)
Stored as: SHA256 hash in database
Used in headers: Authorization: Bearer pk_live_XXXXXXXXXX

Permissions can be scoped:
- read:results
- write:invitations
- read:analytics
- etc.
```

---

## 🛡️ Security Best Practices

### Password Requirements

```
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character
- No dictionary words
- Check against compromised password database (haveibeenpwned.com)
```

### Account Lockout

```
- 5 failed login attempts → Account locked for 15 minutes
- Log failed attempts to audit trail
- Send email notification to user
```

### Password Reset Flow

```
1. User clicks "Forgot Password"
   ↓
2. Enter email address
   ↓
3. If account exists: Send reset link (valid 1 hour)
   ↓
4. User clicks link, enters new password
   ↓
5. Password reset with audit log
   ↓
6. User redirected to login
```

### Two-Factor Authentication (Phase 2)

```
After Phase 1 MVP:
- Support TOTP (Time-based One-Time Password)
- Optional for individual users
- Mandatory for organization admins
- Support authenticator apps (Google Authenticator, Authy)
```

---

## 🔐 One-Time Link Security

### Invitation Token Generation

```
1. Generate random 32-byte token
2. SHA256 hash it
3. Store hash in database (not plaintext)
4. Send plaintext link to email
5. When user clicks: Compare provided token hash with stored hash

token_hash = sha256(TOKEN)
stored_hash = database.invitations.token_hash
if (token_hash == stored_hash) { allow }
```

### Link Expiration

```
- Standard expiration: 14 days
- Customizable per organization
- Expired links: Cannot be reused
- Send reminder email at 7 days if not opened
```

### Link Security Rules

```
- One link per invitation (not reusable)
- Link tied to specific email
- If email doesn't match: Reject
- Log all link access attempts (security)
- Rate limit: 5 clicks per minute per IP
```

---

## 🚨 Rate Limiting

### Login Endpoint

```
- 5 attempts per 15 minutes (per IP)
- Exponential backoff: 1st = 0s, 2nd = 1s, 3rd = 2s, 4th = 4s, 5th = locked
- Alert user after 3 failed attempts
```

### API Endpoints

```
- Authenticated users: 100 requests per minute
- Unauthenticated users: 10 requests per minute
- Assessment submission: 1 per user per assessment per day (configurable)
```

---

## 📋 Database Additions (From Area 4)

Add these tables for auth:

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CREATE INDEX idx_sessions_user ON user_sessions(user_id);
  CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
);

CREATE TABLE token_blacklist (
  id UUID PRIMARY KEY,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CREATE INDEX idx_blacklist_expires ON token_blacklist(expires_at);
);

CREATE TABLE failed_login_attempts (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address INET,
  attempted_at TIMESTAMP DEFAULT NOW(),
  
  CREATE INDEX idx_failed_email ON failed_login_attempts(email);
  CREATE INDEX idx_failed_ip ON failed_login_attempts(ip_address);
  CREATE INDEX idx_failed_time ON failed_login_attempts(attempted_at);
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255),
  permissions JSONB,
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CREATE INDEX idx_api_keys_user ON api_keys(user_id);
  CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
);
```

---

## ❓ Open Questions for Client

1. **Session Duration:**
   - Access token: 15 minutes good or too short/long?
   - Refresh token: 7 days reasonable?
   - Idle timeout: 1 hour?

2. **Multi-Organization Users:**
   - Can individuals belong to multiple organizations?
   - Should they be able to switch between orgs, or separate accounts?
   - What happens to their personal results if they move orgs?

3. **Employee Accounts:**
   - After completing assessment via one-time link, should employee be able to create account?
   - If yes: Auto-map to organization or manual?
   - Should they see past assessments from when they were invited?

4. **Admin Hierarchy:**
   - Can HR admin create sub-admins within their organization?
   - Should there be department-level admins (for large companies)?

5. **Two-Factor Authentication:**
   - Mandatory for admins in Phase 1 or Phase 2?
   - Support for SMS or authenticator app only?

6. **API Keys:**
   - Should API keys be available in Phase 1 or defer to Phase 2?

---

## ✅ Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Token Type** | JWT | Stateless, scalable, industry standard |
| **Token Storage** | Memory (access) + HTTP-only cookie (refresh) | Balance between security and usability |
| **Session Backend** | Redis + Database | Fast sessions + audit trail |
| **Organization Isolation** | Query-level filtering | Prevents data leakage |
| **Password Hashing** | Bcrypt | Industry standard, resistant to GPU attacks |
| **Link Security** | Hash-based tokens | Cannot be intercepted/replayed |
| **Role Model** | RBAC (Role-Based Access Control) | Flexible, scalable, clear permissions |

---

## 📝 Next Steps

1. **Review & approve** auth strategy
2. **Answer the 6 open questions**
3. Move to **Area 6: Payment Architecture** (Paystack, subscriptions)
4. Then **Area 7: Result & Report System** (PDF generation)

**Time estimate:** 20 minutes to review, 15 minutes to answer questions

