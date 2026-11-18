import { PERMISSION_CATALOG, ROLE_CATALOG } from './catalog';

describe('RBAC catalogue', () => {
  const scopeOf = new Map<string, string>(PERMISSION_CATALOG.map((p) => [p.key, p.scope]));
  const role = (scope: string, key: string) => ROLE_CATALOG.find((r) => r.scope === scope && r.key === key)!;

  it('has no duplicate permission keys', () => {
    expect(new Set(PERMISSION_CATALOG.map((p) => p.key)).size).toBe(PERMISSION_CATALOG.length);
  });

  it('has no duplicate roles within a scope', () => {
    const ids = ROLE_CATALOG.map((r) => `${r.scope}:${r.key}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only grants permissions that exist, from the role’s own scope or the personal baseline', () => {
    for (const role of ROLE_CATALOG) {
      for (const key of role.permissions) {
        expect(scopeOf.has(key)).toBe(true);
        expect([role.scope, 'account']).toContain(scopeOf.get(key));
      }
    }
  });

  it('never leaks platform permissions to company or personal roles', () => {
    for (const role of ROLE_CATALOG.filter((r) => r.scope !== 'platform')) {
      expect(role.permissions.some((k) => scopeOf.get(k) === 'platform')).toBe(false);
    }
  });

  it('gives the individual role exactly the personal permissions', () => {
    const personal = PERMISSION_CATALOG.filter((p) => p.scope === 'account').map((p) => p.key);
    expect(personal.length).toBeGreaterThan(0);
    expect([...role('account', 'individual').permissions].sort()).toEqual([...personal].sort());
  });

  it('keeps the personal baseline inside every company role', () => {
    const personal = PERMISSION_CATALOG.filter((p) => p.scope === 'account').map((p) => p.key);
    for (const r of ROLE_CATALOG.filter((x) => x.scope === 'organization')) {
      expect(r.permissions).toEqual(expect.arrayContaining(personal));
    }
  });

  it('does not grant the same permission twice to one role', () => {
    for (const role of ROLE_CATALOG) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('gives super_admin every platform permission', () => {
    const all = PERMISSION_CATALOG.filter((p) => p.scope === 'platform').map((p) => p.key);
    expect([...role('platform', 'super_admin').permissions].sort()).toEqual([...all].sort());
  });

  it('keeps support strictly read-only', () => {
    const support = role('platform', 'support').permissions;
    expect(support.length).toBeGreaterThan(0);
    expect(support.every((k) => k.startsWith('view:'))).toBe(true);
  });

  it('keeps billing and company settings with the company admin only', () => {
    expect(role('organization', 'admin').permissions).toEqual(
      expect.arrayContaining(['manage:billing', 'manage:organization']),
    );
    for (const key of ['hr', 'employee', 'member']) {
      expect(role('organization', key).permissions).not.toContain('manage:billing');
      expect(role('organization', key).permissions).not.toContain('manage:organization');
    }
  });

  it('lets HR approve retakes and read team results but not ordinary members', () => {
    expect(role('organization', 'hr').permissions).toEqual(
      expect.arrayContaining(['approve:retakes', 'read:team_results', 'invite:members']),
    );
    for (const key of ['employee', 'member']) {
      expect(role('organization', key).permissions).not.toContain('read:team_results');
      expect(role('organization', key).permissions).not.toContain('approve:retakes');
    }
  });
});
