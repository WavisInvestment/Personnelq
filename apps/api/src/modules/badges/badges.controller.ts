import { Body, Controller, Delete, Get, Header, Param, Put, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { BadgesService } from './badges.service';
import { UpdateBadgeDto } from './dto/update-badge.dto';

@Controller('results')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('read:own_results')
export class BadgesController {
  constructor(private service: BadgesService) {}

  @Get(':id/badge')
  get(@Request() req: any, @Param('id') id: string) {
    return this.service.getForResult(req.user.id, id);
  }

  @Put(':id/badge')
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  save(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.service.upsert(req.user, id, dto);
  }

  @Delete(':id/badge')
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  revoke(@Request() req: any, @Param('id') id: string) {
    return this.service.revoke(req.user.id, id);
  }
}

// No login: anyone with the link can look. It is read-only, rate limited, and never cached,
// so revoking or expiring a badge takes effect immediately.
@Controller('public/badges')
export class PublicBadgesController {
  constructor(private service: BadgesService) {}

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @Header('Cache-Control', 'no-store')
  view(@Param('token') token: string) {
    return this.service.publicView(token);
  }
}
