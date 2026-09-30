# 🚀 Local Development Setup

**Quick Start Guide** — Get the Personality Badge Platform running locally in 10 minutes.

---

## Prerequisites

- ✅ Docker & Docker Compose installed
- ✅ Node.js 20+ and npm installed
- ✅ Git configured

---

## Step 1: Start Docker Services (Database & Cache)

```bash
cd ~/codebase/personalty-test

# Start PostgreSQL, Redis, and pgAdmin
docker-compose up -d

# Verify all services are healthy
docker-compose ps
```

**Expected output:**
```
NAME                      STATUS
personality_badge_postgres   healthy ✓
personality_badge_redis      healthy ✓
personality_badge_pgadmin     up ✓
```

**Access pgAdmin:**
- URL: http://localhost:5050
- Email: admin@example.com
- Password: admin

---

## Step 2: Install Dependencies

```bash
# Install all dependencies (root, frontend, backend)
npm run install:all
```

This runs:
- `npm install` (root)
- `npm install` (apps/web)
- `npm install` (apps/api)

Takes ~3-5 minutes depending on internet speed.

---

## Step 3: Setup Database

```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Create database & run migrations
npx prisma migrate dev --name init

# Optional: Seed with test data
# npx prisma db seed
```

**What this does:**
1. Creates `personality_badge_dev` database in PostgreSQL
2. Creates all 20 tables from schema
3. Generates TypeScript types for database queries

---

## Step 4: Start Development Servers

### Option A: Run Both (Recommended)

```bash
# From project root
npm run dev
```

Opens 2 processes in parallel:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001/api

Press `Ctrl+C` to stop both.

### Option B: Run Separately

**Terminal 1 - Frontend:**
```bash
cd apps/web
npm run dev
# http://localhost:3000
```

**Terminal 2 - Backend:**
```bash
cd apps/api
npm run dev
# http://localhost:3001/api
```

---

## Step 5: Test the Setup

### Frontend
Open http://localhost:3000 in browser.

**Expected:** Landing page with "Get Started" button

### Backend
Open http://localhost:3001/api in browser.

**Expected:**
```json
{
  "app": "Personality Badge API",
  "version": "0.1.0",
  "status": "running",
  "endpoints": { ... }
}
```

Check health endpoint:
```bash
curl http://localhost:3001/api/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2026-09-30T21:35:00.000Z"
}
```

---

## Step 6: Test Authentication

### Test Signup

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "password": "SecurePass123!",
    "password_confirm": "SecurePass123!"
  }'
```

**Expected response:**
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "abc123...",
  "user": {
    "id": "clvp0...",
    "email": "test@example.com",
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

### Test Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### Test Protected Route

```bash
# Use the access_token from above
curl -X POST http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <your-access-token>"
```

---

## Common Issues & Solutions

### Issue: `PostgreSQL connection refused`

**Solution:** Ensure Docker is running
```bash
docker-compose ps
docker-compose up -d  # If not running
```

### Issue: `Port 3000 or 3001 already in use`

**Solution:** Kill the process on that port
```bash
# Find process on port 3000
lsof -i :3000
kill -9 <PID>

# Or use different ports
npm run dev -- --port 3002  # Frontend
PORT=3002 npm run dev  # Backend
```

### Issue: `npm install fails`

**Solution:** Clear cache and try again
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Issue: `Prisma migration fails`

**Solution:** Reset database (development only!)
```bash
cd apps/api
npx prisma migrate reset  # Caution: deletes all data
npx prisma migrate dev --name init
```

### Issue: `Module not found errors`

**Solution:** Regenerate Prisma client
```bash
cd apps/api
npx prisma generate
npm install
npm run dev
```

---

## Database Management

### View Database in pgAdmin

1. Open http://localhost:5050
2. Click "Add New Server"
3. Name: `Personality Badge Dev`
4. Tab: Connection
   - Host: `postgres`
   - Port: `5432`
   - User: `postgres`
   - Password: `postgres`
   - Database: `personality_badge_dev`
5. Save and explore tables

### View Database in Prisma Studio

```bash
cd apps/api
npx prisma studio
```

Opens http://localhost:5555 with visual database browser.

### Reset Database (Dev Only)

```bash
cd apps/api
npx prisma migrate reset
# Confirms, then deletes all data and recreates schema
```

---

## Testing

### Backend Unit Tests

```bash
cd apps/api

# Run all tests
npm run test

# Watch mode (re-run on changes)
npm run test:watch

# With coverage
npm run test:cov
```

### Frontend Tests (Ready in Week 7)

```bash
cd apps/web
npm run test
```

---

## Development Workflow

### Making Changes

1. **Backend:** Edit `apps/api/src/**/*.ts`
2. **Frontend:** Edit `apps/web/src/**/*.tsx`
3. Both auto-reload on save

### Database Schema Changes

```bash
cd apps/api

# Edit prisma/schema.prisma
# Then run:
npx prisma migrate dev --name describe_change
```

### Checking Code Quality

```bash
# Lint both projects
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

---

## Environment Variables

### Frontend (.env.local in project root)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Backend (.env.local in project root)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/personality_badge_dev
JWT_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

---

## Git Workflow

### Create Feature Branch

```bash
git checkout -b feat/my-feature
```

### Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

### Push to Remote (When Ready)

```bash
git push origin feat/my-feature
```

---

## Helpful Commands

```bash
# From project root

# Install all dependencies
npm run install:all

# Run both dev servers
npm run dev

# Build both projects
npm run build

# Lint all code
npm run lint

# Format all code
npm run format

# Run all tests
npm run test

# From apps/api

# Database commands
npx prisma generate      # Generate TypeScript types
npx prisma migrate dev   # Create migration
npx prisma migrate reset # Reset database
npx prisma studio       # Visual database browser

# Testing
npm run test             # Run tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report
```

---

## Next Steps

1. ✅ Run `docker-compose up -d`
2. ✅ Run `npm run install:all`
3. ✅ Run `npx prisma migrate dev --name init` (in apps/api)
4. ✅ Run `npm run dev`
5. ✅ Open http://localhost:3000 and http://localhost:3001/api
6. ✅ Test signup/login endpoints

Then:
- Read [`DEVELOPER-GUIDE.md`](DEVELOPER-GUIDE.md) for coding standards
- Check [`WEEK-3-STATUS.md`](WEEK-3-STATUS.md) for what's implemented
- Reference [`DATABASE-SCHEMA.md`](DATABASE-SCHEMA.md) for data models

---

## Success Indicators

✅ Docker services running and healthy  
✅ Both `node_modules` installed  
✅ Database created with all 20 tables  
✅ Frontend loads on http://localhost:3000  
✅ Backend responds on http://localhost:3001/api  
✅ Signup endpoint works  
✅ Login endpoint works  
✅ Tests pass  

---

## Troubleshooting: Full Reset

If everything breaks, start fresh:

```bash
# Stop and remove Docker containers
docker-compose down
docker volume rm personality_badge_postgres_data

# Remove node_modules
rm -rf node_modules apps/web/node_modules apps/api/node_modules

# Start over
docker-compose up -d
npm run install:all
cd apps/api && npx prisma migrate dev --name init
npm run dev
```

---

## Need Help?

1. Check [`DEVELOPER-GUIDE.md`](DEVELOPER-GUIDE.md) for coding guidelines
2. Check [`WEEK-3-STATUS.md`](WEEK-3-STATUS.md) for what's implemented
3. Check logs: `docker-compose logs postgres` or `docker-compose logs redis`
4. Check Prisma Studio: `npx prisma studio`
5. Check pgAdmin: http://localhost:5050

---

**Happy coding!** 🚀

