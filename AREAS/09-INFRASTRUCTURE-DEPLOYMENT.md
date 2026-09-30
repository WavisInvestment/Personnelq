# Area 9: Infrastructure & Deployment

**Status:** 🔴 In Progress  
**Priority:** HIGH — Foundation for coding & production  
**Depends On:** Area 4 🔴, Area 5 🔴

---

## Overview

Infrastructure & Deployment defines:
- How code gets built & tested
- How application runs in production
- How to scale & monitor
- How to handle failures
- Development environments

---

## 🏗️ Architecture Overview

### Technology Stack (Recommended)

**Frontend:**
- Next.js 14+ (React SSR)
- TypeScript
- Tailwind CSS
- Shadcn/ui components
- React Query (data fetching)
- Zustand (state management)

**Backend:**
- NestJS (Node.js framework)
- Express.js (HTTP server)
- TypeScript
- Prisma ORM
- PostgreSQL (database)
- Redis (caching, queues)
- BullMQ (background jobs)

**Third-Party:**
- Paystack (payments)
- Resend (email)
- Cloudinary or AWS S3 (file storage)
- Puppeteer (PDF generation)

**Infrastructure:**
- Docker (containerization)
- DigitalOcean App Platform (hosting)
- GitHub Actions (CI/CD)
- PostgreSQL Managed Database
- Redis Managed Cache

---

## 📦 Containerization (Docker)

### Docker Images Needed

**1. Backend API Service**

```dockerfile
# Dockerfile (backend)
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["npm", "run", "start:prod"]
```

**Environment Variables:**
```
DATABASE_URL=postgresql://user:pass@db-host:5432/personality_db
REDIS_URL=redis://cache-host:6379
PAYSTACK_SECRET_KEY=sk_live_xxx
JWT_SECRET=your-secret-key-here
NODE_ENV=production
LOG_LEVEL=info
```

**2. Frontend Application**

```dockerfile
# Dockerfile (frontend)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

EXPOSE 3000

CMD ["npm", "run", "start"]
```

**3. Worker Service (Background Jobs)**

```dockerfile
# Dockerfile (worker)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["npm", "run", "worker:start"]
```

### Docker Compose (Local Development)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: personality
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: personality_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./apps/api
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://personality:dev_password@postgres:5432/personality_db
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    ports:
      - "3000:3000"
    volumes:
      - ./apps/api:/app
      - /app/node_modules

  frontend:
    build: ./apps/web
    depends_on:
      - backend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
      NODE_ENV: development
    ports:
      - "3001:3000"
    volumes:
      - ./apps/web:/app
      - /app/node_modules

  worker:
    build: ./apps/worker
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://personality:dev_password@postgres:5432/personality_db
      REDIS_URL: redis://redis:6379
      NODE_ENV: development

volumes:
  postgres_data:
```

---

## 🔄 CI/CD Pipeline (GitHub Actions)

### Branch Strategy

```
main (production)
  ↑
staging (staging environment)
  ↑
develop (development branch)
  ↑
feature/* (feature branches)
```

### GitHub Actions Workflow

**File: `.github/workflows/ci-cd.yml`**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [develop, staging, main]
  pull_request:
    branches: [develop, staging, main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint code
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Run tests
        run: npm run test:ci
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
      
      - name: Build frontend
        run: npm run build --workspace=web
      
      - name: Build backend
        run: npm run build --workspace=api

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging' && github.event_name == 'push'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to DigitalOcean (staging)
        uses: digitalocean/app_action@main
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
          app_spec: app-staging.yaml

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to DigitalOcean (production)
        uses: digitalocean/app_action@main
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
          app_spec: app-production.yaml
      
      - name: Notify deployment
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"Production deployment complete"}'
```

---

## 🚀 Hosting Strategy (DigitalOcean)

### Recommended Architecture

```
┌─────────────────────────────────────┐
│ CloudFlare (CDN + DDoS Protection)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ DigitalOcean Load Balancer          │
├─────────────────────────────────────┤
│ (Distribute traffic to app servers) │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼─────────┐
     │         │         │
  ┌──▼──┐  ┌──▼──┐  ┌──▼──┐
  │ App │  │ App │  │ App │
  │  1  │  │  2  │  │  3  │
  └─────┘  └─────┘  └─────┘
     │         │         │
  ┌──▼─────────▼─────────▼──┐
  │ PostgreSQL Managed DB    │
  │ (Automatic backups)      │
  └──────────────────────────┘

  ┌──────────────────────────┐
  │ Redis Managed Cache      │
  └──────────────────────────┘

  ┌──────────────────────────┐
  │ Cloudinary File Storage  │
  └──────────────────────────┘
```

### DigitalOcean App Platform

**Benefits:**
- Automatic SSL/TLS
- Auto-scaling
- Built-in CI/CD
- Managed databases
- Environment variable management
- Health checks & auto-restart

**App Spec (app-production.yaml):**

```yaml
name: personality-badge
services:
  - name: api
    github:
      repo: your-org/personality-badge
      branch: main
    source_dir: apps/api
    build_command: npm run build
    run_command: npm run start:prod
    http_port: 3000
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${db.connection_string}
      - key: REDIS_URL
        scope: RUN_TIME
        value: ${redis.connection_string}
    health_check:
      http_path: /health

  - name: web
    github:
      repo: your-org/personality-badge
      branch: main
    source_dir: apps/web
    build_command: npm run build
    run_command: npm run start
    http_port: 3000
    envs:
      - key: NEXT_PUBLIC_API_URL
        value: https://api.personality-badge.com

  - name: worker
    github:
      repo: your-org/personality-badge
      branch: main
    source_dir: apps/worker
    build_command: npm run build
    run_command: npm run worker:start

databases:
  - name: db
    engine: PG
    version: "15"
    production: true

caches:
  - name: redis
    engine: REDIS
    version: "7"

static_sites:
  - name: docs
    source_dir: docs
    build_command: npm run build

domains:
  - domain: personality-badge.com
    type: PRIMARY

---

## 🌍 Multi-Environment Strategy

### Three Environments

**Development (dev.personality-badge.com)**
- Deploy: Automatic on every push to develop
- Database: Separate dev database
- Cache: Shared (flushed daily)
- Secrets: Dev keys (not production secrets)
- Uptime: No SLA
- Resets: Allowed (reset DB for testing)

**Staging (staging.personality-badge.com)**
- Deploy: Automatic on push to staging
- Database: Copy of production data (weekly)
- Cache: Separate from production
- Secrets: Production-like keys
- Uptime: 95% SLA
- Resets: Not allowed (for final testing)

**Production (personality-badge.com)**
- Deploy: Manual, requires approval
- Database: Production data (backups every 6 hours)
- Cache: Production cache (monitored)
- Secrets: Live payment keys (Paystack live)
- Uptime: 99.9% SLA
- Resets: Never allowed

### Environment Variables

**Development (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/personality_dev
REDIS_URL=redis://localhost:6379
PAYSTACK_SECRET_KEY=sk_test_xxx
NODE_ENV=development
DEBUG=*
```

**Production (.env.production - via GitHub Secrets):**
```
NEXT_PUBLIC_API_URL=https://api.personality-badge.com
DATABASE_URL=[ENCRYPTED]
REDIS_URL=[ENCRYPTED]
PAYSTACK_SECRET_KEY=[ENCRYPTED]
NODE_ENV=production
LOG_LEVEL=warn
```

---

## 🔄 Deployment Process

### Manual Production Deployment

```
1. Code review & approval (2+ reviewers)
   ↓
2. Merge to main branch
   ↓
3. GitHub Actions runs all tests
   ↓
4. If tests pass:
   - Build Docker images
   - Push to registry
   - Run smoke tests on staging
   ↓
5. Manual approval in DigitalOcean dashboard
   ↓
6. DigitalOcean deploys to production
   ↓
7. Health checks verify deployment
   ↓
8. Send Slack notification (success/failure)
   ↓
9. On-call engineer monitors for issues
```

### Rollback Procedure

If production breaks after deployment:

```
1. On-call engineer detected issue
   ↓
2. Immediately revert to previous build in DigitalOcean
   ↓
3. Monitor 10 minutes to verify stability
   ↓
4. If stable: Post-mortem analysis
5. If not: Previous version kept active
   ↓
6. Document incident & remediation
```

**Rollback time target:** < 5 minutes

---

## 📊 Monitoring & Logging

### Uptime Monitoring (UptimeRobot)

```
Monitor endpoints:
- https://personality-badge.com/health
- https://api.personality-badge.com/health
- Database connection health
- Redis connection health

Alert on:
- Service down (page all engineers)
- Slow response (> 2 seconds avg)
- High error rate (> 1% of requests)
```

### Application Logging (Datadog or ELK Stack)

```
Log levels:
- ERROR: Immediate attention needed
- WARN: Notable but not breaking
- INFO: Informational (success, actions)
- DEBUG: Detailed info (only in dev)

Log aggregation:
- All logs → Central logging service
- Search across all services
- Alerts on ERROR patterns
- Performance analysis
```

### Performance Monitoring (Datadog APM)

```
Track:
- Request latency (p50, p95, p99)
- Database query performance
- Third-party API latency (Paystack, email)
- Memory usage & leaks
- CPU usage

Alerts on:
- Latency > 500ms
- Error rate > 1%
- Memory > 80%
- Database connection pool exhaustion
```

---

## 💾 Backup & Disaster Recovery

### Database Backups (PostgreSQL)

```
Backup Schedule:
- Hourly: Point-in-time recovery (24 hours)
- Daily: Full backup (30 days retention)
- Weekly: Full backup (90 days retention)

Backup Location: Separate region (geo-redundant)

Recovery Time Objective (RTO): 1 hour
Recovery Point Objective (RPO): 5 minutes
```

### Disaster Recovery Plan

```
Scenario: Production database corruption
1. Detect issue (automated alerts)
2. Failover to read replica (2 min)
3. Restore from backup if needed (15 min)
4. Verify data integrity (5 min)
5. Resume normal operations

Scenario: Data center outage
1. DigitalOcean automatically fails over
2. Services restart in backup region (< 5 min)
3. DNS updated automatically (CloudFlare)
4. No manual intervention needed
```

---

## 🔐 Security Infrastructure

### HTTPS/TLS

```
Certificate: Let's Encrypt (auto-renewed)
Protocol: TLS 1.2+
Ciphers: Strong only (no legacy)
HSTS: Enabled (6 months)
```

### DDoS Protection

```
CloudFlare WAF:
- IP reputation blocking
- Brute force protection
- SQL injection detection
- XSS protection
- Rate limiting (per IP)

DigitalOcean DDoS Protection:
- Automatic traffic scrubbing
- BGP Anycast detection
- Alerts on DDoS activity
```

### Secrets Management

```
GitHub Secrets:
- Database credentials
- Payment API keys
- JWT signing keys
- Email service keys
- Storage API keys

Access:
- Only exposed during CI/CD
- Never logged
- Rotated regularly
- Audit log of access
```

---

## 📈 Scaling Strategy

### Horizontal Scaling (Add More Servers)

```
Auto-scaling triggers:
- CPU > 70% for 2 minutes → Add 1 server
- CPU < 30% for 10 minutes → Remove 1 server
- Memory > 80% → Alert (investigate memory leak)

Min servers: 2 (production)
Max servers: 10 (configurable)
Startup time: 2-3 minutes per server
```

### Vertical Scaling (Bigger Servers)

```
If consistently maxed out:
- Upgrade from 2GB to 4GB RAM
- Upgrade from 2 CPU to 4 CPU

Triggers:
- Sustained CPU > 80%
- Memory usage > 85%
- Database connection pool exhausted
```

### Database Scaling

```
Read-only replicas:
- 1 primary (write)
- 2-3 read replicas (read-only)
- Auto load-balancing

If primary overwhelmed:
- Upgrade to larger instance
- Shard by organization_id (Phase 2)
```

---

## ❓ Open Questions for Client

1. **Hosting Preference:**
   - DigitalOcean (recommended)?
   - AWS or Google Cloud?
   - Self-hosted on your infrastructure?

2. **CDN Strategy:**
   - CloudFlare (recommended)?
   - CloudFront or Cloudinary?
   - Just for static assets or full CDN?

3. **Monitoring:**
   - Use Datadog (paid)?
   - Use open-source (Prometheus + Grafana)?
   - Minimal monitoring?

4. **Email Service:**
   - Resend (recommended)?
   - AWS SES?
   - SendGrid?

5. **File Storage:**
   - Cloudinary (recommended)?
   - AWS S3?
   - DigitalOcean Spaces?

6. **On-Call Rotation:**
   - How many engineers on rotation?
   - Page all on error or escalation?
   - On-call pay/comp?

---

## ✅ Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Container** | Docker | Industry standard, reproducible |
| **Orchestration** | DigitalOcean App Platform | Managed, simpler than K8s |
| **CI/CD** | GitHub Actions | Native to GitHub, free tier |
| **Hosting** | DigitalOcean | Cost-effective, easy setup |
| **Database** | PostgreSQL Managed | No ops burden, automatic backups |
| **Cache** | Redis Managed | Performance, session management |
| **Backups** | Automated, geo-redundant | Disaster recovery |
| **Monitoring** | Datadog APM (or ELK) | Full visibility into system |

---

## 📝 Next Steps

1. Answer 6 open questions
2. Approve infrastructure strategy
3. Setup DigitalOcean account & project
4. Move to **Area 10: Security & Compliance**

