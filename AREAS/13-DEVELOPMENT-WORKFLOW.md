# Area 13: Development Workflow

**Status:** 🔴 In Progress  
**Priority:** HIGH — Team coordination  
**Depends On:** Area 12 🔴

---

## Overview

Development Workflow defines:
- Git branching strategy
- PR/code review process
- Testing requirements
- Deployment process
- Communication norms
- Development environment setup

---

## 🌳 Git Branching Strategy

### Branch Structure (Git Flow)

```
main (production)
    ↑
    ├─ hotfix/bug-name (urgent production fixes)
    │
staging (staging/QA)
    ↑
    ├─ release/v1.x.x (release candidates)
    │
develop (integration)
    ↑
    ├─ feature/feature-name (feature development)
    ├─ fix/bug-name (bug fixes)
    ├─ refactor/area-name (refactoring)
    ├─ docs/doc-name (documentation)
    └─ chore/task-name (maintenance)
```

### Branch Naming Conventions

```
Feature branches:
  feature/user-authentication
  feature/payment-integration
  feature/team-analytics

Bug fixes:
  fix/login-session-timeout
  fix/pdf-generation-memory-leak

Refactoring:
  refactor/assessment-scoring-engine
  refactor/auth-middleware

Documentation:
  docs/api-authentication
  docs/deployment-guide

Hotfixes (from main):
  hotfix/critical-data-loss
  hotfix/payment-webhook-error

Chores:
  chore/update-dependencies
  chore/setup-github-actions
```

### Branch Lifecycle

```
1. Create feature branch from develop
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature

2. Make commits with meaningful messages
   git commit -m "Add user email validation"

3. Push branch
   git push origin feature/my-feature

4. Create Pull Request (GitHub)
   - Title: Clear, descriptive
   - Description: What, why, testing
   - Link related issue

5. Code review (2+ approvals required)
   - Team reviews code
   - Comments, suggestions
   - CI/CD tests must pass

6. Merge to develop (squash commits)
   git rebase develop
   git push origin feature/my-feature
   (Merge via GitHub UI)

7. Delete remote branch
   (GitHub UI button)

8. Pull updated develop
   git checkout develop
   git pull origin develop
```

---

## 📝 Commit Message Format

### Convention: Conventional Commits

```
Format:
<type>(<scope>): <subject>

<body>

<footer>

Example:
feat(auth): add two-factor authentication

- Implement TOTP-based 2FA
- Add QR code generation for authenticator apps
- Add recovery codes for account recovery

Fixes #123
BREAKING CHANGE: /login endpoint now requires 2FA verification

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Code style (formatting, no logic change)
- refactor: Code refactoring (no feature/bug change)
- perf: Performance improvement
- test: Test changes
- chore: Build, dependencies, tooling
- ci: CI/CD configuration

Scopes:
- auth: Authentication
- payment: Payment integration
- assessment: Assessment engine
- reporting: PDF/report generation
- dashboard: Dashboard & analytics
- api: API
- db: Database
- infra: Infrastructure
- docs: Documentation
- etc.
```

### Commit Message Best Practices

```
✓ DO:
- Use imperative mood: "add" not "added"
- Focus on why, not what (code shows what)
- Keep subject under 50 characters
- Reference issue numbers (#123)
- One logical change per commit

✗ DON'T:
- "fixed stuff" (vague)
- "WIP" or "temp" (shouldn't commit)
- Huge commits (hard to review)
- Multiple unrelated changes
```

---

## 🔀 Pull Request Process

### PR Requirements

Every PR must:

1. **Link to Issue**
   ```
   Closes #123
   Related to #456
   ```

2. **Clear Description**
   ```
   ## What
   Add user email verification flow

   ## Why
   Users need to verify email for account security

   ## How
   - Send verification email on signup
   - User clicks link in email
   - Account activated on verification

   ## Testing
   - [ ] Manual: Can sign up with new email
   - [ ] Manual: Verification email received
   - [ ] Manual: Can't log in until verified
   - [ ] Test: Unit tests pass
   - [ ] Test: Integration tests pass
   ```

3. **Pass CI/CD**
   - All GitHub Actions pass
   - No failed tests
   - Code coverage maintained or improved
   - No new security vulnerabilities

4. **Code Review Approval**
   - 2+ code review approvals required
   - Changes requested? Must address and request re-review
   - No reviewer push-back? Ready to merge

5. **No Merge Conflicts**
   - Must be up-to-date with develop
   - Rebase if conflicts exist
   - Resolve locally, test, then push

### Code Review Guidelines

**Reviewer Checklist:**

```
Functionality:
☐ Does this implement the requested feature?
☐ Does this fix the reported bug?
☐ Are edge cases handled?
☐ Is error handling present?

Code Quality:
☐ Code is readable and understandable
☐ No duplicate code
☐ Follows project conventions
☐ No unnecessary complexity
☐ Performance is acceptable

Testing:
☐ Tests are present
☐ Test coverage is adequate
☐ Tests pass locally
☐ Test names are clear

Security:
☐ No SQL injection vulnerabilities
☐ No XSS vulnerabilities
☐ Authentication/authorization correct
☐ No hardcoded secrets or credentials
☐ Input validation present

Documentation:
☐ Code comments where needed (for WHY, not WHAT)
☐ API documentation updated
☐ README updated (if needed)
```

**How to Comment:**

```
✓ Praise (reinforce good patterns)
  "Great use of the custom hook here"
  "Nice error handling"

✓ Ask questions (help reviewer understand)
  "Why did you choose Map over Object here?"
  "Can you walk me through this logic?"

✗ Demand changes (without explanation)
  "This is wrong"
  "Fix this"

✓ Explain why (context matters)
  "This pattern causes race conditions in other places.
   Let's use the custom hook instead."

✓ Offer alternatives
  "Instead of this approach, we could also..."
```

---

## ✅ Testing Strategy

### Test Types & Coverage

```
Unit Tests (60% of tests)
- Individual functions/components
- Mocked dependencies
- Fast execution (< 1s per test)
- Run locally before commit
- Run in CI/CD on every PR

Integration Tests (30% of tests)
- Multiple components together
- Test database integration
- Test API endpoints
- Slower execution (1-10s per test)
- Run in CI/CD before merge

E2E Tests (10% of tests)
- Full user workflows
- Browser-based (Cypress/Playwright)
- Real database
- Slow execution (5-30s per test)
- Run daily or before major releases

Coverage Targets:
- Overall: 80%+ code coverage
- Critical paths: 100%
- Utility functions: 90%+
- UI components: 70%+
```

### Test File Locations

```
Backend (NestJS):
apps/api/src/
├── modules/auth/
│   ├── auth.service.ts
│   └── auth.service.spec.ts ← Unit test
├── tests/
│   └── auth.integration.spec.ts ← Integration test
└── e2e/
    └── auth.e2e.spec.ts ← E2E test

Frontend (Next.js):
apps/web/src/
├── components/Button/
│   ├── Button.tsx
│   └── Button.test.tsx ← Unit test
├── __tests__/
│   └── pages/results.test.tsx ← Integration test
└── e2e/
    └── assessment-flow.spec.cy.ts ← E2E test (Cypress)
```

### Running Tests Locally

```
npm run test ← All unit tests
npm run test:watch ← Watch mode
npm run test:coverage ← Coverage report
npm run test:integration ← Integration tests
npm run e2e ← E2E tests

Before committing:
npm run test -- --coverage
npm run lint
npm run type-check
```

---

## 🚀 Deployment Process

### Deploy to Staging

```
1. Create PR with your feature
2. Get 2+ approvals
3. Merge to develop
4. GitHub Actions:
   - Run all tests
   - Build application
   - Run security scan
   - Deploy to staging automatically
5. QA tests on staging
6. Once verified, ready for main
```

### Deploy to Production

```
1. Create release branch from develop
   git checkout -b release/v1.2.3

2. Update version numbers (package.json, etc.)
   npm version minor

3. Create Release PR (from release/v1.2.3 to main)
   - Document all changes
   - Link all related issues
   - Get final approvals

4. Merge to main (fast-forward merge)
   git merge --ff-only release/v1.2.3

5. GitHub Actions:
   - Run final tests
   - Build production assets
   - Create GitHub Release
   - Deploy to production
   - Health checks verify deployment

6. Merge release branch back to develop
   (to keep versions in sync)

7. Delete release branch
```

### Rollback Procedure

```
If production breaks after deployment:

1. On-call engineer detected issue
2. Immediately revert to previous commit:
   git revert <commit-hash>
   git push origin main
3. DigitalOcean re-deploys old version (< 5 min)
4. Verify stability for 10 minutes
5. Post-incident analysis
6. Document learnings
7. Prevent future issues
```

---

## 📋 Development Environment Setup

### Initial Setup (One-time)

```bash
# Clone repo
git clone https://github.com/org/personality-badge.git
cd personality-badge

# Copy environment variables
cp .env.example .env.local

# Install dependencies
npm install

# Setup git hooks
npm run setup-hooks

# Start development server
docker-compose up -d
npm run dev
```

### Daily Workflow

```bash
# Start of day
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/my-feature

# Make changes
git add .
git commit -m "feat(scope): description"

# Before pushing, test locally
npm run test
npm run lint
npm run type-check

# Push to GitHub
git push origin feature/my-feature

# Create PR and request review
```

### Environment Files

```
.env.local (local development)
  NEXT_PUBLIC_API_URL=http://localhost:3000
  DATABASE_URL=postgresql://...
  NODE_ENV=development

.env.staging (secrets via GitHub)
  DATABASE_URL=[encrypted]
  PAYSTACK_SECRET_KEY=[encrypted]

.env.production (secrets via GitHub)
  DATABASE_URL=[encrypted]
  PAYSTACK_SECRET_KEY=[encrypted]
  NODE_ENV=production
```

---

## 📞 Communication Norms

### Slack Channels

```
#development — General dev chat
  - PR reviews
  - Code questions
  - Help requests
  - Technical discussions

#deployments — Deployment notifications
  - Automated alerts
  - Staging deployments
  - Production deployments
  - Rollbacks

#incidents — Production issues
  - On-call alerts
  - Critical bugs
  - System outages
  - Post-mortems

#random — Off-topic
  - Memes, celebration
  - Non-work chat
```

### Daily Standup

```
Format: Async Slack (or optional sync meeting)

Each team member posts:
1. What I completed yesterday
2. What I'm working on today
3. Any blockers or help needed
4. Confidence level (on track / at risk)

Example:
"
✅ Completed: User authentication PR merged
🔄 Today: Working on payment webhook validation
🚧 Blocker: Need Paystack sandbox keys from @sam
📊 Status: On track
"

Sync Meeting (optional):
- Monday 10am (optional planning)
- Friday 4pm (optional retrospective)
- If async blockers, sync for 15 min ad-hoc
```

### Code Review SLA

```
Standard PR:
- Review within 24 hours
- Feedback within 2 hours if urgent
- Goal: Merge within 48 hours

Urgent/Hotfix:
- Review within 1 hour
- Feedback immediate
- Goal: Merge within 2 hours

If waiting on review:
- Post in #development Slack
- Tag reviewer directly
- Escalate to tech lead if blocked
```

---

## 🔧 Tools & Setup

### Required Tools

```
Git: Version control
  - Config: git config user.name, user.email
  - SSH key: Add to GitHub account

Node.js: v20 or later
  npm: v9 or later

Docker: For local database/redis
  - Install Docker Desktop
  - Run: docker-compose up -d

IDE: VS Code (recommended)
  Extensions:
  - ESLint
  - Prettier
  - TypeScript Vue Plugin
  - Tailwind CSS IntelliSense
  - Thunder Client (API testing)

Database GUI (optional):
  - pgAdmin (PostgreSQL)
  - TablePlus (all databases)
```

### GitHub Setup

```
Repository Configuration:
- Require 2 approvals before merge
- Require status checks pass before merge
- Dismiss stale PR approvals
- Require branches to be up to date
- Require code review from codeowners
- Auto-delete head branches on merge

Branch Protection:
  main: Fully protected
  staging: Require checks pass
  develop: Require 1 approval
  feature/*: No requirements
```

---

## ❓ Open Questions for Client

1. **Team Size:**
   - How many developers?
   - Remote vs in-office?
   - Time zones?

2. **Code Review:**
   - 2 approvals required (strict) or 1 (faster)?
   - Who has review rights?

3. **Testing:**
   - Target 80% coverage sufficient?
   - E2E tests in CI/CD (slows down)?

4. **Deployments:**
   - Who can deploy to production?
   - Manual approval or automatic?
   - Deployment windows (business hours only)?

5. **Incident Response:**
   - On-call rotation size?
   - Page all or escalation?
   - Compensation for on-call?

6. **Standup Cadence:**
   - Async only or daily sync?
   - Time/timezone for sync?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Branching** | Git Flow | Clear workflow, supports hotfixes |
| **Commits** | Conventional Commits | Auto-generated changelogs, clear history |
| **PR Reviews** | 2+ approvals required | Quality, knowledge sharing |
| **Tests** | 80%+ coverage, unit+integration+E2E | Catch regressions, confident deployments |
| **Deployments** | Automatic to staging, manual to prod | Safety, control |
| **Communication** | Async first, sync when blocked | Flexibility, focused meetings |

---

## 📝 Quick Reference

### Common Commands

```bash
# Start development
npm run dev

# Run tests
npm run test:watch

# Run linter
npm run lint

# Format code
npm run format

# Type check
npm run type-check

# Build for production
npm run build

# Deploy to staging
git push origin feature-branch  → Auto deploys

# Deploy to production
git push origin main  → Auto deploys (after manual approval)
```

### Git Aliases (Optional)

```bash
git config --global alias.co checkout
git config --global alias.st status
git config --global alias.br branch
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.visual 'log --graph --oneline --all'
```

---

## 📝 Next Steps

1. Answer 6 open questions
2. Approve development workflow
3. Setup GitHub repository + branch protection
4. Create team onboarding guide
5. **All 13 areas complete!** ✅

---

## 🎉 All 13 Planning Areas Complete!

This is the final area. Once this is approved, you have:

✅ **Product Scope** — What to build  
✅ **User Flows** — How users interact  
✅ **Assessment Engine** — How tests work  
✅ **Database** — How data is stored  
✅ **Authentication** — How security works  
✅ **Payment** — How revenue is generated  
✅ **Reporting** — How results are delivered  
✅ **Dashboards** — How analytics are shown  
✅ **Infrastructure** — How it's deployed  
✅ **Security** — How data is protected  
✅ **UI/UX** — How it looks & feels  
✅ **API** — How systems communicate  
✅ **Development** — How teams collaborate  

**Ready to start coding Week 2!** 🚀

