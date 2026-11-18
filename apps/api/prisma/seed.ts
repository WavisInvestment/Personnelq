/*
 * Seeds the database. Idempotent: run it as often as you like (`npm run db:seed`);
 * `prisma migrate reset` runs it too.
 *
 *   1. Roles, permissions and the links between them, from src/common/rbac/catalog.ts.
 *   2. The official assessments (free snapshot + full Big Five) and their questions. Created if missing,
 *      never edited: they are locked.
 *   3. A platform super admin so there is someone who can sign in to /admin.
 *
 * Platform admin settings (all optional outside production):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME
 *
 * Outside production, missing values fall back to the development credentials below. In production
 * no password is ever invented: without SEED_ADMIN_PASSWORD the admin step is skipped, and an
 * existing admin's password is never changed by the seed.
 */
import { PrismaClient } from '@prisma/client';
import { syncRbac } from '../src/common/rbac/sync';
import { ensureStaffUser } from '../src/common/rbac/staff';
import { seedCoreAssessments } from '../src/modules/assessments/catalog/core-assessments';

const prisma = new PrismaClient();

const DEV_ADMIN = {
  email: 'admin@personnelq.local',
  password: 'DevAdmin2026@pb',
  first_name: 'Platform',
  last_name: 'Admin',
};

async function seedPlatformAdmin() {
  const isProduction = process.env.NODE_ENV === 'production';
  const email = (process.env.SEED_ADMIN_EMAIL ?? (isProduction ? undefined : DEV_ADMIN.email))?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? undefined : DEV_ADMIN.password);

  if (!email) {
    console.log('Skipped platform admin: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing && !password) {
    console.log('Skipped platform admin: set SEED_ADMIN_PASSWORD to create the account.');
    return;
  }

  const outcome = await ensureStaffUser(prisma, {
    email,
    first_name: process.env.SEED_ADMIN_FIRST_NAME ?? DEV_ADMIN.first_name,
    last_name: process.env.SEED_ADMIN_LAST_NAME ?? DEV_ADMIN.last_name,
    role: 'super_admin',
    // An existing account keeps its password unless one was supplied explicitly.
    password: existing ? process.env.SEED_ADMIN_PASSWORD : password,
  });

  console.log(`Platform admin ${outcome}: ${email} (super_admin)`);
  if (outcome === 'created' && !process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  Development password: ${DEV_ADMIN.password}  <- for local use only, change it before sharing`);
  }
}

async function main() {
  const result = await syncRbac(prisma);
  console.log(
    `Seeded ${result.roles} roles, ${result.permissions} permissions and ${result.links} role-permission links.`,
  );
  const assessments = await seedCoreAssessments(prisma);
  console.log(
    `Official assessments: ${assessments.created.length} created, ${assessments.existing.length} already present` +
      (assessments.mismatched.length ? ` (WARNING: ${assessments.mismatched.join(', ')} differ from the catalogue)` : ''),
  );
  await seedPlatformAdmin();
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
