import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { PaymentsModule } from '../payments/payments.module';
import { AdminService } from './admin.service';
import { StaffActionsService } from './staff-actions.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService, StaffActionsService, PermissionsGuard],
})
export class AdminModule {}
