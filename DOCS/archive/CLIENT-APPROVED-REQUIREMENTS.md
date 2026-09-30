# Client-Approved Requirements

**Date:** 2026-09-30  
**Status:** ✅ APPROVED BY CLIENT  
**Impact:** Significant changes to MVP flow, assessment strategy, and database design

---

## 🎯 Core Product Vision: DISCOVER → UNDERSTAND → SHARE → CONNECT

The Personality Badge platform must prove four key capabilities:

1. **DISCOVER** — A person discovers their personality
2. **UNDERSTAND** — Platform helps them understand what it means
3. **SHARE** — They receive a distinctive Personality Badge they can selectively share
4. **CONNECT** — Profile helps them understand how they relate to others

---

## 👤 1. Individual Assessment Flow (CRITICAL)

### Journey: Freemium → Premium

```
Landing Page
    ↓
Create Lightweight Account (email + name required)
    ↓
Take Free "Personality Snapshot" (short assessment, ~5-10 min)
    ↓
View Teaser Results (limited preview to build interest)
    ↓
Payment Wall (unlock full assessment + report)
    ↓
Full Assessment (complete OCEAN or other)
    ↓
Full AI-Generated Report (complete interpretation + recommendations)
    ↓
Personality Badge Profile (distinctive, shareable profile)
```

### Key Principles

**Email/Name Capture is MANDATORY:**
- No completely anonymous guest experience
- Capture name + email before free assessment
- Enables email delivery, history tracking, communication

**Free Assessment (Personality Snapshot):**
- Short version (5-10 questions vs 50)
- Enough insight to create interest
- NOT complete Personality Badge
- Limited preview of results

**Payment Wall:**
- Full assessment + full report + AI interpretation behind payment
- Free assessment is the lead magnet
- Full Badge features locked until paid

**Incomplete Assessment Recovery:**
- Save incomplete assessments
- Allow users to return and continue
- Don't expire if in progress
- Track save state/progress

---

## 🏢 2. Employee Assessment Links (EMPLOYEE INVITATIONS)

### Link Characteristics

**Uniqueness:**
- Each invitation = unique to individual
- NOT reusable public links
- Tied to email address

**Expiry:**
- Default: 14 days
- Configurable by HR/admin
- Can be extended or resent
- Auto-expires (employee sees "link expired" message)

**Access Control:**
- Link-based access (no login required)
- One-time completion per link
- If resent: New link with new expiry

### Assessment Locking

**After Completion:**
- Assessment is LOCKED
- Employee cannot freely retake
- HR/admin must authorize retake
- Clear "locked" state on assessment

**Retake Workflow:**
- HR clicks "Authorize Retake" or "Resend Assessment"
- New link generated
- New link has fresh 14-day expiry
- Previous result marked as "Previous"
- New result marked as "Current"

### Assessment History

**CRITICAL: Do NOT Overwrite**
- Maintain FULL assessment history
- Each completion = new record
- Mark assessment with:
  - Assessment date
  - Assessment version
  - Complete score/result
  - Organization (if applicable)
  - "Current" flag (latest is current)
  - Previous results linked

**Why This Matters:**
- Future "Personality Evolution" timeline
- Track behavioral/personality development over time
- Compliance: maintain audit trail
- Analytics: understand change patterns

### HR Permissions & Consent

**Governed Access:**
- Employees know what HR can see
- Explicit consent required
- Privacy by default
- HR cannot see: Personal notes, private assessment history (configurable)

**Recommended Consent Model:**
```
HR Can See:
☑ Assessment results (scores)
☑ Latest assessment date
☑ Completion status
☐ Full assessment history
☐ Previous attempts
☐ Personal development notes
```

---

## 🏫 3. Schools & Churches (DEFER TO V2+)

### MVP 1 Priority: Individual + Corporate Only

**NOT in MVP 1:**
- Schools/education modules
- Churches/community modules
- Parent/guardian portals
- Professional associations

**Why Defer:**
- Reduce V1 scope
- Can be accommodated without major refactoring
- Different terminology/features can be added later

### Future Architecture (Single Platform, Multiple Orgs)

**ONE Core Platform, Configurable Org Types:**

Organizations specify type at setup:
- Corporate
- Educational
- Religious/Community
- Professional Association

**Shared Underlying Architecture:**
```
Corporate:     Employee / Team / Manager / Leadership
Educational:   Student / Class / Teacher / Parent
Religious:     Member / Volunteer / Ministry / Leader
Professional:  Member / Group / Facilitator / Network
```

**Same Database, Different Dashboards:**
- Dashboard terminology changes per org type
- Reports structured differently
- Modules enabled/disabled per type
- But data model is identical

**Benefits:**
- One codebase to maintain
- Consistent assessment engine
- Future compatibility insights across org types
- Easier scaling

---

## 📋 4. Assessment Customization

### Core Assessments: LOCKED

**Official Personality Badge OCEAN:**
- Questions: FIXED (cannot be edited by admins)
- Scoring: FIXED (locked methodology)
- Interpretation: FIXED (locked logic)

**Why Lock Them:**
- Data consistency (can compare users reliably)
- Validity (maintain psychometric integrity)
- Comparability (all OCEAN scores mean the same thing)
- Brand integrity (Personality Badge has one definition)

### Organization-Specific Assessments: CUSTOMIZABLE

**Custom Assessments:**
- Created by organization admins
- Custom questions (write your own)
- Custom scoring (define weights)
- Custom interpretation (define text)
- Clearly labeled as "CUSTOM" (not official Badge)

**Examples:**
- "Customer Service Assessment" (HR custom)
- "Leadership Readiness" (custom scoring)
- "Company Culture Fit" (custom questions)

### Assessment Framework Strategy

**Current (MVP):**
- Core: OCEAN (third-party)
- Custom: Admin-created questionnaires

**Future (V2+):**
- Proprietary Personality Badge Index
- Custom assessment framework
- Not dependent on OCEAN forever

**Database Design Impact:**
- Assessment table has "framework" field
- Allows multiple frameworks
- Scoring logic abstracted per framework
- Can add new frameworks without rebuild

---

## 🔄 5. Retake Policy (Updated)

### Individual Users

**Core Personality Badge Assessment:**
- First attempt: Free (via free snapshot flow)
- Retake: Allowed after 6 months
- Auto-resets every 6 months
- Historical data retained

**Why 6 Months:**
- Enough time for behavioral change to occur
- Not too frequent (maintains data quality)
- Allows personality evolution tracking

### Corporate/Organization Users

**Employee Assessments:**
- First attempt: One-time unless HR authorizes
- Retakes: REQUIRE HR authorization (not automatic)
- HR decides when employee can retake
- Policy set per organization

**Why This Model:**
- Prevents gaming/manipulation
- HR controls assessment frequency
- Maintains data quality
- Supports performance cycles

### Assessment Record Structure

**Each Assessment Must Track:**
```
- Assessment ID
- User ID
- Assessment Version
- Organization ID (if corporate)
- Assessment Date
- Completion Date
- Score/Result
- Status (current / historical / draft)
- Retake Authorization (if applicable)
- Previous Assessment Link (if retake)
- Is Current Flag (latest = true)
```

---

## 💎 6. Key Future Features (Architect For, May Not Build V1)

These features must be architecturally possible, but may not be fully developed in MVP 1.

### Personality Badge Profile (Consolidated)

**What:**
- Master profile consolidating all user assessments
- Single unified "Personality Badge"
- Generated from combination of all assessments
- Not just individual test results side-by-side

**How:**
- Aggregate scores from all assessments taken
- Identify patterns/themes
- Generate consolidated interpretation
- Single "badge" users share

**Database Implication:**
- Add `personality_profiles` table
- Link to multiple assessment results
- Store consolidated scores
- Track profile version history

### AI Interpretation Layer

**What:**
- Send structured assessment scores to AI layer
- AI generates consolidated interpretation
- AI does NOT determine psychometric scores (only interprets them)
- Covers multiple dimensions

**Interpreted Dimensions:**
- Personality traits
- Communication style
- Leadership style
- Working style
- Relationship/interpersonal style
- Strengths
- Potential blind spots
- Personal development recommendations

**Architecture:**
- Assessment scoring: Backend calculates (deterministic)
- AI interpretation: LLM-based (Claude API)
- Store both: Scores + AI interpretation

### Compatibility Engine

**What:**
- Compare two Personality Badge profiles
- Generate compatibility insights
- Support multiple relationship types

**Use Cases:**
- Professional networking ("compatible colleague?")
- Team composition ("good team mix?")
- Manager/employee fit
- Mentorship matching
- Friendships/relationships

**Database Implication:**
- Add `compatibility_scores` table
- Store pair-wise comparisons
- Cache results (expensive calculation)
- Version compatibility algorithm

### Shareable Personality Badge

**What:**
- Users choose which traits to make public
- Distinctive badge they share on social/email/link
- Private assessment info remains private by default

**Privacy Model:**
```
User can toggle per badge element:
☐ Show Openness score (private by default)
☐ Show Communication style (public by default)
☐ Show Top strength (public by default)
☐ Show Growth area (private by default)
☑ Show nickname/custom label (public)

Shared badge shows only checked items
```

**Share Mechanisms:**
- Unique shareable link (anyone can view)
- Social media share (preview image)
- Email share (pre-composed message)
- Embed on personal website

### API-First Architecture

**Critical Requirement:**
- Every feature must be API-driven
- No backend-only features
- Frontend = API consumer (like any third-party)

**Future Integration Potential:**
- HR platforms (Workday, SAP, BambooHR)
- Professional networks (LinkedIn, industry platforms)
- Social platforms (Slack, Teams)
- Learning platforms (career development)
- Team collaboration tools

**Database Implication:**
- All data accessible via REST API
- No database-only queries from frontend
- API becomes the single source of truth

---

## 🚀 7. MVP 1 Priority: What to Build

### Phase 1: Core Platform (Weeks 1-6)

**MUST HAVE:**
✅ Individual account creation (lightweight)
✅ Free "Personality Snapshot" (short assessment)
✅ Teaser results (limited preview)
✅ Payment integration (unlock full content)
✅ Full OCEAN assessment (50 questions)
✅ Score calculation (locked methodology)
✅ AI-generated report (interpretation)
✅ PDF download
✅ Email delivery
✅ Assessment history tracking
✅ Employee invitation links (14-day expiry)
✅ Employee assessment locking
✅ HR dashboard (view results)
✅ Basic analytics

**OPTIONAL (if time permits):**
🟡 Shareable profile links
🟡 Personality Badge profile (consolidated)
🟡 Compatibility scores (2-person comparison)

### Phase 2+: Advanced Features

**NOT in MVP 1:**
❌ Full AI interpretation layer (use template interpretation)
❌ Compatibility engine (complex algorithm)
❌ Schools/churches modules
❌ Proprietary assessment framework
❌ Full social sharing
❌ API open access (internal only initially)

---

## 📊 Database Changes Required

### New Tables/Fields Needed

**Free Assessment Type:**
- `assessment_type` field: 'free_snapshot' | 'full_assessment'
- Free assessment: Shorter question set, limited results
- Full assessment: Complete questions, full interpretation

**Assessment History:**
- `assessment_version` (timestamp or version number)
- `is_current` flag (boolean, only one true per user per assessment type)
- `previous_assessment_id` (link to prior attempt)
- Never delete old assessments (audit trail)

**Personality Badge Profile:**
- New table: `personality_profiles`
- Links to multiple assessment results
- Consolidated score
- Shareable flag
- Share permissions (which elements public/private)

**Retake Management:**
- `last_assessment_date` (for 6-month tracking)
- `retake_authorized_by` (admin user who authorized)
- `retake_authorization_date`
- `locked` flag (employee assessments can be locked)
- `locked_reason` ('initial_completion' | 'awaiting_admin_authorization')

**Shareable Profile:**
- `shareable_badge_id`
- `share_token` (unique, public URL)
- `is_public` flag
- Shared elements JSON (which traits visible)
- Access permissions

### Impact on Area 4 (Database Architecture)

- Add 3-4 new tables
- Modify 6-8 existing tables
- Add assessment versioning
- Track assessment history separately
- Support future proprietary frameworks

---

## 🔑 Decision Summary: Questions Now ANSWERED

From CLIENT-DECISIONS.md:

### CRITICAL (Now Answered)

**Payment Model:** ✅ HYBRID
- Individuals: Free snapshot → Full assessment (one-time payment)
- Organizations: Subscription model (pay per seats/month)

**Individual Purchase Flow:** ✅ LOCKED
- Account first (email required)
- Free snapshot second
- Preview third
- Payment gate
- Full assessment fifth

**Employee Links:** ✅ LOCKED
- Unique per individual
- 14-day expiry
- No free retakes
- HR authorization required for retakes
- Maintain full history (don't overwrite)

**Retake Policy:** ✅ LOCKED
- Individual: 6-month window (not 3x/year)
- Corporate: HR authorization required
- Full history maintained

**Assessment Customization:** ✅ LOCKED
- Core OCEAN: LOCKED (no admin editing)
- Custom assessments: EDITABLE by admin
- Separate scoring for custom

**Schools/Churches:** ✅ LOCKED
- DEFER to V2
- Build one configurable platform
- Not separate codebases

**Free Assessment:** ✅ LOCKED
- "Personality Snapshot" (short version)
- Email/name required (not anonymous)
- Teaser results only
- Full content behind paywall

---

## ✅ Final Client Decisions (LOCKED)

All critical decisions are now finalized:

### FREE ASSESSMENT DETAILS ✅
- **Snapshot Size:** 10 questions (2 per trait, ~5 minutes)
- **Traits Covered:** All 5 OCEAN traits
- **Teaser Results:** Scores only (no interpretation) + CTA to unlock
- **Duration:** ~5 minutes for user
- **Full Assessment:** 50 questions (10 per trait)

### PAYMENT PRICING ⏳
- **Individual Assessment:** DEFERRED (decide at launch, won't delay build)
- **Subscription Pricing:** Unchanged ($49, $199, custom enterprise)
- **Strategy:** Hybrid (free → paid split)

### AI INTERPRETATION ✅
- **Approach:** Claude API (LLM-generated interpretation)
- **Dimensions:** Personality, communication style, leadership style, working style, relationship/interpersonal style, strengths, blind spots, recommendations
- **Scope:** Full AI interpretation engine (not just templates)
- **Cost Model:** Claude API credits budgeted

### SHAREABLE PERSONALITY BADGE ✅
- **Timeline:** MVP 1 (Essential feature - critical for SHARE pillar)
- **Public by Default:** Configurable (user chooses which elements to share)
- **Share Mechanisms:** Link, email, social media
- **Privacy:** Private by default, user controls what's public

### ❓ Deferred Decisions (Not blocking implementation)

1. **Individual Assessment Price** — Decide later ($5? $9.99? $14.99? Other?)
   - Won't delay development (implementation can use placeholder)
   - Can be changed before launch
   
2. **Compatibility Engine** — Fully Phase 2 (not in MVP 1)

3. **Organization Types** — Add "organization_type" field in DB schema
   - Prepared for schools/churches in Phase 2
   - MVP 1: Corporate only

---

## 🎯 Next Steps

1. ✅ Document client requirements (this file - DONE)
2. ⏳ Update impacted AREA files (2, 3, 4, 6, 7)
3. ⏳ Update CLIENT-DECISIONS.md with clarifications
4. ⏳ Create updated database ERD with new tables
5. ⏳ Update individual user flow diagrams
6. ⏳ Clarify remaining questions with client

---

## 📝 Summary of Major Changes

| Area | Change | Impact |
|------|--------|--------|
| **Individual Flow** | Add free/paid split | Database: new assessment type |
| **Assessment History** | Track ALL versions | Database: never delete, version tracking |
| **Retake Policy** | 6-month not 3x/year | Logic: auto-unlock after 6 months |
| **Core Assessments** | LOCKED (no admin edit) | UI: remove customization option |
| **Custom Assessments** | Admin can create | Database: org-specific tests |
| **Employee Links** | Unique, 14-day expiry | Database: expiry tracking |
| **Payment Gate** | After free snapshot | UX: payment flow redesign |
| **Future Proofing** | Personality profiles, AI, compatibility | Database: design for extensibility |

---

## ✅ Ready for Architecture Updates

This document captures all client feedback and clarifications. Architecture files (Areas 2-7) can now be updated with confidence.

**Status:** Ready for implementation team to proceed with updated design.

