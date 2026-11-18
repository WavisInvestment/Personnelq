/*
 * Creates a platform admin, or promotes an existing user, by attaching a platform Role.
 *
 *   ADMIN_PASSWORD='Str0ng&Passw0rd!' npm run admin:create -- you@company.com "First" "Last"
 *
 * Optional: ADMIN_ROLE=support for a read-only support account (default: super_admin).
 * For an existing user, ADMIN_PASSWORD is optional and only used to reset their password.
 */
import { PrismaClient } from '@prisma/client';
import { ensureStaffUser } from '../src/common/rbac/staff';

const prisma = new PrismaClient();

async function main() {
  const [email, first_name = 'Platform', last_name = 'Admin'] = process.argv.slice(2);
  const role = process.env.ADMIN_ROLE ?? 'super_admin';

  if (!email || !email.includes('@')) {
    throw new Error('Usage: ADMIN_PASSWORD=... npm run admin:create -- <email> [first_name] [last_name]');
  }

  const outcome = await ensureStaffUser(prisma, {
    email,
    first_name,
    last_name,
    role,
    password: process.env.ADMIN_PASSWORD,
  });
  console.log(`${outcome === 'created' ? 'Created' : 'Updated'} ${email}: platform role = ${role}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
