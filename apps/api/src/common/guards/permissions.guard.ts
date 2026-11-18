import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PERMISSION_CATALOG } from '../rbac/catalog';

/** The personal side: taking assessments and keeping your own results, reports and badge. */
const PERSONAL_PERMISSIONS: ReadonlySet<string> = new Set(['take:assessments', 'read:own_results', 'download:own_reports']);
const PLATFORM_PERMISSIONS: ReadonlySet<string> = new Set(PERMISSION_CATALOG.filter((p) => p.scope === 'platform').map((p) => p.key));

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest().user;
    const held: string[] | undefined = user?.permissions;

    // Platform staff belong in the admin console. Any route that is not an admin route (taking assessments, results,
    // payments, company pages, the personal account) is closed to them, whatever else their account might hold.
    if (user?.platform_role && required?.length && !required.some((p) => PLATFORM_PERMISSIONS.has(p))) {
      throw new ForbiddenException({ statusCode: 403, code: 'STAFF_ADMIN_ONLY', message: 'Platform staff use the admin console only. Sign in with a personal account to use the rest of the platform.' });
    }

    // Fail closed: a route using this guard without declaring permissions is never open.
    // Company administrators and HR run assessments for their people rather than taking them themselves.
    if (user?.company_staff && required?.some((p) => PERSONAL_PERMISSIONS.has(p))) {
      throw new ForbiddenException({ statusCode: 403, code: 'COMPANY_STAFF_NO_ASSESSMENTS', message: 'Company administrators and HR manage assessments for their people. They don’t take them, and they have no personal results or badge.' });
    }

    if (!required?.length || !held || !required.every((p) => held.includes(p))) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    return true;
  }
}
