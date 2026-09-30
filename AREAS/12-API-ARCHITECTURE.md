# Area 12: API Architecture

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Backend contract  
**Depends On:** Area 2 🔴, Area 4 🔴, Area 5 🔴

---

## Overview

API Architecture defines:
- All REST endpoints
- Request/response formats
- Authentication requirements
- Error handling
- Validation rules
- API versioning strategy

---

## 📋 API Principles

```
1. RESTful Design
   - Use HTTP methods properly (GET, POST, PUT, DELETE)
   - Resource-based URLs (/assessments not /getAssessments)
   - Standard status codes (200, 201, 400, 401, 403, 404, 500)

2. Stateless
   - No server-side session state in API
   - All info in JWT token
   - Horizontally scalable

3. Versioned
   - API version in URL: /api/v1/
   - Allow multiple versions simultaneously
   - Deprecation notice 6 months before removal

4. Consistent
   - Same response format for all endpoints
   - Consistent error messages
   - Consistent validation
   - Standard headers

5. Documented
   - Swagger/OpenAPI spec
   - Auto-generated API docs
   - Code examples

6. Secure
   - HTTPS only
   - JWT authentication
   - Rate limiting
   - CORS restricted
```

---

## 🔑 Authentication

### Header Format

```
GET /api/v1/assessments
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

X-Request-ID: uuid (for tracking)
User-Agent: [browser]
Content-Type: application/json
```

### Error Responses

```
401 Unauthorized (missing/invalid token)
{
  "error": "Unauthorized",
  "message": "JWT token expired",
  "code": "JWT_EXPIRED"
}

403 Forbidden (authenticated but no permission)
{
  "error": "Forbidden",
  "message": "You do not have permission to access this resource",
  "code": "PERMISSION_DENIED"
}
```

---

## 🛣️ Core Endpoints

### Authentication Endpoints

```
POST /api/v1/auth/signup
Body: { email, password, fullName }
Response: { user, tokens: { accessToken, refreshToken } }

POST /api/v1/auth/login
Body: { email, password }
Response: { user, tokens: { accessToken, refreshToken } }

POST /api/v1/auth/refresh
Body: { refreshToken }
Response: { accessToken }

POST /api/v1/auth/logout
Body: {}
Response: { success: true }

POST /api/v1/auth/forgot-password
Body: { email }
Response: { message: "Password reset email sent" }

POST /api/v1/auth/reset-password
Body: { token, password }
Response: { message: "Password reset successful" }
```

### User Endpoints

```
GET /api/v1/users/me
Response: { id, email, fullName, profilePicture, ... }

PUT /api/v1/users/me
Body: { fullName, profilePicture, timezone, language }
Response: { updatedUser }

PUT /api/v1/users/me/password
Body: { currentPassword, newPassword }
Response: { message: "Password updated" }

GET /api/v1/users/me/export
Response: ZIP file containing all personal data

DELETE /api/v1/users/me
Body: { password (confirm) }
Response: { message: "Account deletion scheduled" }
```

### Organization Endpoints

```
POST /api/v1/organizations
Body: { name, type, industry, ... }
Response: { organization }

GET /api/v1/organizations/:orgId
Response: { organization with members, assessments, etc. }

PUT /api/v1/organizations/:orgId
Body: { name, logo, primaryColor, ... }
Response: { updatedOrganization }

GET /api/v1/organizations/:orgId/members
Response: [ { userId, name, role, department, ... } ]

POST /api/v1/organizations/:orgId/members/:memberId
Body: { role } (invite or update role)
Response: { updatedMember }

DELETE /api/v1/organizations/:orgId/members/:memberId
Response: { message: "Member removed" }

GET /api/v1/organizations/:orgId/invitations
Response: [ { invitationId, email, status, createdAt, ... } ]

POST /api/v1/organizations/:orgId/invitations
Body: { email, department, role }
Response: { invitation, shareLink }

DELETE /api/v1/organizations/:orgId/invitations/:invitationId
Response: { message: "Invitation revoked" }
```

### Assessment Endpoints

```
GET /api/v1/assessments
Query: { status, organizationId, limit, offset }
Response: [ assessments ], { pagination }

POST /api/v1/assessments (admin only)
Body: { name, description, sections[], questions[] }
Response: { assessment }

GET /api/v1/assessments/:assessmentId
Response: { assessment with full details }

PUT /api/v1/assessments/:assessmentId (admin only)
Body: { name, description, ... }
Response: { updatedAssessment }

GET /api/v1/assessments/:assessmentId/questions
Response: [ questions ] (for UI rendering)

POST /api/v1/assessments/:assessmentId/publish (admin)
Response: { publishedAssessment }

DELETE /api/v1/assessments/:assessmentId (admin)
Response: { message: "Assessment archived" }
```

### Submission Endpoints

```
POST /api/v1/submissions
Body: { assessmentId, invitationToken (optional) }
Response: { submission }

GET /api/v1/submissions/:submissionId
Response: { submission with user, status, progress }

PUT /api/v1/submissions/:submissionId/answers
Body: [ { questionId, answerValue } ]
Response: { submission (updated) }

POST /api/v1/submissions/:submissionId/submit
Body: {}
Response: { submission (marked complete), results }

GET /api/v1/submissions/user/:userId
Query: { assessmentId, limit, offset }
Response: [ submissions ]
```

### Results Endpoints

```
GET /api/v1/results/:submissionId
Response: { result with scores, interpretation }

GET /api/v1/results/:submissionId/pdf
Response: PDF file (download or inline)

POST /api/v1/results/:submissionId/share
Body: { expireAfterDays, passwordProtect }
Response: { shareToken, shareUrl }

GET /api/v1/results/shared/:shareToken
Response: { result (if valid share link) }

POST /api/v1/results/:submissionId/email
Body: { email }
Response: { message: "Results emailed" }
```

### Dashboard Endpoints (Aggregate Data)

```
GET /api/v1/dashboard/personal
Response: { personalStats, recentResults, improvements }

GET /api/v1/dashboard/organization/:orgId
Response: { teamStats, personality distribution, completion status }

GET /api/v1/dashboard/admin
Response: { system-wide stats, revenue, users, organizations }

POST /api/v1/dashboard/organization/:orgId/export
Body: { format: "csv" | "pdf", filters }
Response: CSV/PDF file

GET /api/v1/dashboard/organization/:orgId/team-compatibility
Response: { compatibilityMatrix, recommendations }
```

### Payment Endpoints

```
POST /api/v1/payments/initiate
Body: { amount, paymentType, assessmentId (optional) }
Response: { authorization_url, reference }

POST /api/v1/payments/webhook (Paystack)
Body: (from Paystack)
Response: { status: "ok" }

GET /api/v1/payments/:paymentId
Response: { payment, status, receipt }

POST /api/v1/payments/:paymentId/refund (admin)
Body: { reason }
Response: { refund }

GET /api/v1/subscriptions/:orgId
Response: { subscription, plan, renewalDate, ... }

PUT /api/v1/subscriptions/:orgId/upgrade
Body: { newPlan }
Response: { updatedSubscription, proRataCharge }

POST /api/v1/subscriptions/:orgId/cancel
Body: { cancelAtPeriodEnd: bool }
Response: { subscription (marked for cancellation) }
```

---

## 📄 Standard Response Format

### Success Response (2xx)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "John Doe",
    ...
  },
  "meta": {
    "timestamp": "2026-09-25T14:30:00Z",
    "version": "v1"
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [ {...}, {...}, ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasMore": true
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-09-25T14:30:00Z",
    "requestId": "req-uuid"
  }
}
```

---

## ✅ Validation Rules

### Global Rules

```
All inputs validated:
- Type checking (email is string, age is number)
- Length validation (email max 255 chars)
- Format validation (email matches pattern)
- Whitespace trimmed
- No HTML/scripts allowed (except in designated fields)

Before reaching database:
- Validation on API layer (fail fast)
- Validation on database layer (defense in depth)
- Zod schema validation (NestJS)
```

### Common Validations

```
Email:
- Required
- Max 255 characters
- Valid email format
- Unique (if signup)

Password:
- Required
- Min 8 characters
- Max 128 characters
- Contains uppercase, lowercase, number, special char

Full Name:
- Required
- Max 255 characters
- No emojis or unusual characters

Assessment Name:
- Required
- Min 3, Max 255 characters
- Unique within organization

Question Text:
- Required
- Min 10, Max 1000 characters

Scores:
- Integer
- Min 0, Max 100
```

---

## 🔄 Rate Limiting

### By Endpoint

```
Public endpoints (unauthenticated):
- Login: 5 attempts per 15 minutes per IP
- Signup: 3 per hour per IP
- Password reset: 3 per hour per email

Authenticated endpoints:
- Assessment submission: 1 per assessment per user per day
- Export: 5 per hour per user
- Generic API: 100 requests per minute per user

Admin endpoints:
- All admin: 1000 requests per minute (higher limit)

Webhook endpoints:
- Paystack webhook: No limit (whitelist IPs)
```

---

## 🔀 API Versioning

### Version in URL

```
Current: /api/v1/...
Next: /api/v2/... (if breaking changes)

Breaking changes require:
1. New version endpoint
2. Old version deprecated (6-month notice)
3. Both versions run in parallel
4. Clients must migrate before deprecation
```

### Backwards Compatibility

```
Non-breaking changes (no version needed):
✓ Adding new optional fields
✓ Adding new endpoints
✓ Adding new query parameters

Breaking changes (need new version):
✗ Removing fields
✗ Changing field types
✗ Changing endpoint paths
✗ Changing required parameters
```

---

## 📊 Monitoring & Analytics

### API Metrics

```
Track per endpoint:
- Request count
- Average response time (p50, p95, p99)
- Error count & rate
- Status code distribution

Alert on:
- Response time > 500ms
- Error rate > 1%
- Failed health check
- Unusual spike in requests
```

---

## ❓ Open Questions for Client

1. **GraphQL vs REST:**
   - REST (recommended) or also GraphQL?
   - GraphQL adds complexity, REST simpler to start

2. **API Versioning:**
   - Maintain multiple versions?
   - How long to support old versions?

3. **Webhooks:**
   - Need webhook system for partners?
   - Or just Paystack webhooks?

4. **File Upload:**
   - Direct to Cloudinary or via API?
   - Size limits?

5. **Real-Time:**
   - Need WebSockets for live updates?
   - Or polling sufficient?

6. **API Documentation:**
   - Auto-generate with Swagger?
   - Interactive API explorer (Swagger UI)?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Architecture** | REST (not GraphQL) | Simpler, easier to document, faster to build |
| **Versioning** | URL-based (/v1/) | Standard, easy to maintain multiple versions |
| **Response Format** | JSON + consistent schema | Standard, predictable for clients |
| **Validation** | Zod (NestJS) | Type-safe, good error messages |
| **Authentication** | JWT in Authorization header | Stateless, scalable |
| **Rate Limiting** | Per endpoint + per user | Prevents abuse and accidental DOS |
| **Documentation** | Swagger/OpenAPI | Auto-generated, always current |

---

## 📝 Next Steps

1. Answer 6 open questions
2. Review all endpoints
3. Approve API design
4. Move to **Area 13: Development Workflow**

