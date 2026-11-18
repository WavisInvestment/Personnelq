import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { InvitationsController, OrganizationsController, RetakeRequestsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { RetakesService } from './retakes.service';

@Module({
  imports: [AuthModule, ReportsModule],
  controllers: [OrganizationsController, InvitationsController, RetakeRequestsController],
  providers: [OrganizationsService, RetakesService],
})
export class OrganizationsModule {}
