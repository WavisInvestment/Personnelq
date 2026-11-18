import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, RawBodyRequest, Req, UnauthorizedException, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { WebhookEventsService } from './webhook-events.service';
import { verifyPaystackSignature } from './paystack.client';

// Paystack calls this from its own servers: no login, and no per-IP rate limit (the signature is the control).
// Not versioned: this exact address is saved in the Paystack dashboard, and changing it would silently stop payments.
@Controller({ path: 'webhooks', version: VERSION_NEUTRAL })
@SkipThrottle()
export class PaystackWebhookController {
  constructor(
    private events: WebhookEventsService,
    private billing: BillingConfigService,
  ) {}

  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    const raw = req.rawBody;
    if (!raw || !verifyPaystackSignature(raw, signature, this.billing.paystackSecretKey)) {
      throw new UnauthorizedException('Invalid signature');
    }

    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed payload');
    }

    // Every delivery is recorded. A repeat of one that already worked is acknowledged without acting again, and a
    // failure surfaces as an error so Paystack delivers it again.
    const { duplicate } = await this.events.receive('paystack', raw, event);
    return duplicate ? { received: true, duplicate: true } : { received: true };
  }
}
