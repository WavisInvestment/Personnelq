import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Request, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { ReportsService } from './reports.service';

@Controller('results')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('download:own_reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get(':id/report')
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @Header('Cache-Control', 'private, no-store')
  async download(@Request() req: any, @Param('id') id: string) {
    const { pdf, filename } = await this.service.buildPdf(req.user, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @Post(':id/email')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  email(@Request() req: any, @Param('id') id: string) {
    return this.service.emailReport(req.user, id);
  }
}
