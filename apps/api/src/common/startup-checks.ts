const PLACEHOLDER = /change-?in-?production|your-|example|secret-key-here|changeme|password/i;

/**
 * Settings that would make a production server unsafe. Returns plain-language problems (empty = fine). The API refuses
 * to start in production while any exist, because a forgotten placeholder secret lets anyone sign in as anyone.
 */
export function productionProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];

  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = env[key] ?? '';
    if (!value) problems.push(`${key} is not set.`);
    else if (value.length < 32) problems.push(`${key} is too short; use at least 32 random characters.`);
    else if (PLACEHOLDER.test(value)) problems.push(`${key} still looks like the example value; generate a real one (openssl rand -hex 48).`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different.');

  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set.');

  const front = env.FRONTEND_URL ?? '';
  if (!front) problems.push('FRONTEND_URL is not set; sign-in from the website would be blocked by CORS.');
  else if (!/^https:\/\//i.test(front.split(',')[0].trim())) problems.push('FRONTEND_URL should start with https:// in production.');

  const seed = env.SEED_ADMIN_PASSWORD;
  if (seed && (seed.length < 12 || PLACEHOLDER.test(seed))) problems.push('SEED_ADMIN_PASSWORD is weak; use a long random one, and remove it after the first start.');

  return problems;
}
