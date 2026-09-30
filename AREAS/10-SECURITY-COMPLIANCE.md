# Area 10: Security & Compliance

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Legal & user safety  
**Depends On:** Area 4 🔴, Area 5 🔴, Area 9 🔴

---

## Overview

Security & Compliance ensure:
- User data is protected
- Regulatory requirements are met
- Platform is resilient to attacks
- Audit trail is maintained
- Privacy rights are respected

---

## 🔒 Data Security

### Data at Rest (Encryption)

**Database Encryption:**
```
Sensitive Fields (encrypted with AES-256):
- User passwords (actually hashed with bcrypt)
- Payment information (actually, we don't store this)
- Session tokens (hashed in blacklist)
- Invitation tokens (hashed)
- Email addresses (consider encryption for GDPR)

Encryption Strategy:
- Algorithm: AES-256-GCM
- Key Rotation: Quarterly
- Key Storage: Environment variables (not in code)
- IV: Unique per encryption
```

**File Encryption (PDFs, Exports):**
```
Files stored in Cloudinary/S3:
- Private access (not public)
- Signed URLs (expire after 24 hours)
- Scanned for malware (ClamAV)
- Virus definitions updated daily
```

**Database Backups:**
```
- Encrypted at rest (AES-256)
- Geo-redundant storage
- Access restricted (VPC only)
- Audit log of backup access
```

### Data in Transit (Encryption)

**All Network Communication:**
```
HTTPS/TLS:
- Minimum TLS 1.2
- Strong cipher suites only
- Certificate pinning (recommended)
- HSTS header enabled (6-month max-age)
```

**API Communication:**
```
Request signing (for sensitive operations):
- Include HMAC-SHA256 signature
- Timestamp included (prevent replay)
- Nonce included (one-time use)

Example:
POST /api/payment/charge
Authorization: Bearer JWT_TOKEN
X-Signature: hmac-sha256(request_body + timestamp + nonce, secret)
X-Timestamp: 1696008000
X-Nonce: abc123def456
```

### Password Security

**Password Requirements:**
```
Minimum: 8 characters
Must contain:
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&*)

NOT allowed:
- Dictionary words (checked against common passwords)
- User's email/name (no variation allowed)
- Compromised passwords (check haveibeenpwned.com API)
- Sequential characters (1234, abcd)
- Repeated characters (aaaa)
```

**Password Hashing:**
```
Algorithm: bcrypt (not salted SHA256)
Cost factor: 12 (adaptive to CPU speed)
Hash verification: Timing-resistant comparison
```

**Password Reset:**
```
1. User requests password reset
2. Generate random 32-byte token
3. Hash token with SHA256
4. Store hash in database (not plaintext token)
5. Email user with plaintext link (only this works)
6. Link valid for 1 hour
7. If user doesn't use: Expires automatically
8. Only 3 password resets per email per day (rate limit)
9. On successful reset: Invalidate all sessions
```

---

## 🛡️ Attack Prevention

### SQL Injection Prevention

```
Use parameterized queries EVERYWHERE:
✓ db.query('SELECT * FROM users WHERE email = $1', [userEmail])
✗ db.query(`SELECT * FROM users WHERE email = '${userEmail}'`)

ORM (Prisma) handles this automatically.
Additional validation: Input sanitization at API level.
```

### Cross-Site Scripting (XSS) Prevention

```
React automatically escapes values in JSX:
✓ <div>{userInput}</div>  // Safe
✗ <div dangerouslySetInnerHTML={{__html: userInput}} />  // Dangerous

Additional measures:
- Content Security Policy (CSP) header
- X-XSS-Protection header
- Sanitize HTML in user input (if allowed)
- No eval() or innerHTML
```

### Cross-Site Request Forgery (CSRF) Prevention

```
All state-changing requests require CSRF token:

1. On page load:
   GET /api/csrf-token → Returns token in response header

2. On form submission:
   POST /api/users/update
   X-CSRF-Token: token-from-header

3. Backend validates:
   - Token present
   - Token matches session
   - Token not used before
   - Token not expired (15 min)
```

### Brute Force Protection

```
Login attempts:
- 5 failed attempts in 15 minutes → Account locked for 15 minutes
- Log all failed attempts with IP, timestamp, user agent
- Email user about failed login attempts
- CAPTCHA after 3 failures (from same IP)

API rate limiting:
- 100 requests/minute per authenticated user
- 10 requests/minute per IP (unauthenticated)
- 1 request per 30 seconds for password reset

Exponential backoff:
- Attempt 1: Fail, wait 0 seconds
- Attempt 2: Fail, wait 1 second
- Attempt 3: Fail, wait 2 seconds
- Attempt 4: Fail, wait 4 seconds
- Attempt 5: Fail, locked 15 min
```

### Dependency Vulnerabilities

```
Dependency scanning:
- GitHub Dependabot (automatic)
- npm audit (on every install)
- OWASP Dependency-Check (in CI/CD)

Process:
1. Alert on HIGH/CRITICAL vulnerabilities
2. Automatic PR to update dependencies
3. Run full test suite on update
4. Manual review before merging
5. Deploy to staging first, then production
```

### API Security

```
API Key validation:
- Require API key in X-API-Key header
- Store only SHA256 hash of key
- Rate limit per key
- Revoke ability built-in
- Expiration dates (auto-expire after 1 year)

Request validation:
- Validate all inputs (type, length, format)
- Reject unknown fields (strict schema)
- Max request size: 1MB
- Content-Type must match body

Response security:
- Never expose stack traces in errors
- Use generic error messages ("Invalid request")
- Log full error details server-side
- No sensitive data in error responses
```

---

## 🔐 Compliance & Regulations

### GDPR (General Data Protection Regulation)

**Applicable to:** Users in EU

**Key Requirements:**

1. **Consent:**
   - Explicit opt-in for data collection
   - Clear privacy policy (link on signup)
   - Cannot be hidden in T&Cs
   - Withdrawal easy (one-click unsubscribe)

2. **Data Rights:**
   - Right to access: Download all personal data
   - Right to erasure: Delete all data (right to be forgotten)
   - Right to portability: Export data in standard format
   - Right to rectification: Correct inaccurate data

3. **Data Processing:**
   - Document all data uses (Data Processing Inventory)
   - Data Processing Agreement (DPA) with vendors
   - Privacy Impact Assessment (PIA)
   - Notification of breaches within 72 hours

4. **Data Protection Officer (DPO):**
   - Not required for non-public sector unless large-scale processing
   - Could designate one as best practice
   - Document DPO contact info publicly

**Implementation:**
```
Privacy Policy:
- Explain what data we collect
- Why we collect it
- How we use it
- Who we share it with
- How long we keep it
- User rights (access, deletion, etc.)

Data Processing Inventory:
- Collect → Transport → Store → Process → Delete
- For each step: What data, why, how, risks

Cookie Consent:
- Banner on first visit
- "Accept All" and "Reject All" buttons (equal prominence)
- Option to customize (which cookies to allow)
- Store preference (365 days)

User Data Export:
- Implement /api/users/me/export endpoint
- Returns ZIP with:
  - Personal data (JSON)
  - Assessment results (CSV)
  - All communications (emails, etc.)
  - Audit log of their account actions

User Deletion:
- Implement /api/users/me/delete endpoint
- Soft delete: Mark account as deleted, anonymize data
- Hard delete: Remove all traces (after 30-day grace period)
- Keep only anonymized data for analytics
```

### CCPA (California Consumer Privacy Act)

**Applicable to:** Users in California

**Key Requirements:**
- Similar to GDPR (right to access, delete, portability)
- Right to opt-out of data sales
- Right to non-discrimination (no price difference for opt-out)
- "Do Not Track" signal support (honor if present)

**Implementation:**
```
Similar to GDPR but simpler:
- Privacy policy (required)
- Data access/deletion endpoints
- Opt-out of analytics tracking
- No dark patterns (dark UX forbidden)
```

### SOC 2 (Service Organization Control)

**Applicable if:** Processing sensitive customer data

**Scope:**
- Security: Protect data from unauthorized access
- Availability: Ensure system uptime
- Integrity: Data accuracy & completeness
- Confidentiality: Data kept confidential
- Privacy: Personal data handled correctly

**Requirements:**
- Documented security policies
- Access controls & audit logs
- Incident response plan
- Employee training
- Regular security assessments
- Independent annual audit

**Our Approach:**
```
Implement controls aligned with SOC 2:
✓ Access control: RBAC + audit logs
✓ Encryption: At rest & in transit
✓ Monitoring: Alerts on suspicious activity
✓ Incident response: Playbook + notification
✓ Backups: Automated, tested quarterly
✓ Change management: Documented, reviewed
✓ Vendor management: DPAs with third parties
```

### Industry-Specific Regulations

**If handling health data (psychological assessments):**
- HIPAA (US) - very strict, probably don't want this
- Consider: Not storing health data, just personality insights

**If operating in UK:**
- Data Protection Act 2018 (UK GDPR equivalent)

**If operating in Canada:**
- PIPEDA (Personal Information Protection and Electronic Documents Act)

---

## 🔍 Audit Logging

### What to Log

**User Actions:**
```sql
audit_logs table:
- Who: user_id
- What: action (login, create_assessment, export_data)
- When: timestamp
- Where: IP address, user agent
- Status: success/failure
- Details: JSON with relevant details

Retention: 7 years (legal requirement for financial transactions)
```

**System Actions:**
```
- Database backups (when, size, status)
- Deployment events (who, when, what version)
- Configuration changes (old value, new value)
- Secret rotations (timestamp only, not the secrets)
- Permission changes (user before/after)
```

**Security Events:**
```
- Login attempts (success/failure)
- Failed password reset attempts
- Permission denied (user tried unauthorized action)
- Account lockouts
- Session invalidations
- API key creation/deletion
- 2FA changes
```

**Payment Events:**
```
- Payment initiated
- Payment webhook received (from Paystack)
- Payment processed
- Refund issued
- Chargeback received
- Reconciliation completed
```

### Audit Log Storage

```
Table: audit_logs (immutable)
- Replicated to separate storage
- Never modified (append-only)
- Compressed after 1 year
- Archived after 7 years
- Accessible only to admins & auditors

Access Control:
- Super admin: Full access
- Organization admin: Own org only
- Regular user: Own actions only
- No one can delete audit logs (except retention policy)
```

---

## 📋 Security Checklist

### Pre-Launch (MVP)

- [ ] HTTPS/TLS enabled on all endpoints
- [ ] Passwords hashed (bcrypt)
- [ ] Session tokens hashed
- [ ] Input validation on all API endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (React escaping)
- [ ] CSRF protection (tokens)
- [ ] Rate limiting implemented
- [ ] Failed login lockout
- [ ] Audit logging implemented
- [ ] Secrets not in code/git
- [ ] Database backups working
- [ ] Disaster recovery tested
- [ ] Security headers set (CSP, HSTS, X-Frame-Options)
- [ ] CORS configured restrictively
- [ ] API authentication required
- [ ] Encryption at rest (sensitive data)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] GDPR compliance (if EU users)
- [ ] Data export working
- [ ] Data deletion working
- [ ] Incident response plan documented
- [ ] On-call rotation setup
- [ ] Security training completed

### Post-Launch (Ongoing)

- [ ] Monthly security updates review
- [ ] Quarterly dependency audit
- [ ] Semi-annual penetration testing
- [ ] Annual SOC 2 audit (if applicable)
- [ ] Regular backup restoration tests (quarterly)
- [ ] Disaster recovery drill (annually)
- [ ] Security incident post-mortems

---

## 🚨 Incident Response Plan

### Data Breach Scenario

**If data leak discovered:**

```
Immediate (< 1 hour):
1. Isolate affected systems
2. Stop ongoing access/exfiltration
3. Preserve evidence (logs, memory dumps)
4. Notify legal & security lead
5. Activate incident response team

Within 24 hours:
1. Determine scope (what data, how many users)
2. Notify affected users
3. Notify regulatory bodies (if required by law)
4. Begin forensic investigation
5. Post-mortem analysis

Within 72 hours:
1. Publish incident statement (website/blog)
2. Provide remediation steps to users
3. Offer credit monitoring (if financial data)
4. Complete root cause analysis
5. Implement preventive measures

Post-incident:
1. Document lessons learned
2. Update security policies
3. Security training for team
4. Quarterly review of similar risks
```

### Outage Scenario

**If service down:**

```
Immediate:
1. Alert on-call engineer (PagerDuty/SMS)
2. Activate incident bridge (Slack channel)
3. Check status page
4. Implement initial diagnosis

Within 5 minutes:
- Identify root cause
- Attempt immediate fix/rollback

Within 15 minutes:
- If not recovered: Activate war room (call)
- Escalate if needed

Within 1 hour:
- Restore service
- Verify functionality
- Post-mortem scheduled

Within 24 hours:
- Root cause analysis completed
- Preventive measures implemented
- Post-mortem meeting held
- Incident summary published
```

---

## ❓ Open Questions for Client

1. **Security Level:**
   - MVP security level sufficient?
   - Need pre-launch penetration testing?
   - Budget for security audit?

2. **Compliance Priority:**
   - Which regulations are critical?
   - GDPR only? Also CCPA?
   - SOC 2 certification needed?

3. **Data Retention:**
   - How long to keep submission responses? (Already asked in Area 4)
   - Purge schedule or manual review?

4. **Incident Response:**
   - Who manages security incidents?
   - On-call rotation size?
   - Insurance for data breaches?

5. **Audit Logging:**
   - Who can access audit logs?
   - Export audit logs for compliance?
   - How long retention? (Already asked: 7 years)

6. **Third-Party Vendors:**
   - OK with Paystack for payments?
   - OK with Cloudinary for files?
   - OK with Resend for emails?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Encryption** | AES-256 for sensitive data | Industry standard |
| **Password Hash** | Bcrypt (cost 12) | Resistant to GPU attacks |
| **Session Token** | JWT + secure cookie | Stateless, secure |
| **Audit Logging** | Immutable, 7-year retention | Legal requirement |
| **GDPR Compliance** | Full support for data rights | Legal requirement for EU |
| **Incident Response** | Documented playbook | Minimize damage |
| **Monitoring** | Datadog APM + security alerts | Early breach detection |

---

## 📝 Next Steps

1. Answer 6 open questions
2. Approve security & compliance strategy
3. Review security checklist
4. Move to **Area 11: UI/UX System**

