# API Security Deep-Dive

**Companion to:** Area 12: API Architecture  
**Focus:** Comprehensive security architecture for REST API  
**Priority:** CRITICAL — Foundation of platform security

---

## 🔐 Security Layers

```
Request → Layer 1: TLS/HTTPS
           ↓
           Layer 2: CORS & Origin Validation
           ↓
           Layer 3: Authentication (JWT)
           ↓
           Layer 4: Authorization (RBAC)
           ↓
           Layer 5: Rate Limiting
           ↓
           Layer 6: Input Validation
           ↓
           Layer 7: Business Logic
           ↓
           Layer 8: Output Sanitization
           ↓
Response ← Layer 9: Error Handling
```

---

## 🔒 Layer 1: Transport Security (TLS/HTTPS)

### HTTPS Enforcement

**ALL requests must use HTTPS:**
```
✓ Enforce on all endpoints (no HTTP fallback)
✓ Redirect HTTP → HTTPS (301 permanent redirect)
✓ HSTS header enabled (6-month max-age)
✗ NO mixed-content (HTTP resources on HTTPS page)
```

### TLS Configuration

```
Minimum: TLS 1.2
Recommended: TLS 1.3

Strong ciphers only:
✓ ECDHE-ECDSA-AES128-GCM-SHA256
✓ ECDHE-RSA-AES128-GCM-SHA256
✗ NULL, EXPORT, anon ciphers (disabled)
✗ DES, RC4, MD5 (weak, removed)

Certificate:
✓ Let's Encrypt (auto-renewed)
✓ Valid domain name
✓ No self-signed certs in production
✓ Certificate pinning (optional, for mobile)
```

### Response Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  → Force HTTPS for 1 year, including subdomains

X-Content-Type-Options: nosniff
  → Prevent MIME type sniffing

X-Frame-Options: DENY
  → Prevent clickjacking (block frame embedding)

X-XSS-Protection: 1; mode=block
  → Enable XSS filter (legacy, for old browsers)

Referrer-Policy: strict-origin-when-cross-origin
  → Control referrer information sent to other sites

Permissions-Policy: geolocation=(), microphone=(), camera=()
  → Disable unused browser APIs
```

---

## 🔓 Layer 2: CORS & Origin Validation

### CORS Configuration

```
Allowed Origins:
✓ https://personality-badge.com
✓ https://app.personality-badge.com
✓ https://admin.personality-badge.com
✓ localhost:3000 (development only)
✗ * (wildcard - NEVER in production)

Allowed Methods:
✓ GET, POST, PUT, DELETE, OPTIONS
✗ TRACE, CONNECT, PATCH (not needed, explicitly deny)

Allowed Headers:
✓ Content-Type
✓ Authorization
✓ X-Request-ID
✓ X-API-Key
✗ Accept-Encoding (handled by server)

Exposed Headers:
✓ X-Request-ID
✓ X-RateLimit-Limit
✓ X-RateLimit-Remaining
✗ Authorization (never expose)
✗ Set-Cookie (always HttpOnly)

Allow Credentials: true
  → Allow cookies/auth headers in cross-origin requests

Max-Age: 86400
  → Cache preflight responses for 24 hours
```

### Implementation

```typescript
// NestJS CORS configuration
app.enableCors({
  origin: [
    'https://personality-badge.com',
    'https://app.personality-badge.com',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400,
});
```

---

## 🔑 Layer 3: Authentication (JWT Security)

### JWT Implementation

**Token Structure:**
```
Header:   { alg: "HS256", typ: "JWT" }
Payload:  { sub, iss, aud, type, roles, permissions, iat, exp }
Signature: HMAC-SHA256(header + "." + payload, secret)
```

**Token Security:**
```
Algorithm: HS256 or RS256 (NOT HS512, NOT "none")
Secret: 256-bit (32 bytes) minimum
Storage: HTTP-only, Secure, SameSite cookies (or Authorization header)
Rotation: Every 90 days (key rotation)
```

### Access Token

```json
{
  "sub": "user-uuid",
  "iss": "personality-badge",
  "aud": "api",
  "type": "access",
  "org_id": "org-uuid",
  "roles": ["user", "hr_admin"],
  "permissions": ["read:results", "write:assessments"],
  "iat": 1696008000,
  "exp": 1696008900
}
```

**Properties:**
- Duration: 15 minutes (short-lived)
- Claims: Minimal (only what's needed for auth)
- Signing: Server-side only (never trust client-signed tokens)
- Validation: Check signature, expiry, audience

### Refresh Token

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

**Properties:**
- Duration: 7 days (longer-lived)
- Storage: HTTP-only, Secure cookie (never in localStorage)
- Rotation: Issue new refresh token on each use (refresh token rotation)
- Revocation: Add to blacklist if compromised

### Token Refresh Flow

```
Client has expired access token
  ↓
Client sends refresh token (in cookie or body)
  ↓
Server validates refresh token:
  - Check signature
  - Check expiry
  - Check if blacklisted
  - Check if user still active
  ↓
Server issues:
  - New access token (15 min)
  - New refresh token (7 days, invalidates old)
  - Blacklist old refresh token (prevents reuse)
  ↓
Client stores new tokens
  ↓
Client retries original request
```

### Token Validation Middleware

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // 1. Extract token from header
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }
    
    const token = authHeader.slice(7);
    
    // 2. Verify signature (timing-safe comparison)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'api',
      issuer: 'personality-badge',
    });
    
    // 3. Check if blacklisted (logout)
    if (isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    
    // 4. Check if user still active
    const user = await userService.findById(decoded.sub);
    if (!user || user.status === 'suspended') {
      throw new UnauthorizedException('User account disabled');
    }
    
    // 5. Attach to request
    request.user = decoded;
    return true;
  }
}
```

---

## 👥 Layer 4: Authorization (RBAC)

### Role-Based Access Control

```typescript
// Define permissions per role
const rolePermissions = {
  'user': ['read:own_results', 'take:assessments'],
  'hr_admin': ['read:team_results', 'invite:employees', 'manage:assessments'],
  'school_admin': ['manage:classes', 'read:class_results'],
  'super_admin': ['*'], // All permissions
};

// Check permissions in guards
@UseGuards(JwtAuthGuard, PermissionGuard)
@Permission('read:team_results')
@Post('/dashboard/organization/:orgId')
getTeamDashboard(@Param('orgId') orgId: string, @User() user: any) {
  // Only runs if user has 'read:team_results' permission
}
```

### Organization Isolation

**CRITICAL: Every query must filter by organization:**

```typescript
// ❌ WRONG - Could expose other orgs' data
const results = await resultsService.findAll();

// ✅ CORRECT - Filters by user's organization
const results = await resultsService.findByOrgId(user.org_id);

// ✅ ALSO CORRECT - Double-check in service
async findByOrgId(orgId: string) {
  return db.results.where({ 
    organization_id: orgId,  // Primary filter
    user_organization_id: orgId  // Secondary check
  });
}
```

### Multi-Tenancy Security

```
Every API endpoint must:
1. Extract user's org_id from JWT token
2. Verify org_id in request matches JWT org_id
3. Filter ALL queries by org_id
4. Never expose data from other orgs
5. Return 403 Forbidden if org mismatch

Example:
GET /api/v1/organizations/:orgId/results
  ↓
Check: request.params.orgId === request.user.org_id
  ↓
If not match: throw ForbiddenException
  ↓
Query: SELECT * FROM results WHERE org_id = ?
```

---

## 🚨 Layer 5: Rate Limiting

### Rate Limit Strategy

**Public Endpoints (Unauthenticated):**
```
POST /auth/login:
  - 5 attempts per 15 minutes per IP
  - After 5 failures: Lock account 15 min
  - Log failed attempts (for security monitoring)

POST /auth/signup:
  - 3 per hour per IP
  - Prevent account creation spam

POST /auth/forgot-password:
  - 3 per hour per email
  - Prevent password reset abuse

GET /assessments (public):
  - 10 per minute per IP
  - Prevent crawling/scraping
```

**Authenticated Endpoints:**
```
General API:
  - 100 requests per minute per user
  - 1000 per user per hour

Assessment submission:
  - 1 per assessment per user per day
  - Prevent double-submission

Export/Download:
  - 5 per hour per user
  - Prevent resource exhaustion

Webhook endpoints:
  - No limit (whitelist Paystack IPs instead)
```

### Implementation

```typescript
// Rate limiting middleware
@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Get identifier (user ID or IP address)
    const identifier = request.user?.id || request.ip;
    const key = `ratelimit:${identifier}:${request.path}`;
    
    // Check Redis for current count
    const current = redis.incr(key);
    
    if (current === 1) {
      // First request in window, set expiry
      redis.expire(key, 60); // 60-second window
    }
    
    const limit = this.getLimitForEndpoint(request.path, request.user);
    
    // Set response headers
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
    response.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
    
    if (current > limit) {
      throw new TooManyRequestsException(
        'Rate limit exceeded. Try again in ' + 
        response.getHeader('X-RateLimit-Reset')
      );
    }
    
    return true;
  }
}
```

---

## 🛡️ Layer 6: Input Validation

### Validation Strategy: Defend in Depth

```
1. Schema Validation (Zod)
   - Type checking
   - Required/optional fields
   - Length limits
   - Format validation (email, URL, etc.)

2. Business Logic Validation
   - Does user own this resource?
   - Is organization still active?
   - Are we within quota limits?

3. Database Constraints
   - Unique constraints
   - Foreign key constraints
   - NOT NULL constraints
```

### Zod Schemas

```typescript
// Define strict validation schemas
const CreateAssessmentSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be at most 255 characters'),
  
  description: z.string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional(),
  
  sections: z.array(
    z.object({
      name: z.string().min(1),
      questions: z.array(
        z.object({
          text: z.string().min(10).max(1000),
          type: z.enum(['radio', 'slider', 'matrix']),
          options: z.array(z.string()).min(2)
        })
      ).min(1)
    })
  ).min(1, 'At least one section required'),
});

// Use in endpoint
@Post('/assessments')
async create(@Body(new ValidationPipe({ transform: true })) 
  body: CreateAssessmentDto) {
  const validated = CreateAssessmentSchema.parse(body);
  // Body is now guaranteed safe
}
```

### SQL Injection Prevention

```typescript
// ❌ VULNERABLE - String interpolation
const results = await db.query(
  `SELECT * FROM results WHERE user_id = '${userId}'`
);

// ✅ SAFE - Parameterized queries (Prisma handles automatically)
const results = await prisma.results.findMany({
  where: { user_id: userId }
});

// ✅ SAFE - Raw SQL with parameters
const results = await db.query(
  'SELECT * FROM results WHERE user_id = $1',
  [userId]
);
```

### XSS Prevention

```typescript
// ❌ VULNERABLE - Storing user input as-is
const note = req.body.note; // User can store "<script>..."
await db.notes.create({ content: note });

// ✅ SAFE - Sanitize on output (React auto-escapes)
const note = sanitize(req.body.note); // Remove HTML tags
// React components automatically escape interpolated values

// ✅ SAFE - Use DOMPurify for user-generated content
import DOMPurify from 'isomorphic-dompurify';
const sanitized = DOMPurify.sanitize(userInput);
```

---

## 🔐 Layer 7: Sensitive Data Handling

### What NOT to Return

```
NEVER include in API responses:
✗ Passwords (hashed or plain)
✗ API keys or secrets
✗ Credit card numbers
✗ Social security numbers
✗ Full payment method details
✗ Unencrypted PII
✗ Database salts
✗ Internal error stack traces
✗ File paths or system info

SANITIZE before returning:
✓ Email addresses (mask in some contexts)
✓ Phone numbers (last 4 digits only in list views)
✓ Full assessment history (if private)
✓ Payment details (last 4 of card, expiry only)
```

### Example: Safe Responses

```typescript
// ❌ WRONG - Includes password hash
const user = await db.users.findById(userId);
return res.json(user); // Includes password_hash!

// ✅ CORRECT - Exclude sensitive fields
const user = await db.users.findById(userId);
const { password_hash, refresh_token, ...safe } = user;
return res.json(safe);

// ✅ BETTER - Use serializer/presenter
class UserPresenter {
  static toJSON(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      profilePicture: user.profilePicture,
      // Excludes all sensitive fields
    };
  }
}
return res.json(UserPresenter.toJSON(user));
```

---

## 🚨 Layer 8: Error Handling

### Safe Error Messages

```typescript
// ❌ WRONG - Reveals too much
try {
  const user = await db.users.findByEmail(email);
  if (!user) throw new Error('No user with that email');
  // ^ This reveals which emails exist in system!
} catch (err) {
  return res.status(500).json({ error: err.message });
  // ^ Stack trace exposes database structure
}

// ✅ CORRECT - Generic messages to client
try {
  const user = await db.users.findByEmail(email);
  if (!user) {
    // Log detailed info server-side
    logger.warn(`Login attempt for non-existent email: ${email}`);
    // Return generic message to client
    throw new UnauthorizedException('Invalid email or password');
  }
} catch (err) {
  // Log full error server-side
  logger.error('Login error', err);
  
  // Return generic message to client
  return res.status(401).json({
    error: 'Authentication failed',
    message: 'Invalid email or password',
    // NO stack trace, NO database errors
  });
}
```

### Error Status Codes (Security-Relevant)

```
401 Unauthorized
  - JWT invalid/expired
  - Missing authentication
  - Wrong credentials

403 Forbidden
  - User authenticated but not authorized
  - Trying to access another org's data
  - Permission check failed

400 Bad Request
  - Input validation failed
  - Malformed request

429 Too Many Requests
  - Rate limit exceeded

500 Internal Server Error
  - Generic error (never expose details)

All 5xx errors: Log full stack trace server-side, return generic message
```

---

## 📊 Layer 9: Logging & Monitoring

### Security Events to Log

```
✓ Failed login attempts (with IP, email)
✓ Successful logins (user, IP, time)
✓ Permission denials (user, action, resource)
✓ Account lockouts
✓ Password changes
✓ Failed rate limits (IP, endpoint)
✓ API key creation/deletion
✓ Refund requests
✓ Data exports
✓ Suspicious patterns (brute force, etc.)

NEVER log:
✗ Passwords (even hashes)
✗ Full credit card numbers
✗ API secrets
✗ JWT tokens (only token ID)
```

### Monitoring Alerts

```
Alert on:
⚠️ 5+ failed login from same IP in 15 min
⚠️ Failed rate limit from same IP in 1 min (DoS attempt)
⚠️ User trying to access other organization's data
⚠️ Multiple password reset attempts
⚠️ Refund rate > 5% of transactions
⚠️ API response time > 500ms (possible attack)
⚠️ Database query taking > 10 seconds
```

---

## 🔗 Layer 10: Third-Party API Security

### Paystack Integration

```typescript
// ❌ WRONG - Validates Paystack response by comparing amounts
const payment = req.body; // Could be spoofed
if (payment.amount === expected) {
  // Trust it and mark as paid
}

// ✅ CORRECT - Verify Paystack webhook signature
const secret = process.env.PAYSTACK_SECRET_KEY;
const hash = crypto
  .createHmac('sha512', secret)
  .update(JSON.stringify(req.body))
  .digest('hex');

if (hash !== req.headers['x-paystack-signature']) {
  return res.status(403).json({ error: 'Invalid signature' });
}

// Now safe to trust the webhook
const payment = req.body;
// Update database
```

### API Key Security

```
✓ Generate: 32+ random bytes (cryptographically secure)
✓ Store: SHA256 hash only (never plaintext)
✓ Transmit: HTTPS only
✓ Rotate: Every 90 days
✓ Revoke: Immediately if leaked

Format: pk_live_[32-random-chars]

Protect:
- Never log full key
- Never send in URL parameters
- Never store in code
- Always use HTTPS
```

---

## 🔐 API Key Validation

```typescript
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Extract API key from header
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }
    
    // Hash the key for lookup
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Look up in database
    const apiKeyRecord = await apiKeyService.findByHash(keyHash);
    if (!apiKeyRecord || !apiKeyRecord.active) {
      throw new UnauthorizedException('Invalid API key');
    }
    
    // Check expiration
    if (apiKeyRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }
    
    // Check permissions
    if (!apiKeyRecord.permissions.includes(request.path)) {
      throw new ForbiddenException('API key not authorized for this endpoint');
    }
    
    // Update last used
    await apiKeyService.updateLastUsed(keyHash);
    
    // Attach to request
    request.apiKey = apiKeyRecord;
    return true;
  }
}
```

---

## 🛡️ OWASP Top 10: API Security

| Risk | Mitigation |
|------|-----------|
| **A1: Broken Auth** | JWT + refresh token rotation + password reset verification |
| **A2: Broken Access** | Organization filtering + RBAC + permission checks |
| **A3: Injection** | Parameterized queries + input validation (Zod) |
| **A4: Insecure Design** | Threat modeling + security requirements |
| **A5: Security Misconfiguration** | Rate limiting + CORS + HTTPS enforcement |
| **A6: Vulnerable Components** | Dependency scanning + security updates |
| **A7: Auth Failure** | Account lockout + failed login logging + email verification |
| **A8: Data Integrity** | Signature verification for webhooks + checksums |
| **A9: Logging Failures** | Comprehensive logging + monitoring + alerts |
| **A10: SSRF** | Whitelist allowed domains + validate URLs |

---

## 🚨 Security Incident Response

### Suspected Breach

```
1. Immediately (< 1 hour)
   - Stop the suspected access
   - Capture evidence (logs, memory dumps)
   - Activate incident team
   - Secure the affected systems

2. Within 24 hours
   - Determine scope (what data accessed?)
   - Notify affected users
   - Notify regulatory bodies (if required)
   - Begin forensic analysis

3. Within 72 hours
   - Complete investigation
   - Implement fixes
   - Notify public (if appropriate)

4. Post-incident
   - Post-mortem analysis
   - Update security controls
   - Security training
```

---

## ✅ Pre-Launch Security Checklist

- [ ] HTTPS enabled on all endpoints
- [ ] HSTS header configured
- [ ] CORS restricted to known origins
- [ ] JWT signature verified on every request
- [ ] Refresh token rotation implemented
- [ ] Organization isolation enforced
- [ ] RBAC permissions checked
- [ ] Rate limiting implemented
- [ ] Input validation (Zod) on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output escaping)
- [ ] Error messages don't leak sensitive info
- [ ] Sensitive fields excluded from responses
- [ ] Security event logging enabled
- [ ] Failed login lockout implemented
- [ ] Password reset verification working
- [ ] API key signing verified (webhooks)
- [ ] No hardcoded secrets in code
- [ ] Secrets in environment variables
- [ ] Dependency vulnerabilities scanned
- [ ] Rate limit headers in responses
- [ ] Health check endpoint available
- [ ] API documentation doesn't expose sensitive endpoints
- [ ] CORS preflight requests handled
- [ ] Timezone handling consistent (UTC)
- [ ] Request ID tracking enabled
- [ ] User agent validation optional

---

## 🔄 Ongoing Security

### Monthly
- Review security logs for anomalies
- Update dependencies
- Test backup/recovery

### Quarterly
- Rotate API keys
- Rotate JWT secrets
- Penetration test (if budget allows)
- Security audit
- Team security training

### Annually
- Full security assessment
- SOC 2 audit (if applicable)
- Incident response drill

---

## 📚 Security Libraries (NestJS)

```typescript
// JWT handling
import { JwtModule } from '@nestjs/jwt';

// Input validation
import { class-validator } from 'class-validator';
import { z } from 'zod';

// Rate limiting
import rateLimit from 'express-rate-limit';

// Helmet (security headers)
import helmet from '@nestjs/helmet';

// CORS
import { CorsModule } from '@nestjs/common';

// Encryption
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Logging
import { WinstonModule } from 'nest-winston';

// Security scanning
import { dependencyCheck } from 'npm-audit';
```

---

## 🎯 Summary

**Security is not optional.** It must be built into every layer:

1. **Transport:** HTTPS + TLS 1.3
2. **Network:** CORS + IP whitelisting
3. **Authentication:** JWT + refresh token rotation
4. **Authorization:** RBAC + organization isolation
5. **Rate Limiting:** Per user + per IP + per endpoint
6. **Input:** Strict validation + parameterized queries
7. **Business Logic:** Domain-specific rules
8. **Output:** Sanitization + sensitive field exclusion
9. **Errors:** Generic messages + server-side logging
10. **Monitoring:** Alerts + audit logs

**Default: Deny everything. Explicitly allow only what's needed.**

