import { PERMISSION_CATALOG, ROLE_CATALOG } from './catalog';
import { syncRbac } from './sync';

function fakePrisma() {
  const tx = {
    permission: {
      upsert: jest.fn(async ({ where }: any) => ({ id: `perm:${where.key}` })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    role: {
      upsert: jest.fn(async ({ where }: any) => ({ id: `role:${where.scope_key.scope}:${where.scope_key.key}` })),
    },
    rolePermission: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return { prisma: prisma as any, tx };
}

describe('syncRbac', () => {
  it('upserts every permission and role from the catalogue', async () => {
    const { prisma, tx } = fakePrisma();

    const result = await syncRbac(prisma);

    expect(tx.permission.upsert).toHaveBeenCalledTimes(PERMISSION_CATALOG.length);
    expect(tx.role.upsert).toHaveBeenCalledTimes(ROLE_CATALOG.length);
    expect(result).toEqual({
      permissions: PERMISSION_CATALOG.length,
      roles: ROLE_CATALOG.length,
      links: ROLE_CATALOG.reduce((n, r) => n + r.permissions.length, 0),
    });
  });

  it('links each role to exactly its catalogue permissions', async () => {
    const { prisma, tx } = fakePrisma();

    await syncRbac(prisma);

    const support = ROLE_CATALOG.find((r) => r.key === 'support')!;
    const call = (tx.rolePermission.createMany as jest.Mock).mock.calls.find(
      ([arg]) => arg.data[0].role_id === 'role:platform:support',
    )![0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((d: any) => d.permission_id).sort()).toEqual(
      support.permissions.map((k) => `perm:${k}`).sort(),
    );
  });

  it('removes links and permissions that are no longer in the catalogue', async () => {
    const { prisma, tx } = fakePrisma();

    await syncRbac(prisma);

    expect(tx.permission.deleteMany).toHaveBeenCalledWith({
      where: { key: { notIn: PERMISSION_CATALOG.map((p) => p.key) } },
    });
    const staleLinkCleanup = (tx.rolePermission.deleteMany as jest.Mock).mock.calls[0][0];
    expect(staleLinkCleanup.where.permission_id.notIn.length).toBeGreaterThan(0);
  });

  it('runs inside a single transaction so a failure leaves nothing half-written', async () => {
    const { prisma } = fakePrisma();
    await syncRbac(prisma);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
