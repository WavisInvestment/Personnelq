import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssessmentsBootstrap } from './assessments.bootstrap';
import { AssessmentsController, ResultsController, SubmissionsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [AuthModule],
  controllers: [AssessmentsController, SubmissionsController, ResultsController],
  providers: [AssessmentsService, AssessmentsBootstrap],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
