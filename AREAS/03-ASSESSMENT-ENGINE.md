# Area 3: Assessment Engine Design

**Status:** 🔴 In Progress  
**Priority:** CRITICAL — Core feature, gates database design  
**Depends On:** Area 1 ✅, Area 2 🔴

---

## Overview

The Assessment Engine is the **heart** of this platform. It defines:
- How tests are structured
- How questions are organized
- How scoring works
- How results are interpreted

This must be flexible enough to support:
- OCEAN personality test (MVP)
- Custom tests (created by admins/HR)
- Different question types
- Configurable scoring logic

---

## 📊 Assessment Structure

### Assessment Types

**1. Free Snapshot Assessment (Lead Magnet)**
```
Purpose: Quick discovery, build interest
Duration: 5-10 minutes
Questions: 5-10 questions (subset of traits)
Example: Single question per trait
- "I enjoy socializing" (Extraversion)
- "I complete tasks thoroughly" (Conscientiousness)
- "I'm open to new ideas" (Openness)
- "I'm considerate to others" (Agreeableness)
- "I remain calm under pressure" (Neuroticism stability)

Results: Teaser results only
- Scores visible
- NO interpretation
- Limited preview
- CTA to unlock full assessment
```

**2. Full Assessment Hierarchy**
```
Assessment
├── Section (e.g., "Openness", "Conscientiousness")
│   ├── Question 1
│   ├── Question 2
│   └── Question N
├── Section 2
│   ├── Question 1
│   └── Question N
└── Section N

Example: OCEAN Test (Full)
├── Openness (10 questions)
├── Conscientiousness (10 questions)
├── Extraversion (10 questions)
├── Agreeableness (10 questions)
└── Neuroticism (10 questions)
Total: 50 questions

Results: Complete interpretation + AI insights
```

### Assessment Metadata

Each assessment has:
- **ID** — Unique identifier (UUID)
- **Name** — "OCEAN Personality Test", "Leadership Assessment", etc.
- **Description** — What this test measures
- **Version** — Allows updates without breaking old submissions
- **Status** — Draft, Published, Archived
- **Duration** — Estimated time to complete (in minutes)
- **Instructions** — Explanation shown before starting
- **Passing Score** — Minimum score to "pass" (if applicable)
- **Sections** — Array of sections (see below)
- **Scoring Rules** — How to calculate scores (see below)
- **Created By** — Admin who created this
- **Created At** — Timestamp
- **Updated At** — Timestamp

---

## 🔤 Section Structure

Each **Section** represents a trait or dimension being measured.

### Section Metadata

- **ID** — Unique identifier
- **Assessment ID** — Which assessment it belongs to
- **Name** — "Openness", "Leadership Skills", etc.
- **Description** — What this section measures
- **Order** — Display order (1, 2, 3...)
- **Questions** — Array of questions (see below)
- **Weight** — How much this section contributes to final score (0.0 - 1.0)
  - Example: Openness = 0.2, Conscientiousness = 0.2, etc.

### Section Scoring

- **Calculation Method:** Sum of question scores, then normalize to 0-100
- **Result:** Numeric score + interpretation text

Example Output:
```json
{
  "section_id": "openness",
  "name": "Openness",
  "score": 78,
  "percentile": 85,
  "interpretation": "High openness indicates you're creative, curious, and open to new experiences",
  "strengths": ["Creativity", "Intellectual curiosity"],
  "growth_areas": ["Resistance to change"]
}
```

---

## ❓ Question Structure

Each **Question** is an item respondents answer.

### Question Metadata

- **ID** — Unique identifier
- **Section ID** — Which section it belongs to
- **Assessment ID** — Which assessment (for quick lookup)
- **Text** — The question itself
  - Example: "I am the life of the party"
  - Example: "I get stressed easily"
- **Question Type** — (see below)
- **Options** — Array of answer choices (see below)
- **Order** — Display order within section
- **Scoring Logic** — How this question contributes to section score
- **Required** — Can user skip this question?

### Question Types Supported

#### 1. **Radio Buttons (Single Select)**
Used for: Basic personality questions
```
Question: "I enjoy socializing with large groups"
Options:
  - Strongly Disagree (1 point)
  - Disagree (2 points)
  - Neutral (3 points)
  - Agree (4 points)
  - Strongly Agree (5 points)
```

#### 2. **Likert Scale (Slider)**
Used for: Rating intensity or agreement
```
Question: "Rate your comfort in public speaking"
Scale: 1 (Very Uncomfortable) ←→ 10 (Very Comfortable)
User clicks slider to select score
```

#### 3. **Matrix Questions**
Used for: Multiple related questions at once
```
Question: "For each statement, indicate your level of agreement"
Rows:
  - I am talkative
  - I am reserved
  - I am outgoing
Columns:
  - Strongly Disagree (1)
  - Disagree (2)
  - Neutral (3)
  - Agree (4)
  - Strongly Agree (5)

User selects one value per row
```

#### 4. **Multi-Select Checkboxes**
Used for: Multiple correct answers
```
Question: "Which of these activities appeal to you? (Select all that apply)"
Options:
  ☐ Reading
  ☐ Hiking
  ☐ Parties
  ☐ Video games
  ☐ Painting

Scoring: Each selection = 1 point (or custom weights)
```

#### 5. **Dropdown Select**
Used for: Long lists of options
```
Question: "What is your primary work style?"
Options: [Select option]
  - Analytical
  - Creative
  - Practical
  - Interpersonal
```

#### 6. **Ranking (Drag & Drop)**
Used for: Prioritization
```
Question: "Rank these values from most to least important"
Items: [Drag to reorder]
  1. Career success
  2. Family time
  3. Personal growth
  4. Financial security
```

---

## 🧮 Answer & Scoring

### Answer Data

When a user answers a question, we store:

```json
{
  "id": "uuid",
  "submission_id": "uuid",
  "assessment_id": "uuid",
  "section_id": "uuid",
  "question_id": "uuid",
  "answer_value": 4,  // for radio/slider
  "answer_text": "Strongly Agree",
  "selected_options": ["Reading", "Painting"],  // for multi-select
  "ranked_order": [2, 1, 3, 4],  // for ranking
  "answered_at": "2026-09-25T14:30:00Z",
  "time_spent_seconds": 12
}
```

### Scoring Logic

Each question contributes points to its section.

**Example: OCEAN Scoring**

```
Question: "I am the life of the party"
Trait: Extraversion
Answer: "Strongly Agree" (5 points)

Score Contribution: +5 points to Extraversion section

Section Total (Extraversion):
- 10 questions
- Each scored 1-5
- Raw score: 35-50 (out of 50)
- Normalized: (35/50) * 100 = 70/100
```

### Reverse-Scored Questions

Some questions are reverse-coded (higher score means lower trait).

```
Question: "I prefer to work alone"
Trait: Extraversion (measures how outgoing you are)

If you answer "Strongly Agree" (5 points):
- This indicates LOW extraversion
- So the system reverses: 6 - 5 = 1 point
- Reverse-scored questions have a "reverse_score: true" flag
```

### Weighted Scoring

Different sections can contribute differently to final score:

```
OCEAN Final Score = 
  (Openness × 0.20) +
  (Conscientiousness × 0.20) +
  (Extraversion × 0.20) +
  (Agreeableness × 0.20) +
  (Neuroticism × 0.20)

Result: 0-100 overall personality score
```

---

## 📈 Result Interpretation

After scoring, we interpret results for the user:

### Score Ranges & Interpretations

```
Score: 0-20 — Very Low
Score: 21-40 — Low
Score: 41-60 — Moderate
Score: 61-80 — High
Score: 81-100 — Very High
```

### Percentile Ranking

We compare their score to population norms:

```
User's Openness: 78/100
Percentile: 85th

Interpretation: "You score higher than 85% of test-takers on Openness"
```

### Personality Profile

We create a narrative interpretation:

```
OPENNESS (78/100)
You are highly open to new experiences. You likely:
- Enjoy exploring new ideas and creative pursuits
- Feel comfortable with change and ambiguity
- Appreciate art, culture, and intellectual discussion

Strengths:
- Creative problem solving
- Adaptability
- Curiosity

Growth Areas:
- May sometimes lack focus (pursuing too many interests)
- Could benefit from more structure

Career Suggestions:
- Research
- Design
- Consulting
- Entrepreneurship
```

---

## 🔐 Assessment Locking & Versions

### Core OCEAN Assessment: LOCKED

**Immutable Properties:**
- Questions: FIXED (cannot be edited by organization admins)
- Question order: FIXED
- Scoring methodology: FIXED
- Interpretation thresholds: FIXED
- Interpretation text: FIXED

**Why Lock:**
- Data consistency (all OCEAN scores are comparable)
- Validity (maintain psychometric integrity)
- Brand integrity (Personality Badge OCEAN = one definition)
- Comparability (can track personality evolution across time)

**Admin Capabilities on Locked Assessments:**
- View the assessment
- Use in invitations
- View results
- Cannot: Edit questions, modify scoring, change interpretation

### Organization Custom Assessments: CUSTOMIZABLE

**Customizable Properties:**
- Custom questions (admin writes)
- Custom scoring (admin defines weights)
- Custom interpretation (admin writes results text)
- Custom sections/traits
- Clearly labeled as "CUSTOM ASSESSMENT" (not official Badge)

**Customizable Admin Capabilities:**
- Create new custom assessment
- Edit questions
- Modify scoring logic
- Change interpretation text
- Delete custom assessment

**Limitations:**
- Cannot customize official OCEAN
- Custom assessments not comparable across organizations
- Custom scoring is organization-specific only

### Assessment Versioning

Each assessment has:
- Version ID (date or semantic versioning)
- Status: Draft, Published, Archived
- Change log (if applicable)
- Used by: X employees/organization

**When to Version:**
- Locked assessments: Never (same version forever)
- Custom assessments: Version on significant changes

---

## 🎛️ Admin Test Creation Interface

**Capability in MVP:** Admins can create custom assessments (not edit OCEAN)

### What Admins Can Do:

1. **Create Assessment**
   - Name, description, duration
   - Choose sections (e.g., "Leadership", "Customer Service")

2. **Add Sections**
   - Name, description, weight
   - How many questions per section?

3. **Add Questions**
   - Question text
   - Question type (radio, slider, matrix, etc.)
   - Options/scale
   - Scoring weights
   - Reverse-scored? (yes/no)

4. **Set Scoring Rules**
   - How to calculate section scores?
   - How to calculate final score?
   - What are interpretation thresholds?

5. **Publish**
   - Make test available
   - Can't edit after published (versioning)

---

## 🔄 Question Bank (Future)

We should maintain a **question library** that admins can reuse:

```
Question Bank
├── OCEAN Trait Questions (pre-loaded)
├── Leadership Questions
├── Customer Service Questions
├── Communication Skills
└── Custom Organization Questions
```

Admins can:
- Search the question bank
- Add existing questions to their test
- Create new custom questions

---

## 🌍 Multi-Language Support (Phase 2)

Each question can have translations:

```
Question (English): "I am the life of the party"
Question (Spanish): "Soy la vida de la fiesta"
Question (French): "Je suis la vie de la fête"

Options (English): ["Strongly Disagree", "Disagree", ...]
Options (Spanish): ["Totalmente en desacuerdo", "En desacuerdo", ...]
```

---

## 📋 OCEAN Test Specification (MVP)

Since OCEAN is the MVP test, here's the exact structure:

### Openness to Experience (10 questions)
- Creativity, curiosity, appreciation for art/ideas
- Sample questions:
  - "I enjoy exploring new ideas"
  - "I am interested in art and culture"
  - "I prefer routine to trying new things" (reverse-scored)

### Conscientiousness (10 questions)
- Discipline, organization, responsibility
- Sample questions:
  - "I am very organized"
  - "I get things done"
  - "I am often messy" (reverse-scored)

### Extraversion (10 questions)
- Sociability, assertiveness, outgoingness
- Sample questions:
  - "I am the life of the party"
  - "I like meeting new people"
  - "I prefer working alone" (reverse-scored)

### Agreeableness (10 questions)
- Compassion, cooperation, kindness
- Sample questions:
  - "I care about others' feelings"
  - "I am generally kind"
  - "I can be cold toward others" (reverse-scored)

### Neuroticism (10 questions)
- Emotional stability, anxiety, sensitivity
- Sample questions:
  - "I get stressed easily"
  - "I worry about things"
  - "I am very calm" (reverse-scored)

---

## ✅ Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Scoring Location** | Backend only | Prevents manipulation, ensures consistency |
| **Question Types** | All 6 types supported | Flexibility for custom tests |
| **Reverse Scoring** | Yes, supported | Standard for personality tests |
| **Question Bank** | Yes, reusable | Speeds up test creation |
| **Versioning** | Tests have versions | Allows updates without breaking old submissions |
| **Admin Creation** | Phase 2 | Focus MVP on OCEAN test |
| **Multi-language** | Phase 2 | English MVP, translate later |

---

## 🗄️ Database Tables Required

(Detailed ERD in Area 4, but preview:)

```
assessments (id, name, description, version, status, ...)
sections (id, assessment_id, name, weight, ...)
questions (id, section_id, text, type, reverse_scored, ...)
question_options (id, question_id, text, score_value, ...)
submissions (id, user_id, assessment_id, started_at, completed_at, ...)
answers (id, submission_id, question_id, answer_value, ...)
results (id, submission_id, section_scores, final_score, ...)
```

---

## ❓ Open Questions for Client

1. **OCEAN Test Fine-Tuning:**
   - Should we use the standard Big Five questions or custom ones?
   - Any specific research backing the scoring thresholds?

2. **Admin Test Creation (Phase 2):**
   - Should admins be able to set custom scoring weights?
   - Should they configure interpretation thresholds, or use defaults?
   - Can HR admins create tests, or only platform admins?

3. **Question Bank:**
   - Should organizations own their custom questions, or are they shared?
   - Can admins delete/edit published questions?

4. **Scoring Customization:**
   - Can different organizations have different scoring for same questions?
   - Should we support A/B testing different scoring models?

5. **Real-Time Scoring:**
   - Should we show users their running score as they answer?
   - Or only reveal final score after submission?

---

## 📝 Next Steps

1. Confirm OCEAN test questions and scoring
2. Lock down assessment engine design
3. Move to **Area 4: Database Architecture** (create full ERD)
4. Then **Area 5: Auth & Authorization**

**Time estimate:** 20 minutes to review, 10 minutes for client to answer questions

