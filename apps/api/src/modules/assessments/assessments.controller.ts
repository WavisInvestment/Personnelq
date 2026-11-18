import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AssessmentsService } from './assessments.service';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { StartAssessmentDto } from './dto/start-assessment.dto';

// Saving answers is frequent, and a classroom or office shares one IP, so these routes get a roomier limit.
const ANSWER_LIMIT = { default: { limit: 600, ttl: 60 * 1000 } };

@Controller('assessments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}

  @Get()
  @RequirePermissions('take:assessments')
  list(@Request() req: any) {
    return this.service.listAssessments(req.user.id);
  }

  /** Assessments written by the companies the person belongs to. */
  @Get('company')
  @RequirePermissions('take:assessments')
  company(@Request() req: any) {
    return this.service.listCompanyAssessments(req.user.id);
  }

  @Post(':id/start')
  @Throttle(ANSWER_LIMIT)
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('take:assessments')
  start(@Request() req: any, @Param('id') id: string, @Body() dto: StartAssessmentDto) {
    return this.service.start(req.user.id, id, dto.organization_id);
  }
}

@Controller('submissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('take:assessments')
export class SubmissionsController {
  constructor(private service: AssessmentsService) {}

  @Get(':id')
  get(@Request() req: any, @Param('id') id: string) {
    return this.service.getSubmission(req.user.id, id);
  }

  @Put(':id/answers')
  @Throttle(ANSWER_LIMIT)
  save(@Request() req: any, @Param('id') id: string, @Body() dto: SaveAnswersDto) {
    return this.service.saveAnswers(req.user.id, id, dto);
  }

  @Post(':id/complete')
  @Throttle(ANSWER_LIMIT)
  @HttpCode(HttpStatus.OK)
  complete(@Request() req: any, @Param('id') id: string) {
    return this.service.complete(req.user.id, id);
  }
}

@Controller('results')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('read:own_results')
export class ResultsController {
  constructor(private service: AssessmentsService) {}

  @Get()
  list(@Request() req: any, @Query('assessment') assessment?: string) {
    return this.service.listResults(req.user.id, assessment);
  }

  @Get(':id')
  get(@Request() req: any, @Param('id') id: string) {
    return this.service.getResult(req.user.id, id);
  }
}
