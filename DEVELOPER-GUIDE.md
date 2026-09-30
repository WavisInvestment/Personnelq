# 👨‍💻 Developer Guide - Quick Reference

**For:** All developers on the Personality Badge Platform  
**Audience:** Engineers building features (frontend, backend, DevOps)  
**Related Docs:** `IMPLEMENTATION-KICKOFF.md`, `WEEK-2-SETUP-GUIDE.md`, `DATABASE-SCHEMA.md`

---

## 🚀 Quick Start (First Time Setup)

### 1. Clone Repository

```bash
git clone https://github.com/personality-badge/platform.git
cd platform
```

### 2. Install Dependencies

```bash
npm run install:all
```

### 3. Setup Environment

```bash
# Copy template
cp .env.example .env.local

# Update with your local values
# (PostgreSQL, Redis, API keys)
```

### 4. Start Docker Services

```bash
docker-compose up -d

# Wait for services to be healthy
docker-compose ps

# Should show all services as healthy ✓
```

### 5. Setup Database

**Backend only:**

```bash
cd apps/api

# Create/update schema
npx prisma migrate dev

# Seed initial data
npx prisma db seed
```

### 6. Start Dev Servers

**Terminal 1: Frontend**
```bash
cd apps/web
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2: Backend**
```bash
cd apps/api
npm run dev
# Runs on http://localhost:3001
```

### 7. Verify Everything Works

**Frontend:**
- Open http://localhost:3000
- Should see landing page (no errors)

**Backend:**
- Visit http://localhost:3001/api/health
- Should return `{ "status": "ok" }`

---

## 📁 Project Structure Cheat Sheet

```
personality-badge/
│
├── apps/
│   ├── web/                 ← Next.js Frontend
│   │   ├── src/app/        (Page routes)
│   │   ├── src/components/ (React components)
│   │   ├── src/hooks/      (Custom hooks)
│   │   └── src/services/   (API calls)
│   │
│   └── api/                 ← NestJS Backend
│       ├── src/modules/    (Feature modules)
│       ├── src/common/     (Guards, filters, etc)
│       ├── prisma/         (Database schema)
│       └── test/           (Unit tests)
│
├── packages/
│   ├── types/              (Shared TypeScript types)
│   ├── ui/                 (Shared UI components)
│   └── config/             (Shared config)
│
├── docker-compose.yml      (Local dev environment)
├── .env.example            (Environment template)
└── README.md               (Project overview)
```

---

## 🔧 Common Developer Tasks

### Running Tests

```bash
# All tests
npm run test

# Watch mode (auto-rerun on change)
npm run test:watch

# With coverage
npm run test:cov

# Specific test file
npm run test -- auth.service.spec.ts
```

### Code Quality

```bash
# Lint check
npm run lint

# Format code
npm run format

# Check formatting (don't change)
npm run format:check
```

### Database Operations

**Backend directory only:**

```bash
# Create migration
npx prisma migrate dev --name add_new_table

# Apply pending migrations
npx prisma migrate deploy

# Seed database
npx prisma db seed

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View database GUI
npx prisma studio  # Runs on http://localhost:5555
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/feature-name

# Make changes, then stage
git add src/

# Commit with conventional format
git commit -m "feat: add JWT authentication"

# Options: feat | fix | refactor | test | docs | style

# Push to remote
git push origin feat/feature-name

# On GitHub: Create Pull Request
# Request 2+ reviewers
# Wait for CI/CD to pass
# Merge when approved
```

### Debugging

**Frontend:**
```bash
# Browser DevTools (F12)
- Network tab: Monitor API calls
- Console tab: Check for JS errors
- React DevTools extension: Debug components
```

**Backend:**
```bash
# VS Code Debugger
# Launch config: .vscode/launch.json
# Set breakpoints and press F5

# Or use logs
import { Logger } from '@nestjs/common';
const logger = new Logger('MyService');
logger.debug('Debug message', { context });
```

---

## 📝 Coding Standards

### TypeScript

```typescript
// ✅ DO: Use strict types
interface UserDTO {
  id: string;
  email: string;
  role: 'admin' | 'hr' | 'employee';
}

// ❌ DON'T: Use `any`
const user: any = userData; // Avoid!

// ✅ DO: Use enums for constants
enum UserRole {
  ADMIN = 'admin',
  HR = 'hr',
  EMPLOYEE = 'employee',
}

// ✅ DO: Use optional chaining
const email = user?.profile?.email;
```

### Frontend (React/Next.js)

```typescript
// ✅ DO: Use function components with hooks
export function MyComponent({ title }: { title: string }) {
  const [count, setCount] = useState(0);
  return <div>{title}: {count}</div>;
}

// ❌ DON'T: Use class components (old style)

// ✅ DO: Use React Query for data fetching
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: () => api.getUsers(),
});

// ✅ DO: Use TypeScript for props
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
```

### Backend (NestJS)

```typescript
// ✅ DO: Use decorators and dependency injection
@Controller('assessments')
@UseGuards(AuthGuard)
export class AssessmentController {
  constructor(private assessmentService: AssessmentService) {}

  @Post()
  create(@Body() createDto: CreateAssessmentDto) {
    return this.assessmentService.create(createDto);
  }
}

// ✅ DO: Use DTOs for validation
export class CreateAssessmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  total_questions: number;
}

// ✅ DO: Return proper HTTP status codes
@HttpException('Not found', HttpStatus.NOT_FOUND)
@BadRequestException('Invalid input')
```

---

## 🔐 Security Best Practices

### Authentication

```typescript
// ✅ DO: Verify JWT on protected routes
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Req() req) {
  const user = req.user; // Verified by guard
  return user;
}

// ❌ DON'T: Trust client-submitted data
const userId = req.headers['x-user-id']; // Unsafe!
```

### Input Validation

```typescript
// ✅ DO: Use Zod schemas
const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().min(18),
});

// ✅ DO: Validate before processing
const valid = userSchema.parse(userData);

// ❌ DON'T: Process without validation
const user = userData; // Could be malicious
```

### Database Queries

```typescript
// ✅ DO: Use parameterized queries (Prisma does this)
const user = await prisma.user.findUnique({
  where: { id: userId },
});

// ❌ DON'T: String concatenation
const user = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);
// SQL injection vulnerability!

// ✅ DO: Filter by organization (multi-tenancy)
const results = await prisma.assessmentResult.findMany({
  where: {
    organization_id: req.user.org_id, // Always filter!
    user_id: userId,
  },
});
```

### API Security

```typescript
// ✅ DO: Never return sensitive data
const user = {
  id: user.id,
  email: user.email,
  name: user.name,
  // ❌ DON'T include password_hash, api_key, etc
};

// ✅ DO: Rate limit public endpoints
@RateLimit(3, 60) // 3 requests per 60 seconds
@Post('login')
login(@Body() credentials: LoginDto) {
  // Rate limit applied
}
```

---

## 🧪 Testing Guide

### Unit Tests (Services/Utils)

```typescript
// Example: AuthService test
describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as any;
    service = new AuthService(mockUserRepository);
  });

  it('should create user with hashed password', async () => {
    mockUserRepository.create.mockResolvedValue(user);
    
    const result = await service.signup(signupDto);
    
    expect(mockUserRepository.create).toHaveBeenCalled();
    expect(result.id).toBe(user.id);
  });
});

// Run tests
npm run test
```

### Integration Tests (APIs)

```typescript
// Example: E2E auth flow
describe('Auth Flow (E2E)', () => {
  it('should signup, login, and access protected route', async () => {
    // 1. Signup
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'Password123' });
    
    expect(signupRes.status).toBe(201);
    const { accessToken } = signupRes.body;

    // 2. Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' });
    
    expect(loginRes.status).toBe(200);

    // 3. Access protected route
    const protectedRes = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`);
    
    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body.email).toBe('test@example.com');
  });
});
```

### Test Coverage Requirements

```bash
# Minimum 80% coverage for all PRs
npm run test:cov

# View coverage report
# Look for: Statements | Branches | Functions | Lines
# Goal: > 80% for all metrics
```

---

## 🐛 Debugging Checklist

### Frontend Issues

- [ ] Check browser console (F12)
- [ ] Check network tab (API calls)
- [ ] Check React DevTools (component state)
- [ ] Check `.env.local` (API URL correct?)
- [ ] Run `npm run lint` (TypeScript errors?)
- [ ] Restart dev server (`npm run dev`)

### Backend Issues

- [ ] Check API response status code (200, 401, 500?)
- [ ] Check server logs (terminal where `npm run dev` runs)
- [ ] Check database connection (`psql` or Prisma Studio)
- [ ] Check JWT token validity (token expired?)
- [ ] Run tests (`npm run test`)
- [ ] Restart dev server

### Database Issues

```bash
# Open Prisma Studio
npx prisma studio

# Check table contents directly
psql -U postgres -d personality_badge_dev
SELECT * FROM users; -- View data

# Check migration status
npx prisma migrate status

# Inspect database schema
\d users  -- Show table structure
```

---

## 📚 Essential References

### Frontend

- [Next.js Docs](https://nextjs.org/docs)
- [React Hooks](https://react.dev/reference/react/hooks)
- [React Query](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)

### Backend

- [NestJS Docs](https://docs.nestjs.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

### DevOps

- [Docker Compose](https://docs.docker.com/compose)
- [GitHub Actions](https://docs.github.com/en/actions)
- [DigitalOcean](https://docs.digitalocean.com)

---

## 💬 Communication

### Daily Standup

**When:** 10 AM (optional async)

**What to share:**
- ✅ What I completed yesterday
- 📝 What I'm working on today
- 🚧 Any blockers

**Where:** GitHub Issues / Project board

### Code Review

**Request:** Create PR → Assign reviewers (2+ required)

**Review SLA:**
- Urgent/blocking: 2 hours
- Standard: 24 hours

**Approval Criteria:**
- ✅ Code quality (follows standards)
- ✅ Tests written (80%+ coverage)
- ✅ No security issues
- ✅ Documentation updated

### Slack Channels

- `#development` — General dev chat
- `#deployments` — Deploy notifications
- `#incidents` — Production issues
- `#code-review` — PR discussions

---

## ⚠️ Common Pitfalls

### Database

- ❌ **Forgetting to migrate:** Changes to Prisma schema don't apply automatically
  - ✅ **Fix:** Run `npx prisma migrate dev` after schema changes

- ❌ **Querying without org_id filter:** Breaks multi-tenancy
  - ✅ **Fix:** Always filter by `organization_id` in queries

- ❌ **Overwriting assessment history:** Violates core requirement
  - ✅ **Fix:** Create new records, mark old as historical

### API

- ❌ **Returning sensitive data:** Password hashes, API keys, etc.
  - ✅ **Fix:** Use DTO/serializers to exclude sensitive fields

- ❌ **Trusting client-submitted org_id:** User could access other orgs
  - ✅ **Fix:** Get org_id from JWT token, not request body

- ❌ **Forgetting rate limiting:** API can be abused
  - ✅ **Fix:** Add `@RateLimit()` decorator to public endpoints

### Frontend

- ❌ **Using `any` type:** Defeats TypeScript benefits
  - ✅ **Fix:** Define proper types/interfaces

- ❌ **Not handling loading states:** UX feels broken
  - ✅ **Fix:** Show loading spinner while data loads

- ❌ **Hardcoding API URL:** Breaks in different environments
  - ✅ **Fix:** Use `process.env.NEXT_PUBLIC_API_URL`

---

## 📊 Code Review Template

Use this when reviewing PRs:

```markdown
# Code Review

## ✅ Positive aspects
- [x] Clear commit messages
- [x] Well-structured code
- [x] Good test coverage

## 🤔 Questions
- What does this function do when...?
- Have we considered edge case...?

## 🔧 Suggestions
- Consider using [pattern/library] for [reason]
- Could simplify this by...

## 🚨 Blocking Issues
- [ ] None

## ✅ Approval
- [x] Approved

**Ready to merge!**
```

---

## 🚀 Ready to Code!

You now have:
- ✅ Environment setup
- ✅ Project structure
- ✅ Coding standards
- ✅ Security practices
- ✅ Testing guidelines
- ✅ Common troubleshooting

**Next step:** Start on your assigned feature!

Questions? Ask in `#development` or check the docs folder.

Happy coding! 🎉

