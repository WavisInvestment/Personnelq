import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { PaymentsService } from './payments.service';
import { PaystackError } from './paystack.client';

const ENV: Record<string, string> = { PAYSTACK_SECRET_KEY: 'sk_test_abcdef1234567890', FULL_ASSESSMENT_PRICE: '5000', PAYMENT_CURRENCY: 'NGN', FRONTEND_URL: 'https://app.example.com', NODE_ENV: 'production' };
const old = new Date('2026-09-01T00:00:00Z');

function setup(env: Record<string, string | undefined> = {}) {
  const config = { ...ENV, ...env };
  const get = (k: string) => config[k];
  const prisma: any = {
    payment: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscription: { updateMany: jest.fn() },
    organization: { update: jest.fn() },
  };
  const billing = new BillingConfigService({ get } as any);
  const paystack = { isConfigured: jest.fn(() => billing.paystackConfigured()), refund: jest.fn().mockResolvedValue({ id: '77', status: 'pending', amount: 500000 }) };
  const mail = { sendRefundNotice: jest.fn().mockResolvedValue('sent') };
  const service = new PaymentsService(prisma, billing, paystack as any, {} as any, {} as any, mail as any, { get } as any);
  return { prisma, paystack, mail, service };
}
const payment = (over: object = {}) => ({
  id: 'p1', status: 'success', amount: 5000, currency: 'NGN', provider_reference: 'pb_ref', payment_type: 'assessment', organization_id: null, description: 'Full assessment', created_at: old, metadata: { assessment_id: 'a' },
  user: { id: 'u1', email: 'ada@x.test', first_name: 'Ada' }, ...over,
});

describe('PaymentsService.refund', () => {
  it('claims the payment first, asks Paystack, then marks it refunded with the details and emails the payer', async () => {
    const { service, prisma, paystack, mail } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    await expect(service.refund('p1', 'Charged twice')).resolves.toEqual({ id: 'p1', status: 'refunded', refund_status: 'pending' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', status: 'success' }, data: { status: 'refund_pending' } });
    expect(paystack.refund).toHaveBeenCalledWith('pb_ref');
    const done = prisma.payment.update.mock.calls[0][0].data;
    expect(done.status).toBe('refunded');
    expect(done.metadata).toMatchObject({ assessment_id: 'a', refund: { id: '77', status: 'pending', amount: 500000, reason: 'Charged twice' } });
    expect(mail.sendRefundNotice).toHaveBeenCalledWith('ada@x.test', expect.objectContaining({ first_name: 'Ada', description: 'Full assessment' }));
  });

  it('refuses anything that is not a successful payment, and a payment someone else is already refunding', async () => {
    for (const status of ['pending', 'failed', 'refunded', 'refund_pending']) {
      const { service, prisma, paystack } = setup();
      prisma.payment.findUnique.mockResolvedValue(payment({ status }));
      await expect(service.refund('p1', 'reason here')).rejects.toBeInstanceOf(ConflictException);
      expect(paystack.refund).not.toHaveBeenCalled();
    }
    const raced = setup();
    raced.prisma.payment.findUnique.mockResolvedValue(payment());
    raced.prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(raced.service.refund('p1', 'reason here')).rejects.toMatchObject({ response: { code: 'NOT_REFUNDABLE' } });
    expect(raced.paystack.refund).not.toHaveBeenCalled();
    const none = setup();
    none.prisma.payment.findUnique.mockResolvedValue(null);
    await expect(none.service.refund('nope', 'reason here')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('puts the payment back to success when Paystack refuses, so it can be tried again', async () => {
    const { service, prisma, paystack, mail } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    paystack.refund.mockRejectedValue(new PaystackError('Transaction has already been fully reversed'));
    const err: any = await service.refund('p1', 'reason here').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getResponse()).toMatchObject({ code: 'REFUND_FAILED' });
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({ where: { id: 'p1', status: 'refund_pending' }, data: { status: 'success' } });
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(mail.sendRefundNotice).not.toHaveBeenCalled();
  });

  it('says plainly when payments are not set up', async () => {
    const { service } = setup({ PAYSTACK_SECRET_KEY: undefined });
    await expect(service.refund('p1', 'reason here')).rejects.toBeInstanceOf(HttpException);
  });

  it('ends the plan when the refunded payment was the one funding the current period', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ payment_type: 'subscription', organization_id: 'o1' }));
    prisma.payment.findFirst.mockResolvedValue(null); // no other successful plan payment
    await service.refund('p1', 'reason here');
    expect(prisma.subscription.updateMany.mock.calls[0][0]).toMatchObject({ where: { organization_id: 'o1' }, data: { status: 'cancelled', end_date: expect.any(Date) } });
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ subscription_status: 'inactive' });
  });

  it('leaves the plan alone when a later plan payment still covers it', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment({ payment_type: 'subscription', organization_id: 'o1' }));
    prisma.payment.findFirst.mockResolvedValue({ created_at: new Date('2026-10-01T00:00:00Z') });
    await service.refund('p1', 'reason here');
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('a refunded assessment payment does not touch any plan', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue(payment());
    await service.refund('p1', 'reason here');
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});
