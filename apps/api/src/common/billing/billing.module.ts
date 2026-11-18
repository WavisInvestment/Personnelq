import { Global, Module } from '@nestjs/common';
import { BillingConfigService } from './billing-config.service';

@Global()
@Module({
  providers: [BillingConfigService],
  exports: [BillingConfigService],
})
export class BillingModule {}
