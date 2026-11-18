import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { syncRbac } from './sync';

@Injectable()
export class RbacService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacService.name);

  constructor(private prisma: PrismaService) {}

  // Keeps the tables matching the catalogue after a deploy, without anyone remembering to seed.
  async onApplicationBootstrap() {
    try {
      const { roles, permissions, links } = await syncRbac(this.prisma);
      this.logger.log(`RBAC synced: ${roles} roles, ${permissions} permissions, ${links} links`);
    } catch (err) {
      this.logger.error('RBAC sync failed; permission checks will deny access until it succeeds', err as Error);
    }
  }

  /** Permission keys a person holds inside one company, via their membership role. */
  async permissionsInOrganization(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { user_id_organization_id: { user_id: userId, organization_id: organizationId } },
      select: {
        status: true,
        deleted_at: true,
        role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
      },
    });

    if (!membership || membership.deleted_at || membership.status !== 'active') return [];
    return membership.role.permissions.map((rp) => rp.permission.key);
  }
}
