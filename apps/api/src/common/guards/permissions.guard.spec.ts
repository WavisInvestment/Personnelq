import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  const contextFor = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const requires = (permissions: string[] | undefined) =>
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permissions);

  it('allows a user holding the required permission', () => {
    requires(['view:payments']);
    expect(guard.canActivate(contextFor({ permissions: ['view:payments', 'view:roles'] }))).toBe(true);
  });

  it('requires every listed permission, not just one', () => {
    requires(['view:payments', 'manage:payments']);
    expect(() => guard.canActivate(contextFor({ permissions: ['view:payments'] }))).toThrow(ForbiddenException);
  });

  it('rejects a user whose role does not carry the permission', () => {
    requires(['view:payments']);
    expect(() => guard.canActivate(contextFor({ permissions: ['view:roles'] }))).toThrow(ForbiddenException);
  });

  it('rejects a regular user with no permissions', () => {
    requires(['view:payments']);
    expect(() => guard.canActivate(contextFor({ permissions: [] }))).toThrow(ForbiddenException);
  });

  it('fails closed when the route declares no permissions', () => {
    requires(undefined);
    expect(() => guard.canActivate(contextFor({ permissions: ['view:payments'] }))).toThrow(ForbiddenException);
  });

  it('keeps platform staff out of everything that is not an admin route, whatever permissions they hold', () => {
    const staff = { platform_role: 'super_admin', permissions: ['take:assessments', 'manage:own_account', 'read:own_results', 'view:payments'] };
    for (const route of [['take:assessments'], ['manage:own_account'], ['read:own_results'], ['download:own_reports']]) {
      requires(route);
      expect(() => guard.canActivate(contextFor(staff))).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'STAFF_ADMIN_ONLY' }) }));
    }
  });

  it('lets platform staff into admin routes, and leaves everyone else alone', () => {
    requires(['view:payments']);
    expect(guard.canActivate(contextFor({ platform_role: 'support', permissions: ['view:payments'] }))).toBe(true);
    requires(['take:assessments']);
    expect(guard.canActivate(contextFor({ platform_role: null, permissions: ['take:assessments'] }))).toBe(true);
  });

  it('keeps company administrators and HR off the personal side, but not off company or account routes', () => {
    const staff = { company_staff: true, platform_role: null, permissions: ['take:assessments', 'read:own_results', 'download:own_reports', 'manage:own_account'] };
    for (const route of [['take:assessments'], ['read:own_results'], ['download:own_reports']]) {
      requires(route);
      expect(() => guard.canActivate(contextFor(staff))).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'COMPANY_STAFF_NO_ASSESSMENTS' }) }));
    }
    requires(['manage:own_account']);
    expect(guard.canActivate(contextFor(staff))).toBe(true);
  });

  it('does not touch people who are not company staff', () => {
    requires(['take:assessments']);
    expect(guard.canActivate(contextFor({ company_staff: false, platform_role: null, permissions: ['take:assessments'] }))).toBe(true);
  });

  it('rejects a request with no user or no permission list', () => {
    requires(['view:payments']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });
});
