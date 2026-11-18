import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AnalyticsService } from './analytics.service';

@Controller('me')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('organizations')
  @RequirePermissions('manage:own_account')
  organizations(@Request() req: any) {
    return this.service.organizations(req.user.id);
  }

  @Get('progress')
  @RequirePermissions('read:own_results')
  progress(@Request() req: any) {
    return this.service.progress(req.user.id);
  }
}
