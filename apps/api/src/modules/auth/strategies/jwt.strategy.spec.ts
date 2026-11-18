import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const findUnique = jest.fn();
  const findMembership = jest.fn();
  const strategy = new JwtStrategy({ get: () => 'test-secret' } as any, { user: { findUnique }, organizationMember: { findFirst: findMembership } } as any);

  const perms = (...keys: string[]) => keys.map((key) => ({ permission: { key } }));
  const baseUser = {
    id: 'u1',
    email: 'a@b.com',
    first_name: 'A',
    last_name: 'B',
    email_verified: true,
    deleted_at: null,
  };

  beforeEach(() => {
    findUnique.mockReset();
    findMembership.mockReset().mockResolvedValue(null);
  });

  it('gives a regular user only their personal permissions', async () => {
    findUnique.mockResolvedValue({
      ...baseUser,
      account_role: { key: 'individual', name: 'Individual', permissions: perms('take:assessments', 'read:own_results') },
      platform_role: null,
    });

    const result = await strategy.validate({ sub: 'u1' });

    expect(result).toMatchObject({ account_role: 'individual', platform_role: null });
    expect(result!.permissions).toEqual(['read:own_results', 'take:assessments']);
  });

  it('gives staff their platform permissions only: nothing personal, so they cannot use the user side of the platform', async () => {
    findUnique.mockResolvedValue({
      ...baseUser,
      account_role: { key: 'individual', name: 'Individual', permissions: perms('take:assessments') },
      platform_role: {
        key: 'support',
        name: 'Support',
        permissions: perms('view:payments'),
      },
    });

    const result = await strategy.validate({ sub: 'u1' });

    expect(result).toMatchObject({ platform_role: 'support', platform_role_name: 'Support' });
    // exactly what the platform role carries: the personal "take:assessments" is not merged in
    expect(result!.permissions).toEqual(['view:payments']);
  });

  it('copes with a user who has no roles at all', async () => {
    findUnique.mockResolvedValue({ ...baseUser, account_role: null, platform_role: null });
    expect((await strategy.validate({ sub: 'u1' }))!.permissions).toEqual([]);
  });

  it('marks company administrators and HR, so the personal side can be closed to them', async () => {
    findUnique.mockResolvedValue({ ...baseUser, account_role: { key: 'individual', name: 'Individual', permissions: perms('take:assessments') }, platform_role: null });
    findMembership.mockResolvedValue({ id: 'm1' });
    expect(await strategy.validate({ sub: 'u1' })).toMatchObject({ company_staff: true });
    expect(findMembership.mock.calls[0][0].where).toMatchObject({ user_id: 'u1', status: 'active', deleted_at: null, role: { key: { in: ['admin', 'hr'] } } });

    findMembership.mockResolvedValue(null);
    expect(await strategy.validate({ sub: 'u1' })).toMatchObject({ company_staff: false });
  });

  it('does not look up memberships for platform staff (they are not company staff)', async () => {
    findUnique.mockResolvedValue({ ...baseUser, account_role: null, platform_role: { key: 'support', name: 'Support', permissions: perms('view:payments') } });
    expect(await strategy.validate({ sub: 'u1' })).toMatchObject({ company_staff: false });
    expect(findMembership).not.toHaveBeenCalled();
  });

  it('refuses a suspended account on every request', async () => {
    findUnique.mockResolvedValue({ ...baseUser, suspended_at: new Date(), account_role: null, platform_role: null });
    expect(await strategy.validate({ sub: 'u1' })).toBeNull();
  });

  it('rejects unknown or deleted users', async () => {
    findUnique.mockResolvedValue(null);
    expect(await strategy.validate({ sub: 'nobody' })).toBeNull();

    findUnique.mockResolvedValue({ ...baseUser, deleted_at: new Date(), account_role: null, platform_role: null });
    expect(await strategy.validate({ sub: 'u1' })).toBeNull();
  });
});
