import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, Request, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CompanyProfileDto, CreateInvitationsDto, MemberUpdateDto, PauseMemberDto, RetakeAllowDto, RetakeAskDto } from './dto/organizations.dto';
import { RetakesService } from './retakes.service';
import { OrganizationsService } from './organizations.service';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';

const HOURLY = (limit: number) => ({ default: { limit, ttl: 60 * 60 * 1000 } });

/** Company-level permissions (who may see the team, invite, export) are checked inside the service, per company. */
@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage:own_account')
export class OrganizationsController {
  constructor(
    private service: OrganizationsService,
    private retakes: RetakesService,
  ) {}

  @Get('dashboard')
  dashboard(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.dashboard(req.user.id, id);
  }

  @Get('members')
  members(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.members(req.user.id, id);
  }

  @Get('profile')
  profile(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.profile(req.user.id, id);
  }

  @Patch('profile')
  updateProfile(@Request() req: any, @Param('organizationId') id: string, @Body() dto: CompanyProfileDto) {
    return this.service.updateProfile(req.user, id, dto);
  }

  @Get('members/:userId')
  memberDetail(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string) {
    return this.service.memberDetail(req.user, id, userId);
  }

  @Post('members/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  suspendMember(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string, @Body() dto: PauseMemberDto) {
    return this.service.suspendMember(req.user, id, userId, dto.reason ?? undefined);
  }

  @Post('members/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivateMember(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string) {
    return this.service.reactivateMember(req.user, id, userId);
  }

  @Get('classes')
  @Header('Cache-Control', 'private, no-store')
  classes(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.classes(req.user.id, id);
  }

  @Get('classes/matches')
  @Header('Cache-Control', 'private, no-store')
  matches(@Request() req: any, @Param('organizationId') id: string, @Query('cross_department') cross?: string, @Query('seed') seed?: string) {
    const n = Number(seed);
    return this.service.matches(req.user.id, id, { crossDepartment: cross === 'true', seed: seed !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined });
  }

  @Get('members/:userId/result')
  @Header('Cache-Control', 'private, no-store')
  memberResult(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string) {
    return this.service.memberResult(req.user, id, userId);
  }

  @Get('staff')
  staff(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.staff(req.user.id, id);
  }

  @Patch('members/:userId')
  async updateMember(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string, @Body() dto: MemberUpdateDto) {
    const out: Record<string, unknown> = {};
    if (dto.role !== undefined) Object.assign(out, await this.service.setMemberRole(req.user, id, userId, dto.role));
    if (dto.department !== undefined) Object.assign(out, await this.service.setMemberDepartment(req.user, id, userId, dto.department));
    return out;
  }

  @Get('retakes')
  listRetakes(@Request() req: any, @Param('organizationId') id: string) {
    return this.retakes.list(req.user.id, id);
  }

  @Post('retakes')
  @Idempotent()
  @Throttle(HOURLY(60))
  @HttpCode(HttpStatus.OK)
  allowRetake(@Request() req: any, @Param('organizationId') id: string, @Body() dto: RetakeAllowDto) {
    return this.retakes.allow(req.user, id, dto.user_id, dto.assessment_id);
  }

  @Post('retakes/:retakeId/approve')
  @HttpCode(HttpStatus.OK)
  approveRetake(@Request() req: any, @Param('organizationId') id: string, @Param('retakeId') retakeId: string) {
    return this.retakes.approve(req.user, id, retakeId);
  }

  @Post('retakes/:retakeId/decline')
  @HttpCode(HttpStatus.OK)
  declineRetake(@Request() req: any, @Param('organizationId') id: string, @Param('retakeId') retakeId: string) {
    return this.retakes.decline(req.user, id, retakeId);
  }

  @Post('retakes/:retakeId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelRetake(@Request() req: any, @Param('organizationId') id: string, @Param('retakeId') retakeId: string) {
    return this.retakes.cancel(req.user, id, retakeId);
  }

  @Delete('members/:userId')
  removeMember(@Request() req: any, @Param('organizationId') id: string, @Param('userId') userId: string) {
    return this.service.removeMember(req.user, id, userId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  leave(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.leave(req.user, id);
  }

  @Post('invitations')
  @Idempotent()
  @Throttle(HOURLY(20))
  @HttpCode(HttpStatus.OK)
  invite(@Request() req: any, @Param('organizationId') id: string, @Body() dto: CreateInvitationsDto) {
    return this.service.createInvitations(req.user, id, dto);
  }

  @Get('invitations')
  invitations(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.listInvitations(req.user.id, id);
  }

  @Delete('invitations/:invitationId')
  revoke(@Request() req: any, @Param('organizationId') id: string, @Param('invitationId') invitationId: string) {
    return this.service.revokeInvitation(req.user, id, invitationId);
  }

  @Post('invitations/:invitationId/resend')
  @Idempotent()
  @Throttle(HOURLY(30))
  @HttpCode(HttpStatus.OK)
  resend(@Request() req: any, @Param('organizationId') id: string, @Param('invitationId') invitationId: string) {
    return this.service.resendInvitation(req.user, id, invitationId);
  }

  @Post('reminders')
  @Idempotent()
  @Throttle(HOURLY(6))
  @HttpCode(HttpStatus.OK)
  remind(@Request() req: any, @Param('organizationId') id: string) {
    return this.service.remind(req.user, id);
  }

  @Get('export/results.csv')
  @Throttle(HOURLY(20))
  @Header('Cache-Control', 'private, no-store')
  async exportCsv(@Request() req: any, @Param('organizationId') id: string) {
    const { csv, filename } = await this.service.exportCsv(req.user, id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${filename}"` });
  }

  @Get('export/team-report.pdf')
  @Throttle(HOURLY(20))
  @Header('Cache-Control', 'private, no-store')
  async exportPdf(@Request() req: any, @Param('organizationId') id: string) {
    const { pdf, filename } = await this.service.exportPdf(req.user, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private service: OrganizationsService) {}

  /** Public: shows who invited you and what the company will see, before you sign in. */
  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @Header('Cache-Control', 'no-store')
  info(@Param('token') token: string) {
    return this.service.invitationInfo(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:own_account')
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  accept(@Request() req: any, @Param('token') token: string) {
    return this.service.acceptInvitation(req.user, token);
  }
}

/** A company member asking to repeat an assessment they already finished through the company. */
@Controller('retake-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('take:assessments')
export class RetakeRequestsController {
  constructor(private retakes: RetakesService) {}

  @Post()
  @Idempotent()
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  request(@Request() req: any, @Body() dto: RetakeAskDto) {
    return this.retakes.request(req.user, dto.assessment_id, dto.organization_id);
  }
}
