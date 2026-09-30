# Week 2: Infrastructure & Project Setup

**Week:** 2 of 8 (Oct 1-5, 2026)  
**Duration:** 5 days  
**Team:** DevOps, Tech Lead, Frontend, Backend  
**Deliverables:** GitHub repo, DigitalOcean account, monorepo structure, development environment  

---

## 📅 Day-by-Day Breakdown

### Day 1-2 (Monday-Tuesday): Infrastructure

#### **GitHub Repository Setup** (1 hour)

**Who:** DevOps Lead  
**Checklist:**

- [ ] Create GitHub organization: `personality-badge`
- [ ] Create main repository: `platform`
- [ ] Initialize with Node.js `.gitignore`
- [ ] Add MIT License
- [ ] Create initial README.md

**Branch Protection (main):**

```bash
# GitHub CLI command to setup protection
gh repo edit personality-badge/platform \
  --enable-auto-merge \
  --delete-branch-on-merge
```

**Branch Strategy:**

```
main (production)
  ↑ (PR required, 2+ approvals)
├── staging (pre-production testing)
│   ↑ (PR required, 1+ approval)
└── develop (integration branch)
    ↑ (direct commits OK, but PRs encouraged)
    ├── feat/auth-system
    ├── feat/assessment-engine
    ├── feat/payment-integration
    └── ...
```

**Required Protection Rules:**

```yaml
main branch:
  - Require 2 pull request reviews ✓
  - Require status checks to pass ✓
  - Require branches to be up to date before merging ✓
  - Dismiss stale pull request approvals ✓
  - Include administrators ✓

staging branch:
  - Require 1 pull request review ✓
  - Require status checks to pass ✓
```

---

#### **DigitalOcean Setup** (2 hours)

**Who:** DevOps Lead  
**Prerequisites:** DigitalOcean account (business or personal)

**Step 1: Create Project**

1. Login to DigitalOcean
2. Click "New Project"
3. Name: `Personality Badge Platform`
4. Description: `MVP 1 - 8 week development`
5. Create project

**Step 2: Managed PostgreSQL Database**

```
Environment: Development (cheapest tier to start)
Plan: $50/month (can upgrade later)
Region: New York (or closest to users)
Backups: Daily, 30-day retention

Configuration:
- PostgreSQL 15
- 1 vCPU, 1 GB RAM, 25 GB storage
- User: postgres
- Database: personality_badge_dev

Security:
- VPC network isolation
- Private networking enabled
- Firewall rules: GitHub Actions IP only
```

**Step 3: Managed Redis Cache**

```
Environment: Development
Plan: $15/month
Region: Same as PostgreSQL

Configuration:
- Redis 7
- 1 GB RAM
- No password (set one in production)
```

**Step 4: Container Registry (Docker Image Storage)**

```
Region: New York
Authentication: GitHub Actions integration
```

**Step 5: DigitalOcean CLI Setup**

```bash
# Install doctl
choco install doctl  # Windows

# Authenticate
doctl auth init

# Verify
doctl account get
```

---

### Day 2-3 (Tuesday-Wednesday): CI/CD Pipeline

#### **GitHub Actions Setup** (1.5 hours)

**Who:** DevOps Lead + Tech Lead

**Create `.github/workflows/ci.yml`:**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, staging, develop]
  pull_request:
    branches: [main, staging, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint
      
      - name: Run Prettier
        run: npm run format:check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test:ci
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/staging' || github.ref == 'refs/heads/main'
    
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
      
      - name: Build and push Docker images
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/staging'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to DigitalOcean
        run: |
          echo "Deploy to ${{ github.ref }} environment"
          # Add deployment commands here
```

---

### Day 3-4 (Wednesday-Thursday): Project Structure

#### **Initialize Monorepo** (2 hours)

**Who:** Tech Lead

**Step 1: Create Root Directory Structure**

```bash
cd c:\Users\Authentic Sam\codebase\personalty-test

# Remove old planning files (into archive)
mkdir archive
move *.md archive/

# Create monorepo
mkdir apps packages .github
mkdir apps/web apps/api
mkdir packages/types packages/ui packages/config
mkdir .github/workflows
```

**Step 2: Root `package.json`**

```json
{
  "name": "personality-badge-platform",
  "version": "0.1.0",
  "private": true,
  "description": "Personality assessment SaaS platform",
  "scripts": {
    "install:all": "npm install && npm install --prefix apps/web && npm install --prefix apps/api",
    "dev": "npm run dev --prefix apps/web & npm run dev --prefix apps/api",
    "build": "npm run build --prefix apps/web && npm run build --prefix apps/api",
    "test": "npm run test --prefix apps/web && npm run test --prefix apps/api",
    "test:ci": "npm run test:ci --prefix apps/web && npm run test:ci --prefix apps/api",
    "lint": "npm run lint --prefix apps/web && npm run lint --prefix apps/api",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "workspaces": [
    "apps/web",
    "apps/api",
    "packages/*"
  ],
  "devDependencies": {
    "prettier": "^3.0.0",
    "eslint": "^8.50.0"
  }
}
```

**Step 3: Create Root `.env.example`**

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/personality_badge_dev
DATABASE_URL_TEST=postgresql://postgres:password@localhost:5432/personality_badge_test

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-256-bit-secret-key-here-minimum-32-chars
JWT_REFRESH_SECRET=your-256-bit-secret-key-here-minimum-32-chars
JWT_EXPIRY=900  # 15 minutes in seconds
JWT_REFRESH_EXPIRY=604800  # 7 days in seconds

# Paystack
PAYSTACK_SECRET_KEY=sk_live_xxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxx

# Claude API
CLAUDE_API_KEY=sk-ant-xxxxx

# Email
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=noreply@personality-badge.com

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api

# Environment
NODE_ENV=development
APP_ENV=development
APP_URL=http://localhost:3000
```

**Step 4: Docker Compose (Local Development)**

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    container_name: personality_badge_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: personality_badge_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: personality_badge_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: personality_badge_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

**Step 5: Git Configuration**

```bash
cd personality-badge/platform

# Initialize git (if not already done)
git init

# Add remote
git remote add origin https://github.com/personality-badge/platform.git

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Environment
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
.next/
.nuxt/
out/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*

# Misc
.cache/
*.tmp
EOF

# Create initial commit
git add .
git commit -m "Initial monorepo structure"
git branch -M main
git push -u origin main
```

---

### Day 4-5 (Thursday-Friday): Frontend & Backend Bootstrap

#### **Frontend (Next.js) Setup** (1.5 hours)

**Who:** Frontend Lead

```bash
cd apps/web

# Create Next.js project
npx create-next-app@latest . --typescript --tailwind --eslint

# Install additional dependencies
npm install \
  react-hook-form \
  zod \
  @hookform/resolvers \
  @tanstack/react-query \
  zustand \
  axios \
  date-fns \
  recharts \
  @shadcn/ui
```

**Frontend package.json structure:**

```json
{
  "name": "@personality-badge/web",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

**Create `apps/web/src/` structure:**

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── auth/
│   │   ├── login/
│   │   ├── signup/
│   │   └── forgot-password/
│   ├── assessments/
│   │   ├── snapshot/
│   │   └── full/
│   ├── dashboard/
│   └── results/
├── components/
│   ├── auth/
│   ├── assessments/
│   ├── common/
│   └── layouts/
├── hooks/
│   ├── useAuth.ts
│   └── useAssessment.ts
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── validators.ts
├── services/
│   ├── authService.ts
│   └── assessmentService.ts
├── styles/
│   └── globals.css
└── types/
    └── index.ts
```

---

#### **Backend (NestJS) Setup** (1.5 hours)

**Who:** Backend Lead

```bash
cd apps/api

# Create NestJS project
npm i -g @nestjs/cli
nest new . --package-manager npm --skip-install

# Install dependencies
npm install \
  @nestjs/jwt \
  @nestjs/passport \
  passport-jwt \
  @prisma/client \
  prisma \
  zod \
  class-validator \
  @nestjs/throttler \
  bull \
  redis \
  puppeteer \
  resend \
  axios \
  @nestjs/config \
  dotenv
```

**Backend package.json structure:**

```json
{
  "name": "@personality-badge/api",
  "version": "0.1.0",
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "node dist/prisma/seed.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage"
  }
}
```

**Create `apps/api/src/` structure:**

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/
│   │   ├── jwt.guard.ts
│   │   └── rbac.guard.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── pipes/
│   │   └── validation.pipe.ts
│   ├── decorators/
│   │   ├── auth.decorator.ts
│   │   └── org.decorator.ts
│   └── middleware/
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   └── dto/
│   ├── users/
│   ├── organizations/
│   ├── assessments/
│   ├── submissions/
│   ├── results/
│   ├── payments/
│   └── ...
├── database/
│   ├── prisma.service.ts
│   └── schema.prisma
└── config/
    ├── config.module.ts
    └── env.validation.ts
```

---

### Day 5 (Friday): Local Development Setup

#### **Docker Compose & Local Testing** (1 hour)

**Who:** All team members

```bash
# In project root
docker-compose up -d

# Verify services
docker-compose ps

# Should show:
# - personality_badge_postgres (healthy)
# - personality_badge_redis (healthy)
# - personality_badge_pgadmin (running)
```

**Team Verification Steps:**

Each team member:

```bash
# 1. Clone repo
git clone https://github.com/personality-badge/platform.git
cd platform

# 2. Setup environment
cp .env.example .env.local

# 3. Install all dependencies
npm run install:all

# 4. Start Docker services
docker-compose up -d

# 5. Run migrations (backend)
cd apps/api
npx prisma migrate dev --name init

# 6. Start dev servers
# Terminal 1: Frontend
cd apps/web && npm run dev

# Terminal 2: Backend
cd apps/api && npm run dev

# 7. Verify in browser
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001/api/health
```

---

## ✅ Week 2 Deliverables

**By Friday EOD:**

- [x] GitHub repository created + protected
- [x] DigitalOcean account setup (PostgreSQL + Redis)
- [x] CI/CD pipeline configured (GitHub Actions)
- [x] Monorepo structure initialized
- [x] Next.js frontend bootstrapped
- [x] NestJS backend bootstrapped
- [x] Docker Compose for local development
- [x] All team members can run local dev environment
- [x] Git workflow established

---

## 🚨 Blockers & Solutions

### GitHub Actions Secret Setup

**Required secrets in GitHub:**

```
DATABASE_URL=postgresql://...@droplet.com/db
REDIS_URL=redis://...@droplet.com:6379
JWT_SECRET=(generate 32+ byte random string)
PAYSTACK_SECRET_KEY=sk_live_xxx
CLAUDE_API_KEY=sk-ant-xxx
```

**How to add:**

1. GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret above

### Git Workflow Training

**Required for all developers:**

```bash
# Feature branch naming
git checkout -b feat/auth-system
git checkout -b fix/payment-issue
git checkout -b refactor/assessment-logic

# Commit format
git commit -m "feat: add JWT authentication"
git commit -m "fix: resolve CORS validation error"

# Pull request
# Always create PR, never push to main/staging directly
```

---

## 📝 Notes for Next Week (Week 3)

**Next week starts:**
- Database schema implementation (Prisma migrations)
- Authentication module setup
- User signup/login flows

**Prepare during Week 2:**
- Finalize database schema (Area 4 - DATABASE-ARCHITECTURE.md)
- Review Prisma documentation
- Prepare auth flow diagrams

---

## 📚 Reference Documentation

See these files for detailed information:
- `IMPLEMENTATION-KICKOFF.md` — Overview of all 8 weeks
- `AREAS/04-DATABASE-ARCHITECTURE.md` — Database schema
- `AREAS/05-AUTH-AUTHORIZATION.md` — Auth strategy
- `AREAS/12-API-ARCHITECTURE.md` — API design
- `AREAS/09-INFRASTRUCTURE-DEPLOYMENT.md` — Infrastructure details

