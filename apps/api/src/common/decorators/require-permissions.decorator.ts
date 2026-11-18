import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac/catalog';

export const PERMISSIONS_KEY = 'required_permissions';

/** The caller must hold every listed permission (through their platform role). */
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);
