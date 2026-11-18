import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomAssessmentsController } from './custom-assessments.controller';
import { CustomAssessmentsService } from './custom-assessments.service';

@Module({ imports: [AuthModule], controllers: [CustomAssessmentsController], providers: [CustomAssessmentsService] })
export class CustomAssessmentsModule {}
