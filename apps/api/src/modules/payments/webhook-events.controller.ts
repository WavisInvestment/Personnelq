import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { WebhookEventsService } from './webhook-events.service';

/** Platform staff: see what payment providers have sent us and run an event again. */
@Controller('admin/webhook-events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhookEventsController {
  constructor(private events: WebhookEventsService) {}

  @Get()
  @RequirePermissions('view:payments')
  list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.events.list(['received', 'processed', 'ignored', 'failed'].includes(status ?? '') ? status : undefined, Number(limit) || 50);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('manage:payments')
  replay(@Param('id') id: string) {
    return this.events.replay(id);
  }
}
