import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, ROLE_CATALOG } from './catalog';

export interface SyncResult {
  permissions: number;
  roles: number;
  links: number;
}

/**
 * Writes the catalogue to the database. Safe to run any number of times: rows are upserted, and
 * links or permissions that no longer exist in the catalogue are removed so the tables never drift.
 */
export async function syncRbac(prisma: PrismaClient): Promise<SyncResult> {
  return prisma.$transaction(async (tx) => {
    const permissionIds = new Map<string, string>();
    for (const p of PERMISSION_CATALOG) {
      const row = await tx.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, scope: p.scope, description: p.description },
        update: { scope: p.scope, description: p.description },
      });
      permissionIds.set(p.key, row.id);
    }
    await tx.permission.deleteMany({ where: { key: { notIn: PERMISSION_CATALOG.map((p) => p.key) } } });

    let links = 0;
    for (const role of ROLE_CATALOG) {
      const row = await tx.role.upsert({
        where: { scope_key: { scope: role.scope, key: role.key } },
        create: { scope: role.scope, key: role.key, name: role.name, description: role.description, is_system: true },
        update: { name: role.name, description: role.description, is_system: true },
      });

      const wanted = role.permissions.map((k) => permissionIds.get(k) as string);
      await tx.rolePermission.deleteMany({ where: { role_id: row.id, permission_id: { notIn: wanted } } });
      await tx.rolePermission.createMany({
        data: wanted.map((permission_id) => ({ role_id: row.id, permission_id })),
        skipDuplicates: true,
      });
      links += wanted.length;
    }

    return { permissions: PERMISSION_CATALOG.length, roles: ROLE_CATALOG.length, links };
  });
}
