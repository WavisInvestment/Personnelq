import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CheckoutDto, SubscriptionCheckoutDto } from './dto/checkout.dto';
import { PaymentsService } from './payments.service';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage:own_account')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post('checkout')
  @Idempotent()
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  checkout(@Request() req: any, @Body() dto: CheckoutDto, @Headers('origin') origin?: string) {
    return this.service.checkoutAssessment(req.user, dto.assessment_id, origin);
  }

  @Post('subscription-checkout')
  @Idempotent()
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  subscriptionCheckout(@Request() req: any, @Body() dto: SubscriptionCheckoutDto, @Headers('origin') origin?: string) {
    return this.service.checkoutSubscription(req.user, dto.organization_id, dto.plan, origin);
  }

  @Get('verify')
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  verify(@Request() req: any, @Query('reference') reference?: string) {
    if (!reference || !/^[A-Za-z0-9_.-]{6,100}$/.test(reference)) throw new BadRequestException('A valid payment reference is required');
    return this.service.verifyForUser(req.user.id, reference);
  }

  @Get('billing/:organizationId')
  billing(@Request() req: any, @Param('organizationId') organizationId: string) {
    return this.service.billingOverview(req.user.id, organizationId);
  }

  @Get()
  mine(@Request() req: any) {
    return this.service.listMine(req.user.id);
  }
}
