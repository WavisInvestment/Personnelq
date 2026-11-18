import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_CATALOG } from './catalog';
import { syncRbac } from './sync';

export const PLATFORM_ROLE_KEYS = ROLE_CATALOG.filter((r) => r.scope === 'platform').map((r) => r.key);
export const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,128}$/;

export interface StaffInput {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  password?: string;
}

/**
 * Creates a platform user, or promotes an existing one, by attaching a platform Role.
 * Every user also gets the personal 'individual' role. Idempotent; never changes an existing
 * password unless one is passed.
 */
export async function ensureStaffUser(prisma: PrismaClient, raw: StaffInput): Promise<'created' | 'updated'> {
  const input = { ...raw, email: raw.email.trim().toLowerCase() };
  if (!PLATFORM_ROLE_KEYS.includes(input.role)) {
    throw new Error(`Role must be one of: ${PLATFORM_ROLE_KEYS.join(', ')}`);
  }
  if (input.password && !STRONG_PASSWORD.test(input.password)) {
    throw new Error('Admin password must be 12+ characters with upper, lower, a number and one of @$!%*?&');
  }

  // Roles must exist before they can be attached, even if the seed has not been run yet.
  await syncRbac(prisma);
  const platformRole = await prisma.role.findUniqueOrThrow({
    where: { scope_key: { scope: 'platform', key: input.role } },
  });
  const accountRole = await prisma.role.findUniqueOrThrow({
    where: { scope_key: { scope: 'account', key: 'individual' } },
  });

  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        platform_role_id: platformRole.id,
        account_role_id: existing.account_role_id ?? accountRole.id,
        ...(input.password && { password_hash: await bcrypt.hash(input.password, 10) }),
      },
    });
    return 'updated';
  }

  if (!input.password) {
    throw new Error('A password is required when creating a new account');
  }

  await prisma.user.create({
    data: {
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      password_hash: await bcrypt.hash(input.password, 10),
      email_verified: true,
      email_verified_at: new Date(),
      platform_role_id: platformRole.id,
      account_role_id: accountRole.id,
    },
  });
  return 'created';
}
