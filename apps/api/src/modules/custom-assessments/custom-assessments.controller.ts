import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Request, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CustomAssessmentsService } from './custom-assessments.service';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';

/** Company-level permissions are checked inside the service, per company. */
@Controller('organizations/:organizationId/assessments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage:own_account')
export class CustomAssessmentsController {
  constructor(private service: CustomAssessmentsService) {}

  @Get()
  list(@Request() req: any, @Param('organizationId') org: string) {
    return this.service.list(req.user.id, org);
  }

  @Post()
  @Idempotent()
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  create(@Request() req: any, @Param('organizationId') org: string, @Body() body: { name?: unknown }) {
    return this.service.create(req.user, org, body?.name);
  }

  @Get(':id')
  get(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    return this.service.get(req.user.id, org, id);
  }

  @Put(':id')
  @Throttle({ default: { limit: 300, ttl: 60 * 60 * 1000 } })
  save(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string, @Body() body: unknown) {
    return this.service.save(req.user, org, id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    return this.service.publish(req.user, org, id);
  }

  @Post(':id/new-version')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  newVersion(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    return this.service.newVersion(req.user, org, id);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    return this.service.remove(req.user, org, id);
  }

  @Get(':id/results')
  @Header('Cache-Control', 'private, no-store')
  results(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    return this.service.results(req.user.id, org, id);
  }

  @Get(':id/results.csv')
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @Header('Cache-Control', 'private, no-store')
  async resultsCsv(@Request() req: any, @Param('organizationId') org: string, @Param('id') id: string) {
    const { csv, filename } = await this.service.resultsCsv(req.user, org, id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${filename}"` });
  }
}
