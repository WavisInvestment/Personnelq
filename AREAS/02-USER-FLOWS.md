# Area 2: User Flow Mapping

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Defines all features and workflows  
**Depends On:** Area 1 ✅ Product Scope (COMPLETE)

---

## Overview

We need to design **every** user journey step-by-step:
- What does the user do?
- What screens do they see?
- What data is captured?
- Where do flows intersect?

This prevents missing logic and ensures all features connect properly.

---

## 🧑 Persona 1: Individual User (Self-Serve)

### Journey: "Discover Your Personality" (Free → Paid)

```
Landing Page
    ↓
CREATE ACCOUNT (lightweight: email + name required)
    ↓
FREE PERSONALITY SNAPSHOT (short, ~5-10 questions)
    ↓
TEASER RESULTS (limited preview to build interest)
    ↓
PAYMENT WALL (unlock full assessment + report)
    ↓
FULL ASSESSMENT (complete OCEAN or other, ~50 questions)
    ↓
FULL AI-GENERATED REPORT (complete interpretation + recommendations)
    ↓
PERSONALITY BADGE PROFILE (distinctive, shareable profile)
    ↓
View History (past assessments + evolution)
```

**Key Difference:** 
- Free snapshot = lead magnet (email capture)
- Teaser results = interest building (limited preview)
- Payment gate = unlock full content
- Full report = behind paywall

### Key Screens (Updated for Free/Paid Flow)

**Account Creation:**
1. **Landing Page** — Features, CTA: "Discover Your Personality"
2. **Sign Up** — Email, password, name (lightweight account)
3. **Login** — Email, password

**Free Snapshot (Lead Magnet):**
4. **Personality Snapshot Intro** — "Quick 5-minute discovery"
5. **Snapshot Questions** — 5-10 questions (subset of OCEAN)
6. **Snapshot Results** — Limited preview (scores only, no interpretation)
7. **"Unlock Full Results" CTA** — Payment gate

**Payment:**
8. **Payment Checkout** — Paystack integration

**Full Assessment (Paid):**
9. **Full Assessment Intro** — "Complete Personality Badge Analysis"
10. **Question Screen** — 50 questions, progress bar, save progress
11. **Save/Resume** — Auto-save, return later to continue
12. **Submit Assessment** — Confirmation before final submission

**Results & Reports:**
13. **Full Results Screen** — Personality scores, AI interpretation, career insights, badge preview
14. **Email Confirmation** — "Results sent to your email"
15. **Download PDF** — Full personality report (downloadable anytime)
16. **Personality Badge Profile** — Distinctive badge, share settings
17. **Share Badge** — Copy link, social share, email

**Dashboard:**
18. **Personal Dashboard** — Past assessments, personality evolution timeline
19. **History** — All assessments with versions, dates, scores
20. **Retake Assessment** — Available after 6 months

### Data Captured
- User account info
- Assessment taken
- Questions answered (each response + timestamp)
- Time to complete
- Scores (OCEAN traits)
- When completed
- Share activity

### User Pain Points to Solve
- [ ] Can they resume if interrupted?
- [ ] Do they get results immediately AND email?
- [ ] Can they download PDF multiple times?
- [ ] Can they retake the same test? (Yes, 3x/year)
- [ ] Can they see their improvement over time?

---

## 🏢 Persona 2: HR Administrator (Company)

### Journey: "Manage Team Personality Assessments" (UPDATED)

```
Landing Page
    ↓
Sign Up / Company Registration
    ↓
Purchase Plan (seats/pricing)
    ↓
Payment Processing
    ↓
Admin Dashboard
    ↓
Select Assessment (OCEAN or custom)
    ↓
Invite Employees (bulk or individual)
    ↓
Email Invitations (UNIQUE per employee, 14-day expiry)
    ↓
Monitor Responses (completion %, who opened, who completed)
    ↓
View Team Results (current assessments + historical)
    ↓
Generate Reports (team analysis, individual cards)
    ↓
Export Data (CSV, PDF)
    ↓
Team Analytics (personality distribution, compatibility, hiring insights)

[EMPLOYEE RETAKE WORKFLOW]
    ↓
Authorize Retake (HR decides if employee can retake)
    ↓
Send New Invitation (new unique link, new 14-day expiry)
    ↓
Employee Takes Assessment (marked as "Current", old marked "Previous")
    ↓
Assessment History Maintained (can view evolution over time)
```

**Key Changes:**
- Links are unique per employee (not reusable)
- 14-day expiry (configurable, can be extended)
- No free retakes (HR must authorize)
- Assessment locking (prevents unauthorized retakes)
- Full history maintained (never overwrite)

### Key Screens
1. **Company Sign Up** — Company name, industry, size, admin email
2. **Plan Selection** — Pricing tiers (10 seats, 50, 100, unlimited)
3. **Payment** — Paystack integration
4. **Admin Dashboard** — Overview, quick stats
5. **Assessment Management** — Create or select tests
6. **Bulk Invite** — Upload CSV or manual invite employees
7. **Invite Form** — Employee email, department, role
8. **Invitation Tracking** — "Sent", "Opened", "Completed", "Pending"
9. **Employee Assessment Page** — No login needed, just answer questions
10. **Results Screen** — Employee sees their personality profile
11. **Team Results View** — Grid of all employees + scores
12. **Analytics Dashboard** — Charts, metrics, compatibility matrix
13. **Export Reports** — Download CSV or PDF
14. **Advanced Analytics** — Team compatibility, hiring recommendations
15. **Team Comparison** — Department vs department, team vs company average

### Data Captured
- Company info + payment details
- Admin account info
- Employee invitations (sent, opened, completed)
- Assessment responses for each employee
- Timestamps
- Which department/team each employee belongs to
- Export history

### Key Workflows
- **Invite Workflow:** Admin → Select test → Invite employees → Email with one-time link → Employee takes test → Results saved
- **Results Workflow:** Test complete → Results available in admin dashboard → HR can view individual + team summary
- **Export Workflow:** Select tests/teams → Choose format (CSV/PDF) → Download
- **Analytics Workflow:** Pull team data → Calculate compatibility matches → Generate hiring insights

### User Pain Points to Solve
- [ ] Can admins invite multiple employees at once (CSV import)?
- [ ] Do employees need accounts? (NO — one-time link only)
- [ ] Can HR see individual results + aggregate statistics?
- [ ] Can they re-invite if employee misses deadline?
- [ ] Can they customize which questions are in the test for their company?
- [ ] Can they track completion in real-time?

---

## 🏫 Persona 3: School Administrator (Teacher/Principal)

### Journey: "Manage Class Assessments"

```
Landing Page
    ↓
Sign Up / School Registration
    ↓
Create Classes
    ↓
Add Students to Class
    ↓
Select Assessment for Class
    ↓
Send Class Invitations (one-time links)
    ↓
Monitor Student Responses
    ↓
View Class Results
    ↓
Student Personality Profiles
    ↓
Class Analytics
    ↓
Identify Classroom Dynamics
```

### Key Screens
1. **School Admin Dashboard** — Classes, students, assessments
2. **Create Class** — Class name, grade, subject
3. **Add Students** — Manual or CSV upload
4. **Invite Students** — Generate one-time links per student
5. **Student Submission Page** — Auto-login via link, take assessment
6. **Student Results** — Show personality profile
7. **Class Results Grid** — All students + scores
8. **Class Analytics** — Distribution of personalities, classroom balance
9. **Student Profiles** — Individual personality card, strengths, growth areas
10. **Class Dynamics Report** — How well students complement each other

### Data Captured
- School info
- Class info (grade, teacher, subject)
- Student roster
- Assessment responses
- Completion tracking

### Unique Features for Schools
- [ ] Multi-class management
- [ ] Bulk student import (CSV)
- [ ] Class-level analytics
- [ ] Teacher notes on student personalities
- [ ] Parent portal (optional)?

---

## ⛪ Persona 4: Church/Community Leader

### Journey: "Manage Community Assessments"

```
Landing Page
    ↓
Sign Up / Community Registration
    ↓
Create Community/Group
    ↓
Invite Members
    ↓
Track Completions
    ↓
View Community Personality Profile
    ↓
Identify Community Strengths
    ↓
Build Better Teams from Personalities
```

### Key Screens
1. **Community Dashboard** — Groups, members, assessments
2. **Create Group** — Group name, description, size estimate
3. **Invite Members** — Email invites with one-time links
4. **Completion Tracker** — Who took the assessment
5. **Community Profile** — Overall personality distribution
6. **Member Directory** — All members with personality icons
7. **Strengths Analysis** — What's this community good at?
8. **Team Builder** — Suggest who should work together

### Data Captured
- Community/organization info
- Group membership
- Assessment responses
- Member profiles

---

## 👨‍💼 Persona 5: Platform Admin

### Journey: "Manage Platform"

```
Admin Panel
    ↓
User Management (view all users, ban, monitor)
    ↓
Assessment Management (create, edit, delete tests)
    ↓
Question Management (add questions, edit scoring)
    ↓
System Analytics (signups, completions, revenue)
    ↓
Payment Management (track payments, refunds)
    ↓
Reporting (system health, usage metrics)
```

### Key Screens
1. **Admin Dashboard** — System health, user counts, revenue
2. **User Management** — Search, filter, deactivate users
3. **Assessments** — Create, edit, delete, publish
4. **Questions** — Question bank, add/edit questions
5. **Scoring Rules** — Configure how tests are scored
6. **Payment Dashboard** — Transactions, refunds, revenue trends
7. **Analytics** — Usage charts, user demographics
8. **System Logs** — Audit trail, error logs
9. **Email Manager** — Test email templates

---

## 🔄 Cross-Cutting Workflows

### Authentication Flow
```
User Visits Platform
    ↓
Route Check (logged in?)
    ├─→ YES: Redirect to dashboard
    └─→ NO: Go to login/signup
        ├─→ Sign Up (create account)
        ├─→ Log In (email + password)
        └─→ One-Time Link (HR invite, no account needed)
```

### Assessment Submission Flow
```
User Starts Assessment
    ↓
Answer Each Question
    ↓
Save Progress (auto or manual)
    ↓
On Submission:
    ├─→ Calculate Scores (backend)
    ├─→ Generate Report HTML
    ├─→ Generate Report PDF
    ├─→ Send Email with Results
    ├─→ Store Results in Database
    └─→ Show Results Screen
```

### Payment Flow (Individual)
```
Individual Selects Assessment
    ↓
Clicks "Take Assessment"
    ├─→ If logged in: Go to assessment
    └─→ If not: Offer signup or direct purchase
        ↓
        Pay via Paystack
        ↓
        Create Account or Use Email
        ↓
        Redirect to Assessment
```

---

## 📊 Summary Table: User Types & Key Features

| Feature | Individual | HR Team | School | Church | Admin |
|---------|-----------|---------|--------|--------|-------|
| **Account** | Yes (signup) | Yes | Yes | Yes | Yes |
| **One-Time Link** | No | Yes | Yes | Yes | No |
| **Take Assessment** | Yes | Can invite | Yes | Yes | Yes |
| **See Own Results** | Yes | N/A | No (teacher sees) | No (leader sees) | Yes |
| **Dashboard** | Personal | Team/Company | Class | Community | System |
| **Download PDF** | Yes | Yes | Yes | Yes | Yes |
| **Analytics** | Personal history | Team + advanced | Class + students | Community | System |
| **Export Data** | Personal only | CSV/PDF | CSV/PDF | CSV/PDF | All |
| **Create Tests** | No | Yes (admin) | Yes | Yes | Yes |
| **Edit Questions** | No | No | No | No | Yes |

---

## ❓ Open Questions for You

1. **Individual Purchase Flow:**
   - Should individuals create accounts BEFORE paying, or AFTER?
   - Should guests be able to take free assessment + email results?

2. **Employee One-Time Links:**
   - Should link work only once or multiple times (for retakes)?
   - Should link expire after X days?
   - If employee retakes, do results auto-update in HR dashboard?

3. **School vs Church Differences:**
   - Do schools need parent portal access?
   - Do churches need volunteer management?
   - Different reporting needs?

4. **Admin Test Creation:**
   - Can HR/school admins customize OCEAN questions?
   - Can they add their own custom assessment?
   - Can they set custom scoring rules?

5. **Retake Policy Implementation:**
   - How do we enforce "3 times per year"?
   - Does timer reset on calendar year or 365 days?
   - Can HR override this for their employees?

---

## ✍️ Next Steps

1. **Answer the 5 open questions above**
2. **Clarify any workflows** that aren't clear
3. **Move to Area 3: Assessment Engine Design** (how tests are structured and scored)
4. **Then Area 4: Database Architecture** (create the ERD)

**Time estimate:** 30-45 minutes to review + 15 minutes to answer open questions

