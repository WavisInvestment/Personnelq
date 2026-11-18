import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { PaymentsService } from './payments.service';
import { PaystackError } from './paystack.client';

const ENV: Record<string, string> = {
  PAYSTACK_SECRET_KEY: 'sk_test_abcdef1234567890',
  FULL_ASSESSMENT_PRICE: '5000',
  PAYMENT_CURRENCY: 'NGN',
  FRONTEND_URL: 'https://app.example.com',
  NODE_ENV: 'production',
  SUBSCRIPTION_PLANS: JSON.stringify([{ slug: 'team', name: 'Team', seats: 25, amount: 50000, billing_cycle: 'monthly' }]),
};

const USER = { id: 'u1', email: 'ada@example.com', first_name: 'Ada' };
const eligible = {
  assessment: { id: 'a-full', name: 'Full personality assessment', type: 'full_assessment' },
  requiresPayment: true,
  hasInProgress: false,
  retakeLocked: false,
  retakeAvailableAt: null,
  hasPaidAttempt: false,
};

function setup(env: Record<string, string | undefined> = {}) {
  const config = { ...ENV, ...env };
  const get = (k: string) => config[k];
  const prisma: any = {
    payment: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), },
    subscription: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    organization: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    organizationMember: { count: jest.fn().mockResolvedValue(0) },
    employeeInvitation: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const billing = new BillingConfigService({ get } as any);
  // Same rule the real client uses, so "configured" means the same thing in tests as in production.
  const paystack = { isConfigured: jest.fn(() => billing.paystackConfigured()), initialize: jest.fn(), verify: jest.fn() };
  const assessments = { checkoutEligibility: jest.fn().mockResolvedValue(eligible) };
  const rbac = { permissionsInOrganization: jest.fn().mockResolvedValue(['manage:billing']) };
  const mail = { sendPaymentReceipt: jest.fn().mockResolvedValue('sent') };
  const service = new PaymentsService(prisma, billing, paystack as any, assessments as any, rbac as any, mail as any, { get } as any);

  prisma.payment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay-1', ...data }));
  paystack.initialize.mockResolvedValue({ authorization_url: 'https://checkout.paystack.test/abc', access_code: 'ac', reference: 'ignored' });
  return { prisma, paystack, assessments, rbac, mail, service };
}

const pendingPayment = (over: object = {}) => ({
  id: 'pay-1',
  user_id: 'u1',
  organization_id: null,
  amount: 5000,
  currency: 'NGN',
  status: 'pending',
  payment_method: 'paystack',
  provider_reference: 'pb_ref1',
  payment_type: 'assessment',
  subscription_plan: null,
  description: 'Full personality assessment',
  metadata: {},
  user: USER,
  ...over,
});

describe('PaymentsService with payments switched off', () => {
  const OFF = { PAYMENTS_ENABLED: 'false' };

  it('refuses to start an assessment checkout (503 PAYMENTS_DISABLED) even with the keys and price configured', async () => {
    const { service, prisma, paystack, assessments } = setup(OFF);
    const e: any = await service.checkoutAssessment(USER, 'a-full').catch((x) => x);
    expect(e.getStatus()).toBe(503);
    expect(e.getResponse()).toMatchObject({ code: 'PAYMENTS_DISABLED' });
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(paystack.initialize).not.toHaveBeenCalled();
    expect(assessments.checkoutEligibility).not.toHaveBeenCalled();
  });

  it('refuses to start a company plan checkout the same way, before checking billing rights', async () => {
    const { service, prisma, paystack, rbac } = setup(OFF);
    const e: any = await service.checkoutSubscription(USER, 'org-1', 'team').catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'PAYMENTS_DISABLED' });
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(paystack.initialize).not.toHaveBeenCalled();
    expect(rbac.permissionsInOrganization).not.toHaveBeenCalled();
  });

  it('tells the billing page payments are off on purpose, with no plans to sell', async () => {
    const { service, prisma } = setup(OFF);
    prisma.organization.findFirst.mockResolvedValue({ id: 'org-1', name: 'Acme', type: 'corporate' });
    const out = await service.billingOverview('u1', 'org-1');
    expect(out).toMatchObject({ payments_enabled: false, payments_disabled: true, plans: [] });
  });

  it('still settles a payment that was already in flight when payments were switched off', async () => {
    const { service, prisma, paystack } = setup(OFF);
    prisma.payment.findUnique.mockResolvedValue(pendingPayment());
    paystack.verify.mockResolvedValue({ status: 'success', reference: 'pb_ref1', amount: 500000, currency: 'NGN', paid_at: new Date().toISOString(), channel: 'card' });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.reconcile('pb_ref1')).toMatchObject({ status: 'success' });
    expect(prisma.payment.updateMany).toHaveBeenCalled();
  });

  it('keeps the payment history readable', async () => {
    const { service, prisma } = setup(OFF);
    prisma.payment.findMany = jest.fn().mockResolvedValue([]);
    await expect(service.listMine('u1')).resolves.toEqual({ data: [] });
  });
});

describe('PaymentsService', () => {
  describe('checkoutAssessment', () => {
    it('refuses when no price is configured (never invents one)', async () => {
      const { service, prisma } = setup({ FULL_ASSESSMENT_PRICE: undefined });
      await expect(service.checkoutAssessment(USER, 'a-full')).rejects.toMatchObject({ status: 503 });
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('refuses when Paystack is not configured', async () => {
      const { service, prisma } = setup({ PAYSTACK_SECRET_KEY: 'sk_test_xxxxx' });
      await expect(service.checkoutAssessment(USER, 'a-full')).rejects.toMatchObject({ status: 503 });
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('sets the amount on the server and sends it to Paystack in kobo', async () => {
      const { service, prisma, paystack } = setup();

      const result = await service.checkoutAssessment(USER, 'a-full');

      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
        user_id: 'u1',
        organization_id: null,
        amount: 5000,
        currency: 'NGN',
        status: 'pending',
        payment_type: 'assessment',
        assessment_id: 'a-full',
      });
      expect(paystack.initialize.mock.calls[0][0]).toMatchObject({ email: 'ada@example.com', amount: 500000, currency: 'NGN' });
      expect(result).toMatchObject({ authorization_url: 'https://checkout.paystack.test/abc', amount: 5000, currency: 'NGN' });
      expect(result.reference).toMatch(/^pb_[0-9a-f]{24}$/);
      expect(paystack.initialize.mock.calls[0][0].reference).toBe(result.reference);
    });

    it('does not take money for something that is free, in progress, locked or already paid', async () => {
      for (const [override, status, code] of [
        [{ requiresPayment: false }, 400, 'NO_PAYMENT_NEEDED'],
        [{ hasInProgress: true }, 409, 'ATTEMPT_IN_PROGRESS'],
        [{ retakeLocked: true, retakeAvailableAt: new Date() }, 409, 'RETAKE_LOCKED'],
        [{ hasPaidAttempt: true }, 409, 'ALREADY_PAID'],
      ] as const) {
        const { service, prisma, assessments } = setup();
        assessments.checkoutEligibility.mockResolvedValue({ ...eligible, ...override });
        const error: any = await service.checkoutAssessment(USER, 'a-full').catch((e) => e);
        expect(error.getStatus()).toBe(status);
        expect(error.getResponse().code).toBe(code);
        expect(prisma.payment.create).not.toHaveBeenCalled();
      }
    });

    it('reuses a recent unpaid checkout instead of creating a second charge', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findFirst.mockResolvedValue(pendingPayment({ authorization_url: 'https://checkout.paystack.test/existing' }));

      const result = await service.checkoutAssessment(USER, 'a-full');

      expect(result).toMatchObject({ authorization_url: 'https://checkout.paystack.test/existing', reference: 'pb_ref1' });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(paystack.initialize).not.toHaveBeenCalled();
    });

    it('marks the payment failed and returns 502 if Paystack cannot start it', async () => {
      const { service, prisma, paystack } = setup();
      paystack.initialize.mockRejectedValue(new PaystackError('Gateway timeout', 504));

      const error: any = await service.checkoutAssessment(USER, 'a-full').catch((e) => e);

      expect(error.getStatus()).toBe(502);
      expect(error.getResponse().code).toBe('PAYMENT_PROVIDER_ERROR');
      expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
    });

    describe('return address', () => {
      it('uses the website itself', async () => {
        const { service, paystack } = setup();
        await service.checkoutAssessment(USER, 'a-full', 'https://app.example.com');
        expect(paystack.initialize.mock.calls[0][0].callback_url).toBe('https://app.example.com/payments/callback');
      });

      it('never sends the customer to an address that is not the website (no open redirect)', async () => {
        const { service, paystack } = setup();
        await service.checkoutAssessment(USER, 'a-full', 'https://evil.example.com');
        expect(paystack.initialize.mock.calls[0][0].callback_url).toBe('https://app.example.com/payments/callback');
      });

      it('lets a phone on the local network return to itself outside production', async () => {
        const { service, paystack } = setup({ NODE_ENV: 'development' });
        await service.checkoutAssessment(USER, 'a-full', 'http://192.168.1.100:3000');
        expect(paystack.initialize.mock.calls[0][0].callback_url).toBe('http://192.168.1.100:3000/payments/callback');
      });

      it('does not trust local-network addresses in production', async () => {
        const { service, paystack } = setup();
        await service.checkoutAssessment(USER, 'a-full', 'http://192.168.1.100:3000');
        expect(paystack.initialize.mock.calls[0][0].callback_url).toBe('https://app.example.com/payments/callback');
      });
    });
  });

  describe('reconcile', () => {
    const success = (over: object = {}) => ({ status: 'success', reference: 'pb_ref1', amount: 500000, currency: 'NGN', paid_at: '2026-10-01T10:00:00.000Z', channel: 'card', customer_email: 'ada@example.com', ...over });

    it('returns "unknown" for a reference we never issued, without calling Paystack', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(null);
      expect(await service.reconcile('pb_nope')).toEqual({ status: 'unknown', paymentId: null });
      expect(paystack.verify).not.toHaveBeenCalled();
    });

    it('does nothing more for a payment that is already settled', async () => {
      const { service, prisma, paystack, mail } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment({ status: 'success' }));
      expect(await service.reconcile('pb_ref1')).toMatchObject({ status: 'success' });
      expect(paystack.verify).not.toHaveBeenCalled();
      expect(mail.sendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('settles a verified payment once and emails a receipt', async () => {
      const { service, prisma, paystack, mail } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success());
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.reconcile('pb_ref1');

      expect(result).toEqual({ status: 'success', paymentId: 'pay-1' });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: { in: ['pending', 'failed'] } },
        data: expect.objectContaining({ status: 'success', payment_method: 'card' }),
      });
      expect(mail.sendPaymentReceipt).toHaveBeenCalledTimes(1);
      expect(mail.sendPaymentReceipt.mock.calls[0]).toEqual([
        'ada@example.com',
        expect.objectContaining({ reference: 'pb_ref1', description: 'Full personality assessment', link: 'https://app.example.com/assessments/full' }),
      ]);
    });

    it('lets only one of two simultaneous confirmations act (webhook and browser racing)', async () => {
      const { service, prisma, paystack, mail } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success());
      prisma.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); // second caller loses

      const [a, b] = await Promise.all([service.reconcile('pb_ref1'), service.reconcile('pb_ref1')]);

      expect(a.status).toBe('success');
      expect(b.status).toBe('success');
      expect(mail.sendPaymentReceipt).toHaveBeenCalledTimes(1);
    });

    it('never grants a payment when the amount does not match what was ordered', async () => {
      const { service, prisma, paystack, mail } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success({ amount: 100 })); // paid 1 naira, not 5000

      const result = await service.reconcile('pb_ref1');

      expect(result.status).toBe('failed');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: 'pending' },
        data: expect.objectContaining({ status: 'failed' }),
      });
      expect(mail.sendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('never grants a payment made in the wrong currency', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success({ currency: 'USD' }));
      expect((await service.reconcile('pb_ref1')).status).toBe('failed');
    });

    it.each(['failed', 'abandoned', 'reversed'])('records a Paystack "%s" as failed', async (status) => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success({ status }));
      expect((await service.reconcile('pb_ref1')).status).toBe('failed');
    });

    it.each(['pending', 'ongoing', 'queued'])('leaves a Paystack "%s" payment pending', async (status) => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success({ status }));
      expect((await service.reconcile('pb_ref1')).status).toBe('pending');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('still settles even if the receipt email cannot be sent', async () => {
      const { service, prisma, paystack, mail } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment());
      paystack.verify.mockResolvedValue(success());
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mail.sendPaymentReceipt.mockResolvedValue('failed');
      expect((await service.reconcile('pb_ref1')).status).toBe('success');
    });
  });

  describe('company subscriptions', () => {
    const org = { id: 'org-1', name: 'Acme Logistics' };

    it('only lets a company administrator manage billing', async () => {
      const { service, rbac } = setup();
      rbac.permissionsInOrganization.mockResolvedValue(['take:assessments']); // an ordinary employee
      await expect(service.billingOverview('u1', 'org-1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.checkoutSubscription(USER, 'org-1', 'team')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a plan that is not configured', async () => {
      const { service } = setup();
      await expect(service.checkoutSubscription(USER, 'org-1', 'enterprise')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('charges the configured plan price and snapshots the plan on the payment', async () => {
      const { service, prisma, paystack } = setup();
      prisma.organization.findFirst.mockResolvedValue(org);

      await service.checkoutSubscription(USER, 'org-1', 'team');

      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
        organization_id: 'org-1',
        amount: 50000,
        payment_type: 'subscription',
        subscription_plan: 'team',
        metadata: { plan: { slug: 'team', name: 'Team', seats: 25, billing_cycle: 'monthly', amount: 50000 } },
      });
      expect(paystack.initialize.mock.calls[0][0].amount).toBe(5000000);
    });

    describe('switching plans', () => {
      const TWO = JSON.stringify([
        { slug: 'team', name: 'Team', seats: 25, amount: 50000, billing_cycle: 'monthly' },
        { slug: 'big', name: 'Big', seats: 100, amount: 120000, billing_cycle: 'monthly' },
      ]);
      const running = (days: number) => ({ status: 'active', plan_name: 'Team', billing_cycle: 'monthly', amount: 50000, end_date: new Date(Date.now() + days * 86_400_000) });

      it('credits the days left on the old plan against the new price', async () => {
        const { service, prisma } = setup({ SUBSCRIPTION_PLANS: TWO });
        prisma.organization.findFirst.mockResolvedValue(org);
        prisma.organization.findUnique.mockResolvedValue({ subscription_plan: 'team' });
        prisma.subscription.findUnique.mockResolvedValue(running(15));

        const out = await service.checkoutSubscription(USER, 'org-1', 'big');

        expect(out.credit).toBe(25000);
        expect(out.amount).toBe(95000);
        expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 95000, metadata: { plan: { amount: 120000 }, proration: { from: 'Team', credit: 25000 } } });
      });

      it('charges the full price when renewing the same plan, and never less than 10% of the new price', async () => {
        const { service, prisma } = setup({ SUBSCRIPTION_PLANS: TWO });
        prisma.organization.findFirst.mockResolvedValue(org);
        prisma.subscription.findUnique.mockResolvedValue(running(15));
        prisma.organization.findUnique.mockResolvedValue({ subscription_plan: 'team' });
        expect((await service.checkoutSubscription(USER, 'org-1', 'team')).amount).toBe(50000);

        prisma.organization.findUnique.mockResolvedValue({ subscription_plan: 'big' });
        prisma.subscription.findUnique.mockResolvedValue({ ...running(30), amount: 500000 });
        expect((await service.checkoutSubscription(USER, 'org-1', 'team')).amount).toBe(5000);
      });

      it('refuses a plan with fewer seats than are in use', async () => {
        const { service, prisma } = setup({ SUBSCRIPTION_PLANS: TWO });
        prisma.organization.findFirst.mockResolvedValue(org);
        prisma.organization.findUnique.mockResolvedValue({ subscription_plan: 'big' });
        prisma.subscription.findUnique.mockResolvedValue({ ...running(10), plan_name: 'Big', amount: 120000 });
        prisma.organizationMember.count.mockResolvedValue(30);
        await expect(service.checkoutSubscription(USER, 'org-1', 'team')).rejects.toMatchObject({ response: { code: 'PLAN_TOO_SMALL' } });
        expect(prisma.payment.create).not.toHaveBeenCalled();
      });

      it('starts the new period today and records the list price, instead of stacking on the old end', async () => {
        const { service, prisma, paystack } = setup({ SUBSCRIPTION_PLANS: TWO });
        prisma.payment.findUnique.mockResolvedValue(pendingPayment({ organization_id: 'org-1', amount: 95000, payment_type: 'subscription', subscription_plan: 'big', metadata: { plan: { slug: 'big', name: 'Big', seats: 100, billing_cycle: 'monthly', amount: 120000 }, proration: { from: 'Team', credit: 25000 } } }));
        prisma.subscription.findUnique.mockResolvedValue(running(15));
        paystack.verify.mockResolvedValue({ status: 'success', reference: 'pb_ref1', amount: 9500000, currency: 'NGN', paid_at: new Date().toISOString(), channel: 'card' });
        prisma.payment.updateMany.mockResolvedValue({ count: 1 });

        await service.reconcile('pb_ref1');

        const upsert = prisma.subscription.upsert.mock.calls[0][0];
        expect(upsert.update.amount).toBe(120000);
        expect(upsert.update.end_date.getTime()).toBeLessThan(Date.now() + 32 * 86_400_000);
        expect(upsert.update.end_date.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
      });
    });

    it('activates the subscription and company limits when the payment is confirmed', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(
        pendingPayment({
          organization_id: 'org-1',
          amount: 50000,
          payment_type: 'subscription',
          subscription_plan: 'team',
          metadata: { plan: { slug: 'team', name: 'Team', seats: 25, billing_cycle: 'monthly' } },
        }),
      );
      paystack.verify.mockResolvedValue({ status: 'success', reference: 'pb_ref1', amount: 5000000, currency: 'NGN', paid_at: null, channel: 'card', customer_email: null });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcile('pb_ref1');

      const upsert = prisma.subscription.upsert.mock.calls[0][0];
      expect(upsert.create).toMatchObject({ organization_id: 'org-1', plan_name: 'Team', status: 'active', billing_cycle: 'monthly', seats_limit: 25, auto_renew: false });
      expect(upsert.create.end_date.getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({ subscription_plan: 'team', subscription_status: 'active', max_employees: 25 }),
      });
    });

    it('extends an active subscription from its current end instead of wasting the days left', async () => {
      const { service, prisma, paystack } = setup();
      const currentEnd = new Date(Date.now() + 10 * 86400000);
      prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: currentEnd });
      prisma.payment.findUnique.mockResolvedValue(
        pendingPayment({ organization_id: 'org-1', amount: 50000, payment_type: 'subscription', subscription_plan: 'team', metadata: { plan: { slug: 'team', name: 'Team', seats: 25, billing_cycle: 'monthly' } } }),
      );
      paystack.verify.mockResolvedValue({ status: 'success', reference: 'pb_ref1', amount: 5000000, currency: 'NGN', paid_at: null, channel: 'card', customer_email: null });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcile('pb_ref1');

      const newEnd: Date = prisma.subscription.upsert.mock.calls[0][0].update.end_date;
      expect(newEnd.getTime()).toBeGreaterThan(currentEnd.getTime() + 27 * 86400000);
    });

    it('does not activate anything when the confirming caller lost the race', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(pendingPayment({ organization_id: 'org-1', amount: 50000, payment_type: 'subscription', subscription_plan: 'team', metadata: { plan: { slug: 'team', name: 'Team', seats: 25, billing_cycle: 'monthly' } } }));
      paystack.verify.mockResolvedValue({ status: 'success', reference: 'pb_ref1', amount: 5000000, currency: 'NGN', paid_at: null, channel: 'card', customer_email: null });
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.reconcile('pb_ref1');

      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('lists the configured plans to a company admin, with the current subscription', async () => {
      const { service, prisma } = setup();
      prisma.organization.findFirst.mockResolvedValue({ id: 'org-1', name: 'Acme', type: 'corporate' });
      prisma.subscription.findUnique.mockResolvedValue({ plan_name: 'Team', status: 'active', end_date: new Date(Date.now() + 86_400_000) });
      prisma.organization.findUnique.mockResolvedValue({ subscription_plan: 'team' });

      const overview = await service.billingOverview('u1', 'org-1');

      expect(overview.plans).toEqual([{ slug: 'team', name: 'Team', description: null, seats: 25, amount: 50000, currency: 'NGN', billing_cycle: 'monthly', switch_charge: null, switch_credit: null, blocked: null }]);
      expect(overview.subscription).toMatchObject({ plan_name: 'Team' });
      expect(overview.payments_enabled).toBe(true);
    });
  });

  describe('verifyForUser', () => {
    it('404s for a payment that belongs to someone else (without revealing it exists)', async () => {
      const { service, prisma } = setup();
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(service.verifyForUser('intruder', 'pb_ref1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.payment.findFirst.mock.calls[0][0].where).toMatchObject({ provider_reference: 'pb_ref1', user_id: 'intruder' });
    });

    it('reports "still processing" instead of a false failure when Paystack cannot be reached', async () => {
      const { service, prisma, paystack } = setup();
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.findUnique
        .mockResolvedValueOnce(pendingPayment()) // inside reconcile
        .mockResolvedValueOnce({ provider_reference: 'pb_ref1', amount: 5000, currency: 'NGN', status: 'pending', payment_type: 'assessment', description: 'x', assessment_id: 'a', processed_at: null });
      paystack.verify.mockRejectedValue(new PaystackError('timeout'));

      const result = await service.verifyForUser('u1', 'pb_ref1');

      expect(result.status).toBe('pending');
    });
  });

  describe('listMine', () => {
    it('lists only the caller’s payments and never selects gateway secrets', async () => {
      const { service, prisma } = setup();
      prisma.payment.findMany = jest.fn().mockResolvedValue([{ id: 'p', provider_reference: 'pb_1', amount: 5000 }]);

      const { data } = await service.listMine('u1');

      const args = prisma.payment.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ user_id: 'u1' });
      expect(args.select).not.toHaveProperty('authorization_url');
      expect(args.select).not.toHaveProperty('access_code');
      expect(args.select).not.toHaveProperty('metadata');
      expect(data[0]).toMatchObject({ reference: 'pb_1' });
      expect(data[0]).not.toHaveProperty('provider_reference');
    });
  });
});

describe('HttpException shape', () => {
  it('payment-unavailable errors carry a machine-readable code the UI can branch on', async () => {
    const { service } = setup({ FULL_ASSESSMENT_PRICE: undefined });
    const error: any = await service.checkoutAssessment(USER, 'a-full').catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getResponse()).toMatchObject({ code: 'PAYMENT_UNAVAILABLE' });
  });
});

describe('conflict responses', () => {
  it('RETAKE_LOCKED includes when the retake opens', async () => {
    const { service, assessments } = setup();
    const when = new Date('2027-01-01T00:00:00Z');
    assessments.checkoutEligibility.mockResolvedValue({ ...eligible, retakeLocked: true, retakeAvailableAt: when });
    const error: any = await service.checkoutAssessment(USER, 'a-full').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().retake_available_at).toEqual(when);
  });
});
