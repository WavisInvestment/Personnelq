import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

const rolePermissions = {
  select: {
    key: true,
    name: true,
    permissions: { select: { permission: { select: { key: true } } } },
  },
} as const;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        email_verified: true,
        deleted_at: true,
        suspended_at: true,
        platform_role: rolePermissions,
        account_role: rolePermissions,
      },
    });

    if (!user || user.deleted_at || user.suspended_at) {
      return null;
    }

    // Company administrators and HR manage assessments for their people; they do not take them. One small indexed query.
    const company_staff = user.platform_role
      ? false
      : !!(await this.prisma.organizationMember.findFirst({
          where: { user_id: user.id, status: 'active', deleted_at: null, role: { key: { in: ['admin', 'hr'] } } },
          select: { id: true },
        }));

    // Permissions are read fresh on every request, so changing a role takes effect immediately.
    // Platform staff run the platform and do not use it: they hold their platform role's permissions and nothing personal
    // (no taking assessments, no results, no payments). Everyone else holds their personal role.
    const permissions = new Set<string>();
    for (const role of user.platform_role ? [user.platform_role] : [user.account_role]) {
      role?.permissions.forEach((rp) => permissions.add(rp.permission.key));
    }

    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      email_verified: user.email_verified,
      company_staff,
      account_role: user.account_role?.key ?? null,
      platform_role: user.platform_role?.key ?? null,
      platform_role_name: user.platform_role?.name ?? null,
      permissions: [...permissions].sort(),
    };
  }
}
