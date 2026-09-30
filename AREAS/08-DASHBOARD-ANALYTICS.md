# Area 8: Dashboard & Analytics

**Status:** 🔴 In Progress  
**Priority:** HIGH — Core user experience  
**Depends On:** Area 1 ✅, Area 3 🔴, Area 4 🔴, Area 7 🔴

---

## Overview

Each user type sees a different dashboard tailored to their role.

This area defines:
- What each user sees
- What metrics matter
- Chart types & visualizations
- Data refresh frequency
- Export capabilities

---

## 📊 Dashboard Types

### 1. Individual User Dashboard

**Purpose:** View personal assessment history & progress

**Layout:**
```
┌─────────────────────────────────────────┐
│ Welcome, Sarah! 👋                      │
├─────────────────────────────────────────┤
│                                         │
│ QUICK STATS:                            │
│ • Assessments Taken: 3                  │
│ • Latest Score: 72/100                  │
│ • Last Taken: 5 days ago                │
│                                         │
├─────────────────────────────────────────┤
│ YOUR RECENT RESULTS:                    │
│                                         │
│ [OCEAN Test] - Sept 25, 2026            │
│ Score: 72/100 | Percentile: 78          │
│ [View] [Download] [Share]               │
│                                         │
│ [OCEAN Test] - Aug 15, 2026             │
│ Score: 70/100 | Percentile: 75          │
│ [View] [Download] [Share]               │
│                                         │
│ [Leadership Test] - July 10, 2026       │
│ Score: 68/100 | Percentile: 72          │
│ [View] [Download] [Share]               │
│                                         │
├─────────────────────────────────────────┤
│ YOUR IMPROVEMENT:                       │
│                                         │
│ OCEAN Score Trend (Last 6 months)       │
│         /‾‾‾\                          │
│        /     \                          │
│   ___/       \___                       │
│  /               \_                     │
│                                         │
│ Average Score: 71/100 (improving!)      │
│                                         │
├─────────────────────────────────────────┤
│ [Take New Assessment] [Profile] [Help]  │
└─────────────────────────────────────────┘
```

**Key Metrics:**
- Total assessments taken
- Latest score & percentile
- Last assessment date
- Score trend (chart)
- Improvement over time

**Available Actions:**
- Take new assessment
- View past results
- Download PDF
- Share results
- View detailed profile
- Update profile info

---

### 2. HR Administrator Dashboard

**Purpose:** Manage team assessments & analytics

**Layout:**

```
┌────────────────────────────────────────────┐
│ Acme Corp - HR Dashboard                   │
├────────────────────────────────────────────┤
│                                            │
│ TEAM SNAPSHOT:                             │
│ • Total Employees: 42                      │
│ • Assessments Completed: 38 (90%)          │
│ • Pending: 4                               │
│ • Plan: Professional (100 seats)           │
│                                            │
├────────────────────────────────────────────┤
│ QUICK ACTIONS:                             │
│ [Invite Employees] [Create Assessment]    │
│ [Export Results]   [View Team Insights]    │
│                                            │
├────────────────────────────────────────────┤
│ PERSONALITY DISTRIBUTION:                  │
│                                            │
│ Openness:  ███████░░  (32% high)          │
│ Conscios:  ████████░░ (38% high)          │
│ Extravers: ██████░░░░ (28% high)          │
│ Agreeabl:  ████████░░ (36% high)          │
│ Neurotism: ████░░░░░░ (18% high)          │
│                                            │
├────────────────────────────────────────────┤
│ DEPARTMENT COMPARISON:                     │
│                                            │
│           | Sales | Eng | HR  | Ops |      │
│ Avg Score | 68    | 74  | 70  | 69  |      │
│ Openness  | 7.2   | 7.8 | 7.5 | 7.1 |      │
│                                            │
├────────────────────────────────────────────┤
│ COMPLETION STATUS:                         │
│                                            │
│ Completed:  ████████████████░░ 90%        │
│ In Progress: ██░░░░░░░░░░░░░░░░░░░░ 8%  │
│ Not Started: ░░░░░░░░░░░░░░░░░░░░░░░░ 2%|
│                                            │
│ Reminder Email [Send]                      │
│                                            │
├────────────────────────────────────────────┤
│ RECENT ACTIVITY:                           │
│ • Jane completed OCEAN (Sept 25)           │
│ • Team Compatibility updated (Sept 24)    │
│ • 5 new employees invited (Sept 23)       │
│                                            │
├────────────────────────────────────────────┤
│ [Manage Team] [Settings] [Billing]         │
└────────────────────────────────────────────┘
```

**Key Metrics:**
- Team size & completion %
- Personality distribution (charts)
- Department comparison
- Completion status (progress bar)
- Recent activity timeline

**Advanced Analytics (Professional+ Plan):**
- Team compatibility scores
- Ideal team composition
- Hiring recommendations
- Collaboration insights
- Conflict prediction

**Available Actions:**
- Invite employees (bulk or individual)
- Send completion reminders
- View individual results (with employee permission)
- Export team data (CSV/PDF)
- Create custom reports
- Manage assessments
- View team insights

**Data Refresh:** Real-time (updates when employee completes)

---

### 3. School Administrator Dashboard

**Similar to HR, but for classes:**

```
Differences from HR dashboard:
• Shows: Classes instead of Departments
• Shows: Students instead of Employees
• Shows: Class dynamics instead of Team compatibility
• Shows: Teacher notes on student personalities
• Shows: Class balance (personality distribution)

Key Metrics:
- Students per class
- Completion % per class
- Personality distribution in class
- Individual student profiles
- Classroom dynamic insights
```

---

### 4. Church/Community Leader Dashboard

**Similar to HR, but for groups:**

```
Differences from HR dashboard:
• Shows: Groups instead of Departments
• Shows: Members instead of Employees
• Shows: Community strengths instead of Team compatibility
• Shows: Member directory with personality icons
• Shows: Group engagement metrics

Key Metrics:
- Members per group
- Completion %
- Community personality profile
- Member engagement
- Volunteer suggestions
```

---

### 5. Platform Admin Dashboard

**Purpose:** System health, revenue, user management

**Layout:**

```
┌────────────────────────────────────────┐
│ Platform Admin - System Dashboard      │
├────────────────────────────────────────┤
│                                        │
│ SYSTEM STATUS:                         │
│ • Total Users: 12,450                  │
│ • Total Organizations: 234             │
│ • Assessments Submitted: 45,320        │
│ • System Health: 99.9% ✓               │
│                                        │
│ REVENUE (This Month):                  │
│ • Total: $24,580                       │
│ • One-time: $4,230 (17%)               │
│ • Subscriptions: $20,350 (83%)          │
│ • MRR: $20,350                         │
│ • ARR: $244,200 (projected)            │
│                                        │
│ ACTIVE SUBSCRIPTIONS:                  │
│ • Starter: 120 orgs ($5,880/month)     │
│ • Professional: 85 orgs ($16,915/month)│
│ • Enterprise: 8 orgs ($3,555/month)    │
│ • Total MRR: $26,350                   │
│                                        │
│ TOP ORGANIZATIONS (by activity):       │
│ 1. Acme Corp - 42 employees            │
│ 2. Tech School - 234 students          │
│ 3. First Baptist - 156 members         │
│                                        │
│ PAYMENT HEALTH:                        │
│ • Successful charges: 99.2%            │
│ • Failed charges: 0.6%                 │
│ • Chargebacks: 0.2%                    │
│ • Refunds (30-day): $1,245             │
│                                        │
│ USAGE TRENDS:                          │
│ • Daily active users: 1,234            │
│ • Assessments/day: 340                 │
│ • PDFs generated/day: 280              │
│ • API calls/day: 12,450                │
│                                        │
│ ALERTS:                                │
│ • 5 pending refund requests            │
│ • 2 accounts flagged for fraud         │
│ • API rate limit exceeded (1 org)      │
│                                        │
│ [View Logs] [Manage Users] [Settings]  │
└────────────────────────────────────────┘
```

**Key Metrics:**
- Total users, organizations, submissions
- Revenue (current month, MRR, ARR)
- Subscription breakdown
- Top organizations
- Payment health
- Usage trends
- System alerts

**Available Actions:**
- Manage users (ban, reset password)
- Create/edit/delete assessments
- View audit logs
- Process refunds
- View payment reconciliation
- System configuration
- API key management

---

## 📈 Chart Types & Visualizations

### Bar Chart
**Used for:** Department/class comparison, personality distribution

```
Openness
   ████ 32%

Conscientiousness
   ████████ 38%

Extraversion
   ██████ 28%

Agreeableness
   ████████ 36%

Neuroticism
   ████ 18%
```

### Line Chart
**Used for:** Trends over time, score improvement

```
Score Trend (Last 6 months)
75 ┤     ╱╲
74 ├    ╱  ╲    ╱‾╲
73 ├   ╱    ╲  ╱   ╲
72 ├  ╱      ╲╱     ╲
71 ├ ╱               ╲___
70 ├╱
   └─────────────────────
    Jun Jul Aug Sep Oct
```

### Pie Chart
**Used for:** Completion status, subscription breakdown

```
Completed (90%)
In Progress (8%)
Not Started (2%)
```

### Heatmap
**Used for:** Team compatibility, department comparison

```
       Sales  Eng  HR   Ops
       ─────────────────────
Sales  ██░░   ████ ███░ ██░░
Eng    ████   ██░░ ███░ ███░
HR     ███░   ███░ ██░░ ██░░
Ops    ██░░   ███░ ██░░ ██░░

Green (high compatibility) → Red (low compatibility)
```

### Table
**Used for:** Detailed results, activity log

```
| Name     | Department | Score | Percentile | Status     |
|----------|------------|-------|------------|------------|
| John D.  | Sales      | 78    | 85         | Completed  |
| Jane S.  | Engineering| 82    | 92         | Completed  |
| Bob M.   | HR         | 65    | 60         | In Progress|
```

---

## 🔄 Data Refresh Strategy

### Real-Time Updates
- Completion status (instant when submitted)
- Recent activity (within 1 second)

### Cached (Updated Every 5 Minutes)
- Personality distribution (bar charts)
- Department comparisons
- Score trends
- Team compatibility scores

### Batch (Updated Daily)
- Advanced analytics
- Trend analysis
- Recommendations
- Forecasts

**Backend Strategy:**
```
On Assessment Completion:
1. Calculate individual results (immediately)
2. Update user dashboard (immediately)
3. Invalidate org dashboard cache
4. Regenerate cache in background (within 5 min)
5. Send admin notification
6. Update audit logs

Daily Batch:
1. Regenerate advanced analytics
2. Calculate trend changes
3. Update team compatibility scores
4. Generate recommendations
5. Update cache
```

---

## 📊 Export Capabilities

### Individual Export
User can export their own results:
```
Formats: PDF, CSV, JSON
Contents: All past results + scores + interpretations
Size: ~500KB - 5MB depending on history
Frequency: Unlimited
```

### Bulk Export (HR/Admin)
Admin can export team/org results:
```
Formats: CSV, PDF (combined or individual)
Contents: All submitted assessments + scores + interpretations
Size: Varies by team size
Frequency: Unlimited
Schedule: On-demand or scheduled daily/weekly

CSV Format Example:
Employee ID, Name, Department, Assessment, Score, Percentile, Date, Status
EMP001, John Doe, Sales, OCEAN, 78, 85, 2026-09-25, Completed
```

### Analytics Export
Advanced analytics & insights:
```
Formats: PDF, PPT, JSON
Contents: Charts, trends, recommendations, team insights
Size: 2-10MB
Frequency: Unlimited
```

---

## 🔐 Privacy & Permissions

### Individual Dashboard
- User sees: Only their own results
- No other users visible
- Full details on past scores

### HR Dashboard
**What HR can see:**
- Team aggregate data (always visible)
- Individual results (only if employee gave permission OR org policy allows)
- Export data for team members

**What HR cannot see:**
- Other organizations' data
- Results from before they were invited

### Privacy Controls (Per Organization)
```
Organization Setting:
[ ] HR admins can view individual results
    (if unchecked: aggregate data only)
[ ] Employees can see peer results
    (if unchecked: personal only)
[ ] Share results with peer group
    (if unchecked: admin-only viewing)
```

---

## 📱 Responsive Design

### Desktop (1200px+)
- Full charts & visualizations
- Side-by-side comparisons
- Advanced metrics visible
- All features accessible

### Tablet (768px - 1199px)
- Stacked layout (charts on top of tables)
- Touch-friendly buttons
- Charts slightly simplified
- Core metrics visible

### Mobile (< 768px)
- Single column layout
- Charts compressed to fit screen
- Scroll for detailed data
- Key metrics only (summary)
- Simplified navigation

---

## ⏱️ Performance Targets

```
Dashboard Load Time: < 2 seconds
Chart Rendering: < 1 second
Export Generation: < 5 seconds
Search: < 500ms
API Response: < 200ms
```

**Optimization Strategy:**
- Data caching (Redis)
- Database query optimization
- Lazy loading charts
- Pagination for large lists
- CDN for static assets

---

## ❓ Open Questions for Client

1. **Dashboard Customization:**
   - Should orgs customize which metrics they see?
   - Drag-to-reorder widgets?
   - Save multiple dashboard views?

2. **Real-Time vs Cached:**
   - Is 5-minute cache acceptable or need real-time?
   - Performance vs freshness tradeoff?

3. **Mobile Priority:**
   - Is mobile dashboard critical for launch?
   - Or can it be optimized in Phase 2?

4. **Advanced Analytics:**
   - Are all advanced features (compatibility, predictions) in MVP?
   - Or Phase 2 feature?

5. **Data Visualization Library:**
   - Recommend: Recharts (React) + Chart.js
   - Or different preference?

6. **Alerts & Notifications:**
   - Should admins get real-time notifications?
   - Email only or push notifications too?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Dashboard Types** | 5 (individual, HR, school, church, admin) | Different data needs |
| **Data Refresh** | Real-time + 5min cache + daily batch | Balance freshness & performance |
| **Charts** | Recharts (React component library) | React-native, customizable, performant |
| **Export Formats** | CSV + PDF | Most common business formats |
| **Privacy** | Configurable per organization | Flexibility for different cultures |
| **Mobile** | Responsive, simplified for mobile | Support all devices |

---

## 📝 Next Steps

1. Answer 6 open questions
2. Review dashboard layouts
3. Approve visualization approach
4. Move to **Area 9: Infrastructure & Deployment**

