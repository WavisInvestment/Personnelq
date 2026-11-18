import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackClient } from './paystack.client';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { WebhookEventsController } from './webhook-events.controller';
import { WebhookEventsService } from './webhook-events.service';

@Module({
  imports: [AuthModule, AssessmentsModule],
  controllers: [PaymentsController, PaystackWebhookController, WebhookEventsController],
  providers: [PaymentsService, PaystackClient, WebhookEventsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
