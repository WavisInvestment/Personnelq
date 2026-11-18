import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { PdfService } from './pdf.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, AssessmentsModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfService],
  exports: [PdfService],
})
export class ReportsModule {}
