# Area 11: UI/UX System

**Status:** 🔴 In Progress  
**Priority:** HIGH — User experience foundation  
**Depends On:** Area 2 🔴

---

## Overview

UI/UX System defines:
- Design language & principles
- Component library
- Typography & spacing
- Color palette
- Interaction patterns
- Accessibility standards
- Responsive behavior

---

## 🎨 Design System Approach

We'll use **Tailwind CSS + Shadcn/ui** for rapid development.

This approach:
- ✅ Pre-built, accessible components
- ✅ Consistency across all pages
- ✅ Fast development (no custom CSS)
- ✅ Dark mode support built-in
- ✅ Mobile-first design
- ✅ WCAG 2.1 AA compliant

---

## 🌈 Color Palette

### Primary Colors

```
Primary Blue: #2563eb (Tailwind blue-600)
  - Used for: CTAs, links, active states
  - RGB: 37, 99, 235

Secondary Blue: #1e40af (Tailwind blue-800)
  - Used for: Hover states, secondary actions
  - RGB: 30, 64, 175

Light Blue: #dbeafe (Tailwind blue-100)
  - Used for: Backgrounds, hover (light theme)
  - RGB: 219, 238, 254

Dark Blue: #0c2340 (Near black)
  - Used for: Text, dark theme
  - RGB: 12, 35, 64
```

### Semantic Colors

```
Success: #10b981 (Green-600)
  - Used for: Positive actions, checkmarks, confirmations

Warning: #f59e0b (Amber-500)
  - Used for: Warnings, attention needed

Error: #ef4444 (Red-600)
  - Used for: Errors, destructive actions

Info: #3b82f6 (Blue-500)
  - Used for: Information, help text

Neutral: #6b7280 (Gray-500)
  - Used for: Disabled states, secondary text
```

### Dark Mode

```
Dark Background: #1f2937 (Gray-900)
Dark Secondary: #374151 (Gray-700)
Dark Text: #f3f4f6 (Gray-100)
Dark Text Secondary: #d1d5db (Gray-300)
```

### White-Label Customization

For organizations, allow:
```
- Primary color: Replace #2563eb
- Secondary color: Replace #1e40af
- Logo: Upload image
- Typography: Keep system font

Example: HR department can brand reports with company colors
```

---

## 📝 Typography

### Font Stack

```
System Font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif

Why: Native fonts load instantly, no web font requests needed
Result: Faster page load, more authentic feel

Fallback (if custom font desired): Inter (from Google Fonts)
```

### Font Sizes & Weights

```
Heading 1 (H1): 32px, Bold (700)
  Used for: Page titles
  Line height: 1.2

Heading 2 (H2): 24px, Bold (700)
  Used for: Section titles
  Line height: 1.3

Heading 3 (H3): 20px, Semibold (600)
  Used for: Subsection titles
  Line height: 1.4

Body (default): 16px, Regular (400)
  Used for: Main text, paragraphs
  Line height: 1.5

Small: 14px, Regular (400)
  Used for: Secondary text, labels
  Line height: 1.5

Tiny: 12px, Regular (400)
  Used for: Captions, help text
  Line height: 1.4
```

---

## 📏 Spacing System

Using 8px base unit (Tailwind default):

```
xs: 4px (0.5 * 8px) — Very tight
sm: 8px (1 * 8px) — Tight spacing
md: 16px (2 * 8px) — Default spacing
lg: 24px (3 * 8px) — Loose spacing
xl: 32px (4 * 8px) — Extra loose
2xl: 48px (6 * 8px) — Very loose
```

**Usage:**
```
Button padding: 12px (1.5x) horizontal, 8px vertical
Card padding: 24px
Section margins: 48px (between major sections)
Input padding: 12px
```

---

## 🧩 Component Library

### Shadcn/ui Components

**Basic Components:**
- Button
- Input
- Text Area
- Select
- Checkbox
- Radio
- Toggle
- Label

**Complex Components:**
- Dialog/Modal
- Dropdown Menu
- Tabs
- Accordion
- Card
- Badge
- Avatar
- Progress Bar
- Toast Notifications
- Skeleton Loaders
- Breadcrumbs
- Pagination

**Form Components:**
- Form (React Hook Form wrapper)
- Validation messaging
- Error states
- Loading states

**Layout Components:**
- Container
- Grid
- Sidebar
- Header/Navigation
- Footer

### Custom Components (For This Project)

```
1. AssessmentCard
   - Display assessment metadata
   - Show progress if in progress
   - Actions: Start, resume, view results

2. PersonalityScoreDisplay
   - Show score + percentile
   - Circular progress indicator
   - Category label (Low/Moderate/High/Very High)

3. ResultsVisualization
   - Personality trait bars
   - Section scores
   - Comparison to average

4. QuestionRenderer
   - Render different question types
   - Handle radio buttons, sliders, matrix
   - Save progress indicator

5. ReportTemplate
   - PDF-ready template
   - White-label branding
   - Print-friendly styling

6. DashboardWidget
   - Reusable dashboard card
   - Chart wrapper
   - Header + content + footer
```

---

## 🎯 Page Templates

### Landing Page

```
Header:
├── Logo
├── Navigation (Home, Features, Pricing, Log In)
└── CTA Button (Start Free)

Hero Section:
├── Headline: "Discover Your Personality"
├── Subheading: "Take the OCEAN personality assessment"
├── CTA: [Get Started Now]
└── Hero image (illustration of personality traits)

Features Section:
├── Feature 1: Scientific Assessment
├── Feature 2: Instant Results
├── Feature 3: Shareable Reports
└── Feature 4: Team Insights

Pricing Section:
├── Individual pricing
├── Organization pricing
└── CTA: [Start Your Plan]

FAQ Section:
└── Common questions & answers

Footer:
├── Links (Privacy, Terms, Contact)
├── Newsletter signup
└── Copyright
```

### Authentication Pages

```
Sign Up:
├── Email input
├── Password input (with requirements)
├── Full name input
├── T&Cs checkbox
├── Sign up button
└── "Already have an account?" link

Log In:
├── Email input
├── Password input
├── Remember me checkbox
├── Log in button
├── "Forgot password?" link
└── "Don't have an account?" link

Password Reset:
├── Email input
├── Email sent message
├── "Resend email" option
├── Back to login link
```

### Assessment Page

```
Header:
├── Assessment title & progress
├── Time elapsed
└── Estimated time remaining

Question Display:
├── Question number (e.g., "Question 3 of 50")
├── Question text
├── Answer options (depends on type)
└── Navigation: [Previous] [Next]

Sidebar (Desktop Only):
├── Progress bar (overall)
├── Completion %
└── Timer

Mobile (Bottom):
└── Progress bar (horizontal)

On Last Question:
└── [Submit Assessment] instead of [Next]
```

### Results Page

```
Header:
├── "Assessment Complete!" message
├── Date & time taken
└── [Download PDF] [Email] [Share]

Overall Score Section:
├── Large score display (72/100)
├── Percentile (78th percentile)
└── Category (High/Very High, etc.)

Section Scores:
├── For each trait:
│   ├── Trait name
│   ├── Score + percentile
│   ├── Score bar
│   ├── Interpretation text
│   ├── Key strengths
│   └── Growth areas
└── [Collapse/Expand]

Career Insights:
├── Recommended roles
├── Ideal work environment
├── Team contribution style
└── Communication style

Actions:
├── [Download PDF]
├── [Share Results]
├── [Email Results]
├── [Print]
└── [Take Another Assessment]
```

### Dashboard Pages

**Individual Dashboard:**
```
Header: "Welcome, [Name]!"

Quick Stats:
├── Assessments taken
├── Latest score
└── Last taken

Recent Results (List):
├── For each assessment:
│   ├── Assessment name & date
│   ├── Score & percentile
│   └── Actions: [View] [Download] [Share]
└── [Load More]

Improvement Chart:
├── Score trend over time
├── Chart type: Line chart
└── Time range: [Last 6 months / Year / All Time]

CTAs:
└── [Take New Assessment] [Profile Settings]
```

**HR Dashboard:**
(See Area 8 for detailed layout)

---

## 🔄 Interaction Patterns

### Loading States

```
Skeleton Loaders:
- Use while data loads
- Maintains layout (no layout shift)
- Animated placeholder
- Duration: Usually < 1 second

Progress Indicators:
- Show long operations (PDF generation, export)
- Linear progress bar with % complete
- Cancel option if applicable
```

### Error Handling

```
Validation Errors:
- Red text below field
- Message: "Email is required"
- Field has red border/background

HTTP Errors:
- Toast notification (appears at top)
- Message: "Failed to save. Please try again."
- Retry option if applicable

No Results:
- Empty state illustration
- Message: "No assessments yet"
- CTA: "Take your first assessment"
```

### Animations

Minimal, purposeful animations:
```
Button hover: Subtle color change (50ms)
Button press: Scale down 2% (100ms)
Modal enter: Fade in + slide up (200ms)
Modal exit: Fade out + slide down (150ms)
Navigation: Fade between pages (100ms)
```

Avoid:
- Slow animations (> 300ms)
- Flashy effects
- Motion that distracts
- Auto-playing animations

---

## ♿ Accessibility

### WCAG 2.1 AA Compliance

**Color Contrast:**
- Text on background: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum
- Test with: WebAIM Contrast Checker

**Keyboard Navigation:**
- All interactive elements focusable
- Focus order makes sense (top to bottom)
- Focus indicator visible (blue outline)
- No keyboard traps (focus can always move)

**Screen Readers:**
- Semantic HTML (use `<button>` not `<div>`)
- Form labels linked to inputs
- ARIA labels for icon buttons
- Lists use `<ul>`, `<ol>`, `<li>`

**Motion:**
- Respect `prefers-reduced-motion`
- Provide text alternative to animated content

**Testing:**
- Use WAVE (web accessibility evaluation tool)
- Test with keyboard only (no mouse)
- Test with screen reader (NVDA or JAWS)
```

### Inclusive Design

```
✓ Large touch targets (44x44px minimum)
✓ Clear button labels (not just icons)
✓ Form validation before submission
✓ Error messages help fix problems
✓ Multiple ways to do actions
✓ Support different browsers
✓ Work on slow internet
✓ Light mode AND dark mode
✓ Dyslexia-friendly font option (future)
✓ High contrast mode support
```

---

## 📱 Responsive Breakpoints

```
Mobile: < 768px
  - Single column layout
  - Full-width inputs
  - Bottom navigation
  - Simplified charts
  - Touch-friendly buttons (48px)

Tablet: 768px - 1024px
  - 2 column layout (when appropriate)
  - Sidebar if space allows
  - Readable text size
  - Optimized charts

Desktop: > 1024px
  - Full design (multi-column)
  - Rich visualizations
  - Advanced features visible
  - Sidebar navigation
```

---

## 🌙 Dark Mode

**Implementation:**
```
Use Tailwind's `dark:` prefix:
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">

Triggered by:
1. System preference (prefers-color-scheme)
2. User toggle (stored in localStorage)
3. Manual override (if user prefers)

Colors auto-adjust:
- Light: White background, black text
- Dark: Dark gray background, light text
- High contrast: For accessibility
```

---

## 📋 Brand Guidelines

### Logo Usage

```
Horizontal lockup (desktop):
  [Logo] Personality Badge

Vertical lockup (mobile):
  [Logo]
  Personality Badge

Clear space: 1/2 height of logo all around
Minimum size: 40px height
Color: Blue (#2563eb) or white on dark

Never:
- Stretch or distort
- Change colors
- Rotate or skew
```

### Voice & Tone

```
- Friendly: "Welcome back!"
- Clear: "Email is required"
- Helpful: "Tip: Choose answers that first come to mind"
- Non-patronizing: No exclamation marks on every sentence
- Professional: Correct spelling & grammar
- Inclusive: Gender-neutral language

Example copy:
✓ "Enter your email to get started"
✗ "ENTER YOUR EMAIL!!!"
✗ "Email (duh)"
```

---

## ❓ Open Questions for Client

1. **Brand Identity:** we can provide this later
   - Logo provided or need design?
   - Specific brand colors?
   - Brand guidelines document?

2. **Dark Mode:**
   - Required for MVP or Phase 2?
   - High contrast mode needed?

3. **Internationalization:**
   - English UI only (MVP)?
   - Multi-language support (Phase 2)?

4. **Animations:**
   - More motion/polish or minimal?
   - Video intros/tutorials?

5. **Custom Design:**
   - Use Shadcn/ui + Tailwind as-is?

6. **Mobile:**
   - First-class mobile experience required?
   -  just responsive web?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Component Library** | Shadcn/ui + Tailwind | Fast development, accessible, customizable |
| **Font** | System font (-apple-system) | Fast loading, native feel |
| **Spacing** | 8px base unit | Consistent, easy to remember |
| **Dark Mode** | Supported via Tailwind | Modern browsers support prefers-color-scheme |
| **Accessibility** | WCAG 2.1 AA | Legal requirement, user inclusion |
| **Animation** | Minimal, purposeful | Focuses user attention, fast |
| **Responsive** | Mobile-first | Most users on mobile |

---

## 📝 Next Steps

1. Answer 6 open questions
2. Review component library
3. Approve design system
4. Move to **Area 12: API Architecture**

