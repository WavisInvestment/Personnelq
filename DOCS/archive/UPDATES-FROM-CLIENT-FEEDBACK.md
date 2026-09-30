# Architecture Updates from Client Feedback

**Date:** 2026-09-30  
**Source:** Client feedback (detailed requirements)  
**Status:** ✅ Planning areas updated, ready for team implementation

---

## 📋 Changes Summary

### Documents Updated ✅

| Document | Status | Key Changes |
|----------|--------|-------------|
| **02-USER-FLOWS.md** | ✅ UPDATED | Individual flow now has free/paid split, employee retake workflow |
| **03-ASSESSMENT-ENGINE.md** | ✅ UPDATED | Free snapshot logic, locked core assessments, custom assessments |
| **CLIENT-APPROVED-REQUIREMENTS.md** | ✅ CREATED | Complete client requirements document |
| **04-DATABASE-ARCHITECTURE.md** | ⏳ PENDING | Add history tables, free/full assessment types |
| **06-PAYMENT-ARCHITECTURE.md** | ⏳ PENDING | Payment gate positioning, free trial flow |
| **07-RESULT-REPORT-SYSTEM.md** | ⏳ PENDING | Different reports for free vs full |

### Documents To Review ⏳

- **CLIENT-DECISIONS.md** — Mark questions answered, clarify remaining
- **All 13 AREA files** — Review for consistency with new flow

---

## 🔄 Major Flow Changes

### Individual Assessment Flow

**BEFORE:** Landing → Account → Browse → Select → Assess → Results → Email → Download → Share

**AFTER:** Landing → Account → Free Snapshot → Teaser → Payment → Full Assess → Full Report → Badge → Share

**Impact:**
- Free snapshot is lead magnet (email capture mandatory)
- Payment gate after free preview
- Full report behind paywall
- Badge/profile as end result

### Employee Assessment Retake

**BEFORE:** Invite → Employee takes → Results visible → Can retake (limited 3x/year)

**AFTER:** Invite → Employee takes → Assessment LOCKED → HR must authorize retake → New invite with new link → Results tracked (never overwritten) → Evolution timeline

**Impact:**
- Assessment locking (no self-service retakes)
- Unique per-employee links
- Full history maintained
- Personality evolution tracking

---

## 💾 Database Design Changes Required

### New Tables Needed

**1. Assessment Versions/History**
```
assessments_history
- assessment_id (FK)
- version_id
- user_id
- organization_id
- is_current (bool) ← Important: Mark latest
- previous_assessment_id (FK) ← Link to prior
- assessment_date
- completion_date
- score
- status ('draft' | 'submitted' | 'scored')
```

**2. Personality Badge Profiles**
```
personality_profiles
- profile_id (UUID)
- user_id (FK)
- assessment_ids (array/junction table)
- consolidated_scores (JSON)
- ai_interpretation (text)
- shareable_url (unique token)
- is_public (bool)
- share_permissions (JSON: which elements public/private)
```

**3. Free Assessment Type**
```
Add assessment_type field:
- 'free_snapshot' (5-10 questions, teaser results)
- 'full_assessment' (50 questions, complete results)
```

**4. Retake Management**
```
assessments table additions:
- last_assessment_date
- retake_authorized_by (FK to user/admin)
- retake_authorized_at (timestamp)
- locked (bool) ← Employee assessments locked after completion
- locked_reason (string)
```

### Modified Tables

**assessment_invitations:**
- Add: `is_locked` flag (can't retake without new invite)
- Add: `can_be_retaken_by_employee` (bool, default false)
- Add: `auto_lock_after_completion` (bool, default true for corporate)

**assessments:**
- Add: `is_locked_by_admin` (bool, core OCEAN = true)
- Add: `editable_by_organization_admin` (bool, core = false)
- Add: `assessment_type` (free_snapshot | full_assessment | custom)
- Add: `framework` (ocean | custom | future_proprietary)

**results:**
- Add: `version_number` (for history tracking)
- Add: `is_current` (bool, latest = true)
- Add: `previous_result_id` (FK to prior version)

---

## 🎯 Feature Implementation Changes

### Free Assessment (Snapshot)

**What:**
- Short assessment (5-10 questions)
- One question per OCEAN trait (or subset)
- Fast completion (5-10 minutes)
- Teaser results only (scores, no interpretation)

**Implementation:**
```
Create separate question set:
- 5 questions (one per trait) for MVP
- Or 10 questions (two per trait) for more accuracy
- Use same scoring as full (proportional)
- Display scores only (hide interpretation)
```

**Scoring:**
```
Free snapshot scoring = proportional
If full OCEAN = 50 questions (10 per trait)
Free snapshot = 5 questions (1 per trait)
Multiply free score by 10 to normalize

Example:
Free snapshot: Score "I'm open" = 5 points
Normalized: 5 × 10 = 50 points (out of 50 for Openness)
```

### Assessment Locking

**Implementation:**
```
After employee completes assessment via HR link:
1. Assessment marked as "locked"
2. Employee cannot submit again
3. System shows "Assessment already completed"
4. Display "Awaiting HR Authorization for Retake"
5. HR can authorize via dashboard
   a. If authorized: New link generated
   b. Employee gets new 14-day link
   c. New attempt marked as "Current"
   d. Old marked as "Previous"
```

### 6-Month Retake Window (Individual)

**Implementation:**
```
For individuals (free → paid path):
1. On completion date: Set `can_retake_after` = completion_date + 6 months
2. On dashboard: Show retake button only if date passed
3. If user clicks retake:
   a. Check `can_retake_after` date
   b. If date passed: Allow new full assessment
   c. If date not passed: Show countdown ("Available in X days")
4. New assessment treated as new history entry
   - Old marked "Previous"
   - New marked "Current"
```

### Assessment History / Evolution

**Implementation:**
```
Create assessment_history view:
- All submissions for user
- Ordered by assessment_date DESC
- Mark current vs previous
- Show version/assessment_date
- Link to view each historical result
- Enable "Personality Evolution" timeline

Dashboard widget:
- Chart of user's scores over time
- Show trend (improving? declining? stable?)
- Compare current vs 6 months ago
- Visualize personality evolution
```

---

## 🎨 UI/UX Changes

### Individual User Experience

**Free Snapshot Results Screen (Before Payment):**
```
┌─────────────────────────────────┐
│ Your Quick Personality Snapshot  │
├─────────────────────────────────┤
│                                 │
│ Openness:       ████░░░░░░  6/10│
│ Conscientiousness: ████████░░  8/10│
│ Extraversion:   ███░░░░░░░░  3/10│
│ Agreeableness:  █████░░░░░░  5/10│
│ Neuroticism:    ██░░░░░░░░░  2/10│
│                                 │
│ Your Quick Snapshot tells us you│
│ are thoughtful and responsible, │
│ but prefer working independently.
│                                 │
│ Ready to unlock deeper insights?│
│                                 │
│ [UNLOCK FULL ASSESSMENT] $9.99   │
│                                 │
└─────────────────────────────────┘
```

**Full Assessment Results (After Payment):**
```
┌─────────────────────────────────┐
│ Your Complete Personality Badge  │
├─────────────────────────────────┤
│                                 │
│ [Comprehensive interpretation]   │
│ [AI-generated insights]          │
│ [Career recommendations]         │
│ [Communication style]            │
│ [Leadership style]               │
│                                 │
│ [Download PDF]                   │
│ [Share Badge]                    │
│ [View Evolution]                 │
│                                 │
└─────────────────────────────────┘
```

### Employee Retake Experience

**Employee View (After Completion):**
```
┌──────────────────────────────┐
│ Assessment Complete          │
├──────────────────────────────┤
│                              │
│ You've completed your        │
│ Personality Assessment.      │
│                              │
│ Your results have been       │
│ shared with [Company HR].    │
│                              │
│ [View My Results]            │
│ [Share My Badge]             │
│                              │
│ Status: LOCKED               │
│ Retakes require HR approval. │
│                              │
└──────────────────────────────┘
```

**HR Retake Authorization:**
```
┌──────────────────────────────┐
│ Authorize Retake             │
├──────────────────────────────┤
│                              │
│ Employee: John Smith         │
│ Last Assessment: 6 months ago│
│ Status: Locked               │
│                              │
│ [Authorize Retake]           │
│ (Sends new 14-day link)      │
│                              │
└──────────────────────────────┘
```

---

## 📊 Payment Positioning Changes

### BEFORE: Assessment → Payment
User takes full assessment, then shown payment wall (feels bad)

### AFTER: Free Snapshot → Payment → Full Assessment
User takes quick free version, sees teaser, decides to upgrade (better UX)

**Implementation:**
```
Route 1: Individual User
  GET /free-snapshot → Take assessment → See teaser → [Pay to continue]
  POST /payment → Full assessment unlocked → GET /full-assessment

Route 2: Returning Paid User
  GET /full-assessment (already paid)

Route 3: Corporate Employee
  GET /assessment?invite_token=XXX (via HR link) → No payment needed
```

---

## 🔐 Security & Permissions Changes

### Employee Assessment Privacy

**HR Can See (Configurable Per Employee):**
- ✓ Assessment completion status
- ✓ Latest assessment scores
- ✓ Assessment date
- ✗ Previous attempts (optional permission)
- ✗ Personal notes or interpretations

**Recommended Default:**
```
HR Admin Dashboard → Employee Permissions
☑ View latest assessment results
☑ View assessment completion status
☐ View full assessment history
☐ View personal notes
☐ Export individual results
```

---

## 🚀 Revised MVP Scope

### Phase 1 (Weeks 1-6): Core Platform

**MUST HAVE:**
✅ Individual account creation (lightweight)
✅ Free Personality Snapshot (5-10 questions)
✅ Teaser results display
✅ Payment gateway (Paystack)
✅ Full OCEAN assessment (50 questions, locked)
✅ Full AI-generated interpretation
✅ PDF download
✅ Email delivery
✅ Assessment history tracking (never overwrite)
✅ Employee invitation links (unique, 14-day expiry)
✅ Assessment locking (no self-service retakes)
✅ HR dashboard (view results)
✅ Basic team analytics
✅ Personality Badge profile (basic)

**SHOULD HAVE (if time):**
🟡 Shareable badge links
🟡 Personality evolution timeline
🟡 Retake authorization workflow

**DEFER TO V2:**
❌ Proprietary assessment framework
❌ Compatibility engine
❌ Full AI interpretation service (use templates V1)
❌ Schools/churches modules
❌ Open API access

---

## ✅ Clarifications to CLIENT-DECISIONS.md

### ANSWERED by Client Feedback:

**CRITICAL:**
- ✅ Payment model: HYBRID (free + paid individual, subscription corporate)
- ✅ Individual purchase flow: Free snapshot → Payment gate → Full content
- ✅ Employee links: Unique, 14-day expiry, no free retakes
- ✅ Retake policy: 6 months individual, HR auth corporate
- ✅ Assessment customization: Core locked, custom editable
- ✅ Schools/churches: Defer to V2, build configurable platform

**HIGH PRIORITY:**
- ✅ Free assessment: Personality Snapshot (5-10 questions)
- ✅ Email capture: MANDATORY (not anonymous)
- ✅ Assessment history: Maintain full history, never overwrite
- ✅ Assessment locking: Employees can't retake without HR authorization
- ✅ Teaser results: Scores only, no interpretation

### STILL NEED CLARIFICATION:

From CLIENT-DECISIONS.md, client still needs to answer:

**Payment Specifics:**
- ❓ Individual assessment price? ($5? $9.99? $14.99?)
- ❓ Subscription plans pricing (already answered: $49, $199)?
- ❓ Annual discount percentage?

**Feature Details:**
- ❓ How many questions in free snapshot? (5? 10?)
- ❓ Which traits in free snapshot? (All 5 or subset?)
- ❓ AI interpretation service in V1 or template-based?
- ❓ Shareable badge in MVP or V2?

**Technical:**
- ❓ Free assessment scoring: Proportional or separate scale?
- ❓ Personality profile consolidation: MVP or V2?

---

## 📋 Implementation Checklist

### For Development Team:

**Database:**
- [ ] Add free/full assessment type distinction
- [ ] Add assessment history tracking (never delete)
- [ ] Add "is_current" flag for versioning
- [ ] Add assessment locking mechanism
- [ ] Add personality profile table (future)
- [ ] Design assessment versioning strategy

**Backend:**
- [ ] Implement free snapshot scoring
- [ ] Implement payment gate positioning
- [ ] Implement assessment locking logic
- [ ] Implement retake authorization workflow
- [ ] Track assessment history
- [ ] Implement 6-month retake window

**Frontend:**
- [ ] Design free snapshot results screen
- [ ] Design teaser results ("unlock to see more")
- [ ] Design payment modal/page
- [ ] Design full results screen (post-payment)
- [ ] Design employee assessment lock message
- [ ] Design HR retake authorization UI

**Business Logic:**
- [ ] Payment flow: Free → Teaser → Payment → Full
- [ ] Retake flow: Completion → Lock → HR Auth → New Link
- [ ] History tracking: All submissions retained
- [ ] Evolution timeline: Track personality over time

---

## 🎯 Next Steps

1. ✅ Document client requirements (DONE)
2. ✅ Update key planning areas (DONE: Areas 2, 3)
3. ⏳ Update remaining areas (4, 6, 7)
4. ⏳ Update CLIENT-DECISIONS.md (mark answered questions)
5. ⏳ Create updated database ERD
6. ⏳ Create payment flow diagram
7. ⏳ Clarify remaining questions with client
8. ⏳ Lock final architecture
9. ⏳ Begin implementation (Week 2)

---

## 📞 Questions for Client (From Updated Planning)

**Payment Specifics:**
1. Individual assessment cost? ($5/$9.99/$14.99/other?)
2. Keep subscription pricing? ($49/$199/enterprise?)
3. Annual discount? (already chosen: 2 months free)

**Assessment Details:**
4. Free snapshot questions? (5 or 10 questions total?)
5. Which traits in free snapshot? (all 5 or subset?)
6. Free snapshot scoring proportional or separate?

**Features:**
7. AI interpretation in V1 (call Claude API) or template-based?
8. Shareable badge in MVP or Phase 2?
9. Personality evolution chart in MVP or Phase 2?

**Timeline:**
10. Confirm timeline still 8 weeks with new flow?

---

**Status:** Ready for client clarification on remaining questions + team implementation planning.

