import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { BillingConfigService, PlanDefinition, addBillingPeriod, toMinorUnits } from '../../common/billing/billing-config.service';
import { isAllowedOrigin } from '../../common/cors';
import { MailService } from '../../common/mail/mail.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { requireVerifiedEmail } from '../../common/verified';
import { PrismaService } from '../../database/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { PaystackClient, PaystackError } from './paystack.client';

interface Payer {
  id: string;
  email: string;
  first_name: string;
  email_verified?: boolean;
  company_staff?: boolean;
}

export type ReconcileStatus = 'success' | 'failed' | 'pending' | 'unknown';

const PENDING_REUSE_MS = 30 * 60 * 1000;

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

const disabled = () =>
  new HttpException(
    { statusCode: 503, message: 'Payments are switched off, so there is nothing to pay for right now.', code: 'PAYMENTS_DISABLED' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );

const unavailable = () =>
  new HttpException(
    { statusCode: 503, message: 'Payments are not available right now.', code: 'PAYMENT_UNAVAILABLE' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private billing: BillingConfigService,
    private paystack: PaystackClient,
    private assessments: AssessmentsService,
    private rbac: RbacService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ------------------------------------------------------------ helpers

  /** Where the customer returns after paying. Only the website itself (or, in development, a local-network address). */
  private callbackBase(origin?: string) {
    const configured = [this.billing.frontendUrl];
    const production = this.config.get<string>('NODE_ENV') === 'production';
    return origin && isAllowedOrigin(origin, { configured, production }) ? origin.replace(/\/$/, '') : this.billing.frontendUrl;
  }

  private newReference() {
    return `pb_${randomBytes(12).toString('hex')}`;
  }

  /** Creates the Paystack transaction for an already-saved pending payment, or marks it failed. */
  private async startTransaction(
    payment: { id: string; provider_reference: string; amount: number; currency: string },
    payer: Payer,
    origin: string | undefined,
    metadata: Record<string, unknown>,
  ) {
    try {
      const init = await this.paystack.initialize({
        email: payer.email,
        amount: toMinorUnits(payment.amount),
        currency: payment.currency,
        reference: payment.provider_reference,
        callback_url: `${this.callbackBase(origin)}/payments/callback`,
        metadata: { payment_id: payment.id, user_id: payer.id, ...metadata },
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { authorization_url: init.authorization_url, access_code: init.access_code },
      });
      return init;
    } catch (err) {
      const message = err instanceof PaystackError ? err.message : 'Could not reach the payment provider';
      this.logger.error(`Paystack initialize failed for ${payment.provider_reference}: ${message}`);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', description: `Could not start: ${message}`.slice(0, 200) } });
      throw new HttpException(
        { statusCode: 502, message: 'We couldn’t start the payment. Please try again in a moment.', code: 'PAYMENT_PROVIDER_ERROR' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ------------------------------------------------------------ refunds (platform staff)

  /**
   * Returns a successful payment through Paystack. The payment is claimed first ("refund_pending"), so two clicks or two
   * staff members cannot refund it twice; if Paystack refuses, it goes back to "success". A refunded assessment payment no
   * longer buys an attempt; a refunded company plan payment ends the plan if it was the one paying for the current period.
   */
  async refund(paymentId: string, reason: string) {
    if (!this.paystack.isConfigured()) throw unavailable();
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { user: { select: { id: true, email: true, first_name: true } } } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'success') {
      throw new ConflictException({ statusCode: 409, code: 'NOT_REFUNDABLE', message: `Only a successful payment can be refunded. This one is "${payment.status}".` });
    }
    const claimed = await this.prisma.payment.updateMany({ where: { id: paymentId, status: 'success' }, data: { status: 'refund_pending' } });
    if (claimed.count === 0) throw new ConflictException({ statusCode: 409, code: 'NOT_REFUNDABLE', message: 'This payment is already being refunded.' });

    let outcome: { id: string; status: string; amount: number };
    try {
      outcome = await this.paystack.refund(payment.provider_reference);
    } catch (err) {
      await this.prisma.payment.updateMany({ where: { id: paymentId, status: 'refund_pending' }, data: { status: 'success' } });
      throw new HttpException({ statusCode: HttpStatus.BAD_GATEWAY, code: 'REFUND_FAILED', message: `Paystack could not refund this payment: ${(err as Error).message}` }, HttpStatus.BAD_GATEWAY);
    }

    const metadata = { ...((payment.metadata as Record<string, unknown>) ?? {}), refund: { id: outcome.id, status: outcome.status, amount: outcome.amount, reason, at: new Date().toISOString() } };
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'refunded', metadata: metadata as Prisma.InputJsonValue } });

    if (payment.payment_type === 'subscription' && payment.organization_id) {
      const other = await this.prisma.payment.findFirst({ where: { organization_id: payment.organization_id, payment_type: 'subscription', status: 'success' }, orderBy: { created_at: 'desc' }, select: { created_at: true } });
      if (!other || other.created_at < payment.created_at) {
        const now = new Date();
        await this.prisma.subscription.updateMany({ where: { organization_id: payment.organization_id }, data: { status: 'cancelled', cancelled_at: now, end_date: now } });
        await this.prisma.organization.update({ where: { id: payment.organization_id }, data: { subscription_status: 'inactive', subscription_end_date: now } });
      }
    }

    if (payment.user) {
      await this.mail.sendRefundNotice(payment.user.email, { first_name: payment.user.first_name, description: payment.description ?? 'Personnelq', amount: formatMoney(payment.amount, payment.currency) });
    }
    return { id: paymentId, status: 'refunded' as const, refund_status: outcome.status };
  }

  // ------------------------------------------------------------ checkout: assessment

  async checkoutAssessment(payer: Payer, assessmentId: string, origin?: string) {
    if (!this.billing.paymentsEnabled()) throw disabled();
    const price = this.billing.assessmentPrice();
    if (!price || !this.paystack.isConfigured()) throw unavailable();
    requireVerifiedEmail(payer);
    if (payer.company_staff) {
      throw new HttpException({ statusCode: HttpStatus.FORBIDDEN, code: 'COMPANY_STAFF_NO_ASSESSMENTS', message: 'Company administrators and HR manage assessments for their people. They don’t take or buy them.' }, HttpStatus.FORBIDDEN);
    }

    const eligibility = await this.assessments.checkoutEligibility(payer.id, assessmentId);

    if (!eligibility.requiresPayment) {
      throw new BadRequestException({ statusCode: 400, message: 'This assessment does not need a payment.', code: 'NO_PAYMENT_NEEDED' });
    }
    if (eligibility.hasInProgress) {
      throw new ConflictException({ statusCode: 409, message: 'You already have this assessment in progress.', code: 'ATTEMPT_IN_PROGRESS' });
    }
    if (eligibility.retakeLocked) {
      throw new ConflictException({
        statusCode: 409,
        message: 'You can’t take this again yet, so you haven’t been charged.',
        code: 'RETAKE_LOCKED',
        retake_available_at: eligibility.retakeAvailableAt,
      });
    }
    if (eligibility.hasPaidAttempt) {
      throw new ConflictException({ statusCode: 409, message: 'You’ve already paid for your next attempt.', code: 'ALREADY_PAID' });
    }

    // Opening checkout twice shouldn't create two charges: reuse a recent unpaid one.
    const recent = await this.prisma.payment.findFirst({
      where: {
        user_id: payer.id,
        assessment_id: assessmentId,
        payment_type: 'assessment',
        status: 'pending',
        authorization_url: { not: null },
        amount: price.amount,
        currency: price.currency,
        created_at: { gt: new Date(Date.now() - PENDING_REUSE_MS) },
      },
      orderBy: { created_at: 'desc' },
    });
    if (recent?.authorization_url) {
      return { authorization_url: recent.authorization_url, reference: recent.provider_reference, ...price };
    }

    const reference = this.newReference();
    const payment = await this.prisma.payment.create({
      data: {
        organization_id: null,
        user_id: payer.id,
        amount: price.amount, // chosen here, never taken from the request
        currency: price.currency,
        status: 'pending',
        payment_method: 'paystack',
        provider_reference: reference,
        paystack_reference: reference,
        payment_type: 'assessment',
        assessment_id: assessmentId,
        description: eligibility.assessment.name,
        metadata: { assessment_id: assessmentId } satisfies Prisma.JsonObject,
      },
    });

    const init = await this.startTransaction(payment, payer, origin, { type: 'assessment', assessment_id: assessmentId });
    return { authorization_url: init.authorization_url, reference, ...price };
  }

  // ------------------------------------------------------------ checkout: company subscription

  private async requireBilling(userId: string, organizationId: string) {
    const permissions = await this.rbac.permissionsInOrganization(userId, organizationId);
    if (!permissions.includes('manage:billing')) {
      throw new ForbiddenException('Only a company administrator can manage billing');
    }
  }

  async billingOverview(userId: string, organizationId: string) {
    await this.requireBilling(userId, organizationId);

    const [organization, subscription] = await Promise.all([
      this.prisma.organization.findFirst({ where: { id: organizationId, deleted_at: null }, select: { id: true, name: true, type: true } }),
      this.prisma.subscription.findUnique({
        where: { organization_id: organizationId },
        select: { plan_name: true, status: true, billing_cycle: true, amount: true, currency: true, start_date: true, end_date: true, seats_used: true, seats_limit: true, auto_renew: true },
      }),
    ]);
    if (!organization) throw new NotFoundException('Organisation not found');

    return {
      organization,
      subscription,
      payments_enabled: this.billing.paymentsEnabled() && this.paystack.isConfigured(),
      // True when payments were switched off on purpose (as opposed to simply not set up yet).
      payments_disabled: !this.billing.paymentsEnabled(),
      plans: await Promise.all(
        (this.billing.paymentsEnabled() ? this.billing.plans() : []).map(async (plan) => {
          // What switching to this plan would cost today, and why it can't be done yet if it can't.
          let quote: { charge: number; credit: number } | null = null;
          let blocked: string | null = null;
          try {
            const pr = await this.prorate(organizationId, plan);
            if (pr) quote = { charge: pr.charge, credit: pr.credit };
          } catch (err) {
            blocked = (err as HttpException).message;
          }
          return { slug: plan.slug, name: plan.name, description: plan.description ?? null, seats: plan.seats, amount: plan.amount, currency: plan.currency, billing_cycle: plan.billing_cycle, switch_charge: quote?.charge ?? null, switch_credit: quote?.credit ?? null, blocked };
        }),
      ),
    };
  }

  async checkoutSubscription(payer: Payer, organizationId: string, planSlug: string, origin?: string) {
    if (!this.billing.paymentsEnabled()) throw disabled();
    if (!this.paystack.isConfigured()) throw unavailable();
    requireVerifiedEmail(payer);
    await this.requireBilling(payer.id, organizationId);

    const plan = this.billing.plan(planSlug);
    if (!plan) throw new NotFoundException('That plan isn’t available');

    const org = await this.prisma.organization.findFirst({ where: { id: organizationId, deleted_at: null }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('Organisation not found');

    const proration = await this.prorate(org.id, plan);
    const charge = proration?.charge ?? plan.amount;

    const reference = this.newReference();
    const payment = await this.prisma.payment.create({
      data: {
        organization_id: org.id,
        user_id: payer.id,
        amount: charge,
        currency: plan.currency,
        status: 'pending',
        payment_method: 'paystack',
        provider_reference: reference,
        paystack_reference: reference,
        payment_type: 'subscription',
        subscription_plan: plan.slug,
        description: proration ? `${plan.name} plan for ${org.name} (switch from ${proration.from}, ${proration.credit} ${plan.currency} credit for the days left)` : `${plan.name} plan for ${org.name}`,
        // A snapshot, so activation uses the plan as it was when the customer agreed to it. `amount` is the full list price.
        metadata: { plan: { slug: plan.slug, name: plan.name, seats: plan.seats, billing_cycle: plan.billing_cycle, amount: plan.amount }, ...(proration && { proration: { from: proration.from, credit: proration.credit } }) } satisfies Prisma.JsonObject,
      },
    });

    const init = await this.startTransaction(payment, payer, origin, { type: 'subscription', organization_id: org.id, plan: plan.slug });
    return { authorization_url: init.authorization_url, reference, amount: charge, currency: plan.currency, credit: proration?.credit ?? 0 };
  }

  /**
   * Switching to a different plan while one is running: the days left on the old plan are credited against the new price
   * and the new period starts today (instead of stacking on top). Buying the same plan again is a plain renewal.
   * Credit = old price x (days left / one period), capped at one period; the charge never drops below 10% of the new price.
   * ponytail: one nominal period length per cycle (30/90/365 days), no per-day ledger.
   */
  private async prorate(organizationId: string, plan: PlanDefinition) {
    const [sub, org] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { organization_id: organizationId } }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { subscription_plan: true } }),
    ]);
    if (!sub || sub.status !== 'active' || sub.end_date.getTime() <= Date.now() || org?.subscription_plan === plan.slug) return null;

    const [team, waiting] = await Promise.all([
      this.prisma.organizationMember.count({ where: { organization_id: organizationId, status: 'active', deleted_at: null } }),
      this.prisma.employeeInvitation.count({ where: { organization_id: organizationId, status: 'pending', expires_at: { gt: new Date() } } }),
    ]);
    if (team + waiting > plan.seats) {
      throw new HttpException({ statusCode: HttpStatus.CONFLICT, code: 'PLAN_TOO_SMALL', message: `${plan.name} has ${plan.seats} seats but ${team + waiting} are in use (people and waiting invitations). Remove some first, or choose a bigger plan.` }, HttpStatus.CONFLICT);
    }

    const periodMs = (sub.billing_cycle === 'monthly' ? 30 : sub.billing_cycle === 'quarterly' ? 90 : 365) * 86_400_000;
    const fraction = Math.min(1, (sub.end_date.getTime() - Date.now()) / periodMs);
    const credit = Math.round(sub.amount * fraction * 100) / 100;
    const charge = Math.max(Math.round((plan.amount - credit) * 100) / 100, Math.round(plan.amount * 10) / 100);
    return { from: sub.plan_name, credit: Math.round((plan.amount - charge) * 100) / 100, charge };
  }

  // ------------------------------------------------------------ reconciliation

  /**
   * Settles a payment by asking Paystack what really happened (never trusting the browser or even the webhook body).
   * Safe to call any number of times and from several places at once: only one caller performs the side effects.
   */
  async reconcile(reference: string): Promise<{ status: ReconcileStatus; paymentId: string | null }> {
    const payment = await this.prisma.payment.findUnique({
      where: { provider_reference: reference },
      include: { user: { select: { id: true, email: true, first_name: true } } },
    });
    if (!payment) return { status: 'unknown', paymentId: null };
    if (payment.status === 'success') return { status: 'success', paymentId: payment.id };

    const tx = await this.paystack.verify(reference);

    if (tx.status === 'success') {
      if (tx.amount !== toMinorUnits(payment.amount) || tx.currency.toUpperCase() !== payment.currency) {
        this.logger.error(
          `Payment ${reference} amount mismatch: expected ${toMinorUnits(payment.amount)} ${payment.currency}, Paystack reports ${tx.amount} ${tx.currency}`,
        );
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: 'pending' },
          data: { status: 'failed', processed_at: new Date(), description: 'Amount or currency did not match the order; not granted.' },
        });
        return { status: 'failed', paymentId: payment.id };
      }

      const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
      const claimed = await this.prisma.$transaction(async (tx2) => {
        const won = await tx2.payment.updateMany({
          where: { id: payment.id, status: { in: ['pending', 'failed'] } },
          data: { status: 'success', processed_at: paidAt, payment_method: tx.channel ?? payment.payment_method, paystack_reference: tx.reference },
        });
        if (won.count === 1 && payment.payment_type === 'subscription' && payment.organization_id) {
          await this.activateSubscription(tx2, payment);
        }
        return won.count === 1;
      });

      if (claimed) await this.sendReceipt(payment, paidAt);
      return { status: 'success', paymentId: payment.id };
    }

    if (['failed', 'abandoned', 'reversed'].includes(tx.status)) {
      await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'failed', processed_at: new Date() } });
      return { status: 'failed', paymentId: payment.id };
    }

    return { status: 'pending', paymentId: payment.id };
  }

  private async activateSubscription(
    tx: Prisma.TransactionClient,
    payment: { organization_id: string | null; subscription_plan: string | null; amount: number; currency: string; metadata: Prisma.JsonValue },
  ) {
    const snapshot = ((payment.metadata as any)?.plan ?? {}) as Partial<PlanDefinition>;
    const organizationId = payment.organization_id as string;
    const cycle = snapshot.billing_cycle ?? 'monthly';
    const seats = snapshot.seats ?? 10;
    const planName = snapshot.name ?? payment.subscription_plan ?? 'Plan';
    const now = new Date();

    const existing = await tx.subscription.findUnique({ where: { organization_id: organizationId } });
    // Paying again before expiry extends the current period instead of wasting the days left.
    // A plan switch (prorated) already credited the days left, so its period starts today.
    const switched = !!(payment.metadata as any)?.proration;
    const from = !switched && existing && existing.status === 'active' && existing.end_date > now ? existing.end_date : now;
    const listPrice = snapshot.amount ?? payment.amount;
    const end = addBillingPeriod(from, cycle);

    await tx.subscription.upsert({
      where: { organization_id: organizationId },
      create: {
        organization_id: organizationId,
        plan_name: planName,
        status: 'active',
        billing_cycle: cycle,
        amount: listPrice,
        currency: payment.currency,
        start_date: now,
        end_date: end,
        auto_renew: false,
        seats_used: 0,
        seats_limit: seats,
      },
      update: {
        plan_name: planName,
        status: 'active',
        billing_cycle: cycle,
        amount: listPrice,
        currency: payment.currency,
        end_date: end,
        seats_limit: seats,
        cancelled_at: null,
        // A renewed plan starts its warnings again.
        last_expiry_notice: null,
      },
    });

    await tx.organization.update({
      where: { id: organizationId },
      data: { subscription_plan: payment.subscription_plan ?? planName, subscription_status: 'active', subscription_end_date: end, max_employees: seats },
    });
  }

  private async sendReceipt(
    payment: { user: Payer | null; description: string | null; amount: number; currency: string; provider_reference: string; payment_type: string },
    paidAt: Date,
  ) {
    if (!payment.user) return;
    const path = payment.payment_type === 'assessment' ? '/assessments/full' : '/dashboard';
    await this.mail.sendPaymentReceipt(payment.user.email, {
      first_name: payment.user.first_name,
      description: payment.description ?? 'Personnelq',
      amount: formatMoney(payment.amount, payment.currency),
      reference: payment.provider_reference,
      paid_at: paidAt,
      link: `${this.billing.frontendUrl}${path}`,
    });
  }

  // ------------------------------------------------------------ verification + history

  /** Called when the customer returns from Paystack. Only the person who started the payment can check it. */
  async verifyForUser(userId: string, reference: string) {
    const owned = await this.prisma.payment.findFirst({ where: { provider_reference: reference, user_id: userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Payment not found');

    let outcome: { status: ReconcileStatus; paymentId: string | null };
    try {
      outcome = await this.reconcile(reference);
    } catch (err) {
      // Paystack unreachable: report "still processing" so the page can try again, rather than a false failure.
      this.logger.warn(`Could not verify ${reference} right now: ${(err as Error).message}`);
      outcome = { status: 'pending', paymentId: owned.id };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: owned.id },
      select: { provider_reference: true, amount: true, currency: true, status: true, payment_type: true, description: true, assessment_id: true, processed_at: true },
    });
    return {
      status: outcome.status,
      payment: payment && {
        reference: payment.provider_reference,
        amount: payment.amount,
        currency: payment.currency,
        type: payment.payment_type,
        description: payment.description,
        paid_at: payment.processed_at,
      },
      next: payment?.payment_type === 'assessment' ? { href: '/assessments/full' } : { href: '/dashboard' },
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 100,
      // Gateway secrets (authorization_url, access_code) are never returned.
      select: {
        id: true,
        provider_reference: true,
        amount: true,
        currency: true,
        status: true,
        payment_type: true,
        payment_method: true,
        description: true,
        created_at: true,
        processed_at: true,
      },
    });
    return { data: rows.map(({ provider_reference, ...rest }) => ({ ...rest, reference: provider_reference })) };
  }
}
