import { RbacService } from './rbac.service';

describe('RbacService.permissionsInOrganization', () => {
  const findUnique = jest.fn();
  const service = new RbacService({ organizationMember: { findUnique } } as any);

  const membership = (overrides: object = {}) => ({
    status: 'active',
    deleted_at: null,
    role: { permissions: [{ permission: { key: 'invite:members' } }, { permission: { key: 'manage:team' } }] },
    ...overrides,
  });

  beforeEach(() => findUnique.mockReset());

  it('returns the permissions carried by the member’s role in that company', async () => {
    findUnique.mockResolvedValue(membership());

    expect(await service.permissionsInOrganization('u1', 'o1')).toEqual(['invite:members', 'manage:team']);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id_organization_id: { user_id: 'u1', organization_id: 'o1' } } }),
    );
  });

  it('grants nothing to someone who is not a member', async () => {
    findUnique.mockResolvedValue(null);
    expect(await service.permissionsInOrganization('u1', 'o1')).toEqual([]);
  });

  it('grants nothing to inactive, invited or removed members', async () => {
    for (const overrides of [{ status: 'inactive' }, { status: 'invited' }, { deleted_at: new Date() }]) {
      findUnique.mockResolvedValue(membership(overrides));
      expect(await service.permissionsInOrganization('u1', 'o1')).toEqual([]);
    }
  });
});
