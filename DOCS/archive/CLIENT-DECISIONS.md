# Client Decisions & Open Questions

**Status:** Awaiting Client Input  
**Total Questions:** 60+ across all 13 planning areas  
**Priority:** Complete by end of Week 1 to start coding Week 2

---

## 📋 How to Use This Document

1. **Read through each section**
2. **Answer questions directly in this file** (edit & save)
3. **Mark as resolved** when decided
4. **Request clarification** if any question is unclear

**Format:**
```
❓ [PRIORITY] Question Text?
   Options: A, B, C
   Current: [Not answered]
   Answer: [Your decision here]
   Notes: [Any additional context]
```

---

## 🔴 CRITICAL DECISIONS (Answer First)

These decisions gate other architectural choices.

### 1. Payment Business Model (Area 6)

**❓ [CRITICAL]** Which payment model should we use?

- **Option A:** One-time per assessment ($3-5 per attempt)
  - Simple implementation, low commitment
  - Revenue: ~$9/user/year (3 retakes)
  - Risk: Unpredictable revenue, high churn

- **Option B:** Organization subscription (monthly/annual tiers)
  - Starter: $49/month (10 seats)
  - Professional: $199/month (100 seats)
  - Enterprise: Custom
  - Revenue: Recurring, predictable
  - Risk: Lower volume, needs more features

- **Option C:** Hybrid (RECOMMENDED)
  - Individuals: Pay per assessment ($3-5)
  - Organizations: Monthly subscription ($49-199+)
  - Revenue: Best of both models
  - Complexity: Medium (both payment flows)

**Current:** Not answered  
**Answer:** 

---

### 2. Pricing Points (Area 6)

**❓ [CRITICAL]** If using one-time or hybrid, what should we charge?

- OCEAN test: $3, $4, or $5?
- Other tests: $5, $7, or $10?

**Current:** Not answered  
**Answer:** 

---

### 3. Organization Subscription Tiers (Area 6)

**❓ [CRITICAL]** If using subscription or hybrid model, confirm pricing:

- Starter Plan: $49/month or different?
  - Seats: 10 or different?
- Professional Plan: $199/month or different?
  - Seats: 100 or different?
- Enterprise: Custom or fixed tier?

**Current:** Not answered  
**Answer:** 

---

### 4. Annual Discount (Area 6)

**❓ [CRITICAL]** What discount for annual subscriptions?

- Options:
  - 2 months free (17% discount)
  - 15% discount
  - 20% discount
  - 25% discount
  - Other?

**Current:** Not answered  
**Answer:** 

---

## 🟡 HIGH-PRIORITY DECISIONS (Answer Second)

These affect core system design.

### Area 2: User Flows (5 Questions)

**❓ [HIGH]** Employee Account Creation

After employee completes assessment via one-time link:
- Should they be able to create an account?
- If yes: Can they see past assessments from before they had an account?
- Should their personal results be separate from org-invited results?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Employee One-Time Link Behavior

- Should the same link work multiple times (for retakes)?
- Or only work once per employee?
- Should link expire after X days? If so, how many?
- If employee retakes: Do results auto-update in HR dashboard?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** School vs Church Differences

Do schools need:
- Parent portal access?
- Different reporting than churches?

Do churches need:
- Volunteer management features?
- Different UI than schools?

Should these be separate features or unified?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Admin Test Creation Permissions

- Can HR/School admins customize OCEAN questions for their organization?
- Can they add their own completely custom assessment?
- Can they set custom scoring rules (weights, thresholds)?
- Or is this admin-only feature?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Retake Policy Implementation

- How do we enforce "3 times per year"?
- Does timer reset on calendar year or rolling 365 days?
- Can HR admin override this limit for their employees?
- Should there be a waiting period between retakes (e.g., 30 days)?

**Current:** Not answered  
**Answer:** 

---

### Area 3: Assessment Engine (5 Questions)

**❓ [HIGH]** OCEAN Test Questions Validation

- Should we use standard Big Five questions or create custom ones?
- Do you have specific research/questions you want used?
- Are scoring thresholds from your previous product correct?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Admin Custom Scoring (Phase 1 vs 2)

Should admins be able to customize scoring in Phase 1, or defer to Phase 2?
- Custom scoring weights per section?
- Custom interpretation thresholds?
- Different scoring for different departments?

**Current:** Not answered (Recommendation: Phase 2)  
**Answer:** 

---

**❓ [HIGH]** Question Bank Organization

- Should question bank be shared across all organizations?
- Or should orgs own their custom questions privately?
- Can admins delete/edit questions after publishing?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** A/B Testing Support

- Should we support A/B testing different scoring models?
- Different question sets?
- Or not needed for MVP?

**Current:** Not answered (Recommendation: No, Phase 2)  
**Answer:** 

---

**❓ [HIGH]** Real-Time Scoring Display

- Should we show users their running score as they answer questions?
- Or only reveal final score after submission?
- Impact: Affects user psychology & assessment validity

**Current:** Not answered  
**Answer:** 

---

### Area 4: Database (5 Questions)

**❓ [HIGH]** Data Retention Periods

- How long to keep submission responses? 7 years (legal requirement)?
- How long to keep audit logs? 7 years?
- How long to keep email logs? 1 year sufficient?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Multi-Organization Users

Design question:
- Can a single user belong to multiple organizations?
- Should they have separate accounts per org or one account?
- If one account: How do we handle email conflicts?
- If org changes: What happens to their personal results?

**Current:** Not answered (Recommendation: Yes, one account, org switching)  
**Answer:** 

---

**❓ [HIGH]** Historical Results Access

- Can users view assessment scores from 2 years ago?
- Should we support archiving old results?
- HR: Can they see historical team trends?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** GDPR Right-to-Be-Forgotten

How to handle user deletion requests:
- Delete all personal data immediately?
- Anonymize instead of delete?
- Keep anonymized data for analytics?
- Retention period before deletion?

**Current:** Not answered (Recommendation: Anonymize after 30 days)  
**Answer:** 

---

**❓ [HIGH]** Database Scaling Strategy

Expected growth (need for sharding/partitioning):
- Expected users Year 1: 10k? 100k? 1M?
- Expected organizations Year 1: 500? 5k?
- Single database or plan for sharding?

**Current:** Not answered  
**Answer:** 

---

### Area 5: Auth & Authorization (6 Questions)

**❓ [HIGH]** Session Durations

- Access token expiry: 15 minutes good or change?
- Refresh token expiry: 7 days good or change?
- Idle timeout: 1 hour good or different?
- Logging out: Should immediately revoke all sessions?

**Current:** Not answered (Recommendation: 15min/7days/1hour)  
**Answer:** 

---

**❓ [HIGH]** Multi-Organization User Workflow

- If user belongs to 10 organizations: How do they switch?
- Dashboard shows: All org results or current org only?
- Permissions: Independent per organization or global?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Employee Account Creation Timing

After one-time link completion:
- Require account creation to save results?
- Make account creation optional?
- Auto-create account with temp password?
- Send email to create account?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Admin Hierarchy

- Can HR admin create sub-admins (managers)?
- Department-level admins for large companies?
- Different permissions for different admin levels?

**Current:** Not answered (Recommendation: Single admin level for MVP)  
**Answer:** 

---

**❓ [HIGH]** Two-Factor Authentication

- Mandatory for admins in Phase 1 or Phase 2?
- Support SMS or authenticator app only (or both)?
- Recovery codes if user loses 2FA device?

**Current:** Not answered (Recommendation: Phase 2, authenticator app)  
**Answer:** 

---

**❓ [HIGH]** API Key Authentication

- Should API keys be available in Phase 1 or defer to Phase 2?
- What permissions should API keys have?
- Rate limits for API access?

**Current:** Not answered (Recommendation: Phase 2)  
**Answer:** 

---

### Area 6: Payment (7 Questions)

**❓ [HIGH]** Free Trial for Subscriptions

- Offer 14-day free trial for subscription plans?
- Auto-charge after trial or require manual activation?
- Can trial be extended?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Currency Support

- Primary currency: USD, NGN, or both equally?
- Multi-currency in MVP or Phase 2?
- Support which currencies: [list your markets]

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Additional Payment Methods

- Paystack (mobile + card) only for MVP?
- Add Stripe for international later (Phase 2)?
- Support bank transfers?
- Support mobile money (M-Pesa, etc.)?

**Current:** Not answered (Recommendation: Paystack MVP, Stripe Phase 2)  
**Answer:** 

---

**❓ [HIGH]** Billing Frequency

- Monthly subscriptions only, or monthly + annual?
- Annual discount: How much? (Already answered above)

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Refund Policy & Window

- Money-back guarantee window: 30 days?
- Refund eligibility:
  - Within window only?
  - Pro-rata for subscriptions?
  - No refunds if assessment started?
- Case-by-case review or automatic?

**Current:** Not answered (Recommendation: 30-day window, pro-rata, case review)  
**Answer:** 

---

**❓ [HIGH]** Seat Overage & Scaling

For subscription plans:
- What happens if org adds 105 employees on Starter (10-seat plan)?
- Overage charge: $5 per seat/month?
- Auto-upgrade to Professional tier?
- Force payment of additional seats?

**Current:** Not answered (Recommendation: Auto-charge overage at $5/seat)  
**Answer:** 

---

**❓ [HIGH]** Payment Dispute Resolution

- Chargebacks/disputes: How much effort to fight?
- Refund process: Full refund or partial?
- Communication: Email customer before refunding?

**Current:** Not answered  
**Answer:** 

---

### Area 7: Results & Reports (7 Questions)

**❓ [HIGH]** White-Label Branding Default

- Should all organizations get white-label by default?
- Or only Enterprise plan gets white-labeling?
- Can they customize logo, colors, brand name?

**Current:** Not answered (Recommendation: Professional+ plan only)  
**Answer:** 

---

**❓ [HIGH]** Career Suggestions Content

- Should career suggestions be in OCEAN results only?
- Or for all assessments?
- Who writes career suggestion content? (You or us?)

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Result Retention & Archive

- How long should users see past results?
- Auto-archive after X years?
- Should organization admins have access to historical trends?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Sharing Link Limits

- Should sharing have limits? (Unlimited preferred)
- Auto-expiry for shared links: Never, 30 days, 90 days?
- Max view limit on shared results?
- Password protection required or optional?

**Current:** Not answered (Recommendation: Never expire, optional password)  
**Answer:** 

---

**❓ [HIGH]** HR Bulk Report Generation

- Can HR generate one PDF per employee?
- Or combined report with all team members?
- Schedule bulk generation (daily, weekly)?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Report Format for Printing

- Optimize reports for printing (B&W friendly)?
- Include print-friendly CSS?
- Hide interactive elements when printing?

**Current:** Not answered  
**Answer:** 

---

**❓ [HIGH]** Mobile Result Viewing

- Is viewing results on mobile critical for launch?
- Or can we optimize mobile experience in Phase 2?
- Should PDF be reformatted for mobile?

**Current:** Not answered (Recommendation: Responsive but not priority)  
**Answer:** 

---

## 🟢 MEDIUM-PRIORITY DECISIONS (Answer Third)

These are nice-to-have but not critical for MVP.

### Area 8: Dashboard & Analytics (6 Questions)

**❓ [MEDIUM]** Dashboard Customization

Should organizations be able to:
- Customize which metrics appear?
- Drag-to-reorder dashboard widgets?
- Save multiple dashboard views?

**Current:** Not answered (Recommendation: No, fixed layout for MVP)  
**Answer:** 

---

**❓ [MEDIUM]** Real-Time vs Cached Data

What's your preference:
- 5-minute cache (current) for performance
- Real-time updates (slower, but fresher)
- Hybrid (real-time for critical, cache for others)

**Current:** Not answered (Recommendation: 5-minute cache)  
**Answer:** 

---

**❓ [MEDIUM]** Mobile Dashboard Priority

Is mobile dashboard critical for launch?
- Or can we optimize in Phase 2?
- Current plan: Responsive, simplified for mobile

**Current:** Not answered (Recommendation: Responsive but not priority)  
**Answer:** 

---

**❓ [MEDIUM]** Advanced Analytics in MVP

Should all advanced features be in MVP?
- Team compatibility scores
- Personality predictions
- Hiring recommendations
- Or defer to Phase 2?

**Current:** Not answered (Recommendation: Basic MVP, advanced Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** Visualization Library

Any preference for charts?
- Recharts (recommended)
- Chart.js
- D3
- Plotly

**Current:** Not answered (Recommendation: Recharts)  
**Answer:** 

---

**❓ [MEDIUM]** Real-Time Alerts

Should admins get:
- Email notifications only
- Email + push notifications
- Slack/Teams integration

**Current:** Not answered  
**Answer:** 

---

### Area 9: Infrastructure & Deployment (6 Questions)

**❓ [MEDIUM]** Hosting Preference

Where to host:
- DigitalOcean (recommended, cost-effective)
- AWS (powerful, complex)
- Google Cloud
- Your infrastructure?

**Current:** Not answered (Recommendation: DigitalOcean)  
**Answer:** 

---

**❓ [MEDIUM]** CDN for Static Assets

Recommendation:
- CloudFlare (recommended, includes DDoS)
- CloudFront (AWS)
- Cloudinary (file storage)
- Just origin server (no CDN)

**Current:** Not answered (Recommendation: CloudFlare)  
**Answer:** 

---

**❓ [MEDIUM]** Application Monitoring

Tools for monitoring:
- Datadog APM (paid, comprehensive)
- Open-source (Prometheus + Grafana)
- Minimal (just DigitalOcean built-in)

**Current:** Not answered (Recommendation: Datadog)  
**Answer:** 

---

**❓ [MEDIUM]** Email Service Provider

- Resend (recommended, simple)
- AWS SES (cheaper at scale)
- SendGrid (powerful)
- Your mail server?

**Current:** Not answered (Recommendation: Resend)  
**Answer:** 

---

**❓ [MEDIUM]** File Storage

- Cloudinary (recommended, includes transformations)
- AWS S3 (industry standard)
- DigitalOcean Spaces (cheaper)

**Current:** Not answered (Recommendation: Cloudinary)  
**Answer:** 

---

**❓ [MEDIUM]** On-Call & Incident Response

- How many engineers on rotation?
- Page all or escalation?
- On-call compensation?
- On-call schedule (weekly/monthly)?

**Current:** Not answered  
**Answer:** 

---

### Area 10: Security & Compliance (6 Questions)

**❓ [MEDIUM]** Security Audit

- Need pre-launch penetration testing?
- Budget for security firm review?
- Internal security review sufficient?

**Current:** Not answered (Recommendation: Internal review sufficient for MVP)  
**Answer:** 

---

**❓ [MEDIUM]** Compliance Certifications

Which are critical:
- GDPR (if EU users)
- CCPA (if California users)
- SOC 2 (if enterprise customers)
- None of the above?

**Current:** Not answered  
**Answer:** 

---

**❓ [MEDIUM]** Data Breach Insurance

- Get cyber insurance?
- Budget range?
- Provider preferences?

**Current:** Not answered (Recommendation: Consider for Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** Audit Log Access

- Who can access audit logs?
- Administrators only?
- Export for compliance audits?

**Current:** Not answered (Recommendation: Admins + auditors)  
**Answer:** 

---

**❓ [MEDIUM]** Incident Response Team

- Who manages security incidents?
- Internal team?
- External security firm on retainer?
- Both?

**Current:** Not answered  
**Answer:** 

---

**❓ [MEDIUM]** Vendor Risk Management

- Do vendors need security questionnaires?
- Data Processing Agreements (DPAs)?
- Annual security audits?

**Current:** Not answered (Recommendation: Yes to all)  
**Answer:** 

---

### Area 11: UI/UX System (6 Questions)

**❓ [MEDIUM]** Brand Identity

- Logo provided or need design?
- Brand colors defined?
- Brand guidelines document?
- Font preferences (system fonts or custom)?

**Current:** Not answered  
**Answer:** 

---

**❓ [MEDIUM]** Dark Mode

- Required for MVP or Phase 2?
- High contrast mode needed?
- Support all themes?

**Current:** Not answered (Recommendation: Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** Internationalization (i18n)

- English only for MVP?
- Multiple languages in MVP?
- Which languages?

**Current:** Not answered (Recommendation: English MVP, i18n Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** Animation & Polish

- Minimal motion (current) or more elaborate?
- Video intros/tutorials?
- Micro-interactions?

**Current:** Not answered (Recommendation: Minimal for MVP)  
**Answer:** 

---

**❓ [MEDIUM]** Custom Component Styling

- Use Shadcn/ui as-is (recommended)?
- Need custom components?
- Custom illustrations?

**Current:** Not answered (Recommendation: Shadcn/ui as-is)  
**Answer:** 

---

**❓ [MEDIUM]** Mobile App

- Responsive web only?
- Native iOS/Android apps?
- Progressive Web App (PWA)?
- Desktop apps?

**Current:** Not answered (Recommendation: Responsive web MVP)  
**Answer:** 

---

### Area 12: API Architecture (6 Questions)

**❓ [MEDIUM]** GraphQL vs REST

- REST (recommended) or also support GraphQL?
- GraphQL adds complexity
- REST simpler to build/maintain

**Current:** Not answered (Recommendation: REST MVP, GraphQL Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** API Versioning

- Maintain multiple versions?
- How long to support old versions?
- Deprecation timeline?

**Current:** Not answered (Recommendation: Support 1 year after deprecation notice)  
**Answer:** 

---

**❓ [MEDIUM]** Webhook System

- Need webhooks for partner integrations?
- Or just Paystack webhooks?
- Webhook retry logic?

**Current:** Not answered (Recommendation: Just Paystack for MVP)  
**Answer:** 

---

**❓ [MEDIUM]** File Uploads

- Direct to Cloudinary or via API?
- File size limits?
- File type restrictions?

**Current:** Not answered (Recommendation: Direct to Cloudinary, 10MB limit)  
**Answer:** 

---

**❓ [MEDIUM]** Real-Time Features

- Need WebSockets for live updates?
- Or polling sufficient?
- What updates need real-time? (results, invitations?)

**Current:** Not answered (Recommendation: Polling for MVP, WebSockets Phase 2)  
**Answer:** 

---

**❓ [MEDIUM]** API Documentation

- Auto-generate with Swagger?
- Interactive API explorer (Swagger UI)?
- Manual documentation?

**Current:** Not answered (Recommendation: Swagger + Swagger UI)  
**Answer:** 

---

### Area 13: Development Workflow (6 Questions)

**❓ [MEDIUM]** Team Size

- How many developers?
- Remote vs in-office?
- Time zones?

**Current:** Not answered  
**Answer:** 

---

**❓ [MEDIUM]** Code Review Strictness

- 2 approvals required (strict)?
- 1 approval sufficient (faster)?

**Current:** Not answered (Recommendation: 2 for stability)  
**Answer:** 

---

**❓ [MEDIUM]** Test Coverage Targets

- 80% sufficient?
- Higher targets?
- E2E tests in CI/CD (slows down)?

**Current:** Not answered (Recommendation: 80%, E2E daily/scheduled)  
**Answer:** 

---

**❓ [MEDIUM]** Production Deployments

- Who can deploy to production?
- Manual approval required?
- Deployment windows (business hours)?

**Current:** Not answered (Recommendation: Tech lead approval, no windows)  
**Answer:** 

---

**❓ [MEDIUM]** Communication Style

- Async-first culture (written decisions)?
- Sync meetings preferred?
- Slack heavy or email?

**Current:** Not answered (Recommendation: Async first, sync when blocked)  
**Answer:** 

---

**❓ [MEDIUM]** Development Tools

- VS Code (recommended)?
- Other IDEs preferred?
- Any prohibited tools?

**Current:** Not answered (Recommendation: VS Code open, use your preference)  
**Answer:**

---

## 📊 Decision Status Summary

| Area | Questions | Answered | Pending |
|------|-----------|----------|---------|
| **Critical** | 4 | 0 | 4 |
| **Area 2** | 5 | 0 | 5 |
| **Area 3** | 5 | 0 | 5 |
| **Area 4** | 5 | 0 | 5 |
| **Area 5** | 6 | 0 | 6 |
| **Area 6** | 7 | 0 | 7 |
| **Area 7** | 7 | 0 | 7 |
| **Areas 8-13** | TBD | 0 | TBD |
| **TOTAL** | **39** | **0** | **39** |

---

## 💡 Recommendation: Decision Priority Order

1. **Decide payment model first** (unlocks pricing, revenue, complexity)
2. **Answer CRITICAL section** (payment decisions)
3. **Answer HIGH-PRIORITY sections** (features & design)
4. **Answer MEDIUM-PRIORITY sections** (nice-to-haves)

**Estimated time to complete all decisions:** 2-3 hours

---

## 📝 How to Submit Answers

**Option A: Edit this file directly**
- Save changes locally
- Share with development team

**Option B: Spreadsheet/Email**
- Copy questions to spreadsheet
- Fill in answers
- Send back

**Option C: Meeting**
- Schedule 60-minute decision-making session
- Go through each section
- Document decisions real-time

---

## ✅ Approval Checklist

When complete, confirm:
- [ ] All 39+ questions answered
- [ ] No conflicting decisions
- [ ] Architecture approved
- [ ] Ready to start coding Week 2
- [ ] Timeline confirmed (8 weeks)
- [ ] Scope locked (no changes after approval)

---

**Next:** Areas 8-13 will be created with placeholder questions to be filled in as those areas are completed.

