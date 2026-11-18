import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AdminService } from './admin.service';
import { StaffActionsService } from './staff-actions.service';
import { ReasonDto } from './dto/staff-action.dto';
import {
  AuditLogQueryDto,
  ListQueryDto,
  OrganizationListQueryDto,
  UserListQueryDto,
} from './dto/list-query.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private actions: StaffActionsService,
  ) {}

  @Get('overview')
  @RequirePermissions('view:platform_overview')
  overview() {
    return this.adminService.overview();
  }

  @Get('organizations')
  @RequirePermissions('view:all_organizations')
  organizations(@Query() query: OrganizationListQueryDto) {
    return this.adminService.listOrganizations(query);
  }

  @Get('organizations/:id')
  @RequirePermissions('view:all_organizations')
  organization(@Param('id') id: string, @Request() req: any) {
    return this.adminService.organizationDetail(id, req.user.id);
  }

  @Get('users/:id')
  @RequirePermissions('view:all_users')
  user(@Param('id') id: string, @Request() req: any) {
    return this.adminService.userDetail(id, req.user.id);
  }

  @Get('users')
  @RequirePermissions('view:all_users')
  users(@Query() query: UserListQueryDto) {
    return this.adminService.listUsers(query);
  }

  // ---- things staff can do. Each needs the "manage" permission (full staff only; read-only support cannot).

  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:all_users')
  unlock(@Param('id') id: string, @Request() req: any) {
    return this.actions.unlock(id, req.user);
  }

  @Post('users/:id/password-reset')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @RequirePermissions('manage:all_users')
  passwordReset(@Param('id') id: string, @Request() req: any) {
    return this.actions.sendPasswordReset(id, req.user);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:all_users')
  suspendUser(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.actions.suspendUser(id, req.user, dto.reason);
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:all_users')
  reactivateUser(@Param('id') id: string, @Request() req: any) {
    return this.actions.reactivateUser(id, req.user);
  }

  @Post('organizations/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:all_organizations')
  suspendOrganization(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.actions.suspendOrganization(id, req.user, dto.reason);
  }

  @Post('organizations/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:all_organizations')
  reactivateOrganization(@Param('id') id: string, @Request() req: any) {
    return this.actions.reactivateOrganization(id, req.user);
  }

  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @RequirePermissions('manage:payments')
  refund(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.actions.refund(id, req.user, dto.reason);
  }

  @Get('subscriptions')
  @RequirePermissions('view:subscriptions')
  subscriptions(@Query() query: ListQueryDto) {
    return this.adminService.listSubscriptions(query);
  }

  @Get('payments')
  @RequirePermissions('view:payments')
  payments(@Query() query: ListQueryDto) {
    return this.adminService.listPayments(query);
  }

  @Get('audit-logs')
  @RequirePermissions('view:audit_logs')
  auditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.listAuditLogs(query);
  }

  @Get('roles')
  @RequirePermissions('view:roles')
  roles() {
    return this.adminService.listRoles();
  }
}
