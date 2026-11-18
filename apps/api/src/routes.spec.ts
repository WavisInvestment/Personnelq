import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS_KEY } from './common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from './modules/auth/guards/jwt.guard';

/**
 * Walks every controller and checks who can reach each route. Anything that doesn't demand a signed-in person must be
 * on the list below, on purpose; adding a public route without updating it fails this test, which is the point.
 * Set WRITE_ROUTE_DOC=1 to regenerate docs/api-reference.md from the same data.
 */
const PUBLIC = new Set([
  'GET /api/health', // unversioned on purpose
  'POST /api/v1/auth/signup',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/auth/verify-email',
  'GET /api/v1/public/badges/:token', // a badge link is the secret; the owner chooses what it shows
  'GET /api/v1/invitations/:token', // what an invitation says, before sign-in; the token is the secret
  'POST /api/webhooks/paystack', // unversioned on purpose; authenticated by Paystack's HMAC signature instead
]);

// Signed-in routes that need no particular permission: they only ever concern the caller's own session.
const ANY_SIGNED_IN = new Set(['POST /api/v1/auth/logout', 'POST /api/v1/auth/me', 'POST /api/v1/auth/resend-verification']);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface Route {
  key: string;
  method: string;
  path: string;
  signedIn: boolean;
  permissions: string[];
}

function collect(): Route[] {
  const routes: Route[] = [];
  for (const file of controllerFiles(__dirname)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    for (const exported of Object.values<any>(mod)) {
      if (typeof exported !== 'function' || Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;
      const prefix: string = Reflect.getMetadata(PATH_METADATA, exported);
      const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, exported) ?? [];
      const classPerms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, exported) ?? [];
      const version = Reflect.getMetadata(VERSION_METADATA, exported);
      const base = version === VERSION_NEUTRAL ? '/api' : `/api/v${version ?? 1}`; // main.ts makes 1 the default
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const sub: string = Reflect.getMetadata(PATH_METADATA, handler) ?? '';
        const guards: unknown[] = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
        const path = `${base}/${[prefix, sub].map((p) => String(p).replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`.replace(/\/$/, '');
        const verb = RequestMethod[method];
        routes.push({
          key: `${verb} ${path}`,
          method: verb,
          path,
          signedIn: guards.includes(JwtAuthGuard),
          permissions: [...classPerms, ...(Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? [])],
        });
      }
    }
  }
  // /api/health lives on the app controller, which has no prefix
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

describe('route protection', () => {
  const routes = collect();

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(70);
  });

  it('puts every route under /api/v1 except the two deliberately unversioned ones', () => {
    const unversioned = routes.filter((r) => !r.path.startsWith('/api/v1/')).map((r) => r.key);
    expect(unversioned.sort()).toEqual(['GET /api/health', 'POST /api/webhooks/paystack']);
  });

  it('every route needs a signed-in person, except the deliberately public ones', () => {
    const open = routes.filter((r) => !r.signedIn).map((r) => r.key);
    expect(open.sort()).toEqual([...PUBLIC].sort());
  });

  it('every deliberately public route still exists (no stale entries)', () => {
    const keys = new Set(routes.map((r) => r.key));
    for (const p of PUBLIC) expect(keys.has(p)).toBe(true);
  });

  it('every signed-in route also checks a permission', () => {
    const unchecked = routes.filter((r) => r.signedIn && r.permissions.length === 0 && !ANY_SIGNED_IN.has(r.key)).map((r) => r.key);
    expect(unchecked).toEqual([]);
  });

  it('writes docs/api-reference.md when asked', () => {
    if (!process.env.WRITE_ROUTE_DOC) return;
    const rows = routes.map((r) => `| ${r.method} | \`${r.path}\` | ${r.signedIn ? 'Signed in' : 'Public'} | ${r.permissions.map((p) => `\`${p}\``).join(', ') || '–'} |`);
    writeFileSync(
      join(__dirname, '../../../docs/api-reference.md'),
      `# API reference

Generated from the code by \`WRITE_ROUTE_DOC=1 npx jest src/routes.spec.ts\` (in apps/api). Do not edit by hand.

Every route lives under \`/api/v1\` except the health check (\`/api/health\`) and the Paystack webhook (\`/api/webhooks/paystack\`), which are deliberately unversioned. See [api-versioning.md](api-versioning.md) for how versions change. "Signed in" means a bearer access token is required. The permission column is the account-level or platform permission the route demands; company-level permissions (invite, export, approve retakes...) are checked inside each service, per company, so a person in several companies is judged by their role in the one they are asking about.

Request and response shapes are the DTO classes next to each controller (\`apps/api/src/modules/*/dto\`). Errors carry a stable \`code\` (for example \`EMAIL_NOT_VERIFIED\`, \`RETAKE_NEEDS_APPROVAL\`) next to a plain-language \`message\`.

| Method | Path | Access | Permission |
|---|---|---|---|
${rows.join('\n')}
`,
    );
  });
});
