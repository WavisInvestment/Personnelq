import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { WebhookEventsService } from './webhook-events.service';

const SECRET = 'sk_test_abcdef1234567890';
const sign = (body: string, secret = SECRET) => createHmac('sha512', secret).update(body).digest('hex');
const req = (body: string) => ({ rawBody: Buffer.from(body) }) as any;

function setup(secret: string | null = SECRET) {
  const payments = { reconcile: jest.fn().mockResolvedValue({ status: 'success', paymentId: 'p' }) };
  // a small in-memory stand-in for the event table
  const rows = new Map<string, any>();
  const key = (w: any) => w.provider_dedupe_key.dedupe_key;
  const prisma: any = {
    webhookEvent: {
      findUnique: jest.fn(async ({ where }: any) => rows.get(key(where)) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => rows.get(key(where))),
      create: jest.fn(async ({ data }: any) => { const row = { id: `ev${rows.size}`, status: 'received', attempts: 0, ...data }; rows.set(data.dedupe_key, row); return row; }),
      update: jest.fn(async ({ where, data }: any) => { const row = [...rows.values()].find((r) => r.id === where.id); Object.assign(row, { ...data, attempts: row.attempts + 1 }); return row; }),
    },
  };
  const controller = new PaystackWebhookController(new WebhookEventsService(prisma, payments as any), { paystackSecretKey: secret } as any);
  return { controller, payments, prisma, rows };
}

const chargeSuccess = JSON.stringify({ event: 'charge.success', data: { reference: 'pb_ref1', amount: 500000 } });

describe('PaystackWebhookController', () => {
  it('settles the payment named in a correctly signed charge.success event', async () => {
    const { controller, payments } = setup();
    await expect(controller.handle(req(chargeSuccess), sign(chargeSuccess))).resolves.toEqual({ received: true });
    expect(payments.reconcile).toHaveBeenCalledWith('pb_ref1');
  });

  it('rejects a request with no signature, a wrong signature, or a signature for different content', async () => {
    const { controller, payments } = setup();
    await expect(controller.handle(req(chargeSuccess), undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.handle(req(chargeSuccess), 'deadbeef')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.handle(req(chargeSuccess), sign('{"event":"charge.success","data":{"reference":"other"}}'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('rejects a forged event even when it looks perfect', async () => {
    const { controller, payments } = setup();
    const forged = JSON.stringify({ event: 'charge.success', data: { reference: 'pb_victim' } });
    await expect(controller.handle(req(forged), sign(forged, 'sk_test_attackerguess123'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('rejects everything when the payment secret is not configured', async () => {
    const { controller } = setup(null);
    await expect(controller.handle(req(chargeSuccess), sign(chargeSuccess))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request that arrives without a raw body', async () => {
    const { controller } = setup();
    await expect(controller.handle({} as any, sign(chargeSuccess))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acknowledges but ignores events that are not completed charges', async () => {
    const { controller, payments } = setup();
    for (const event of ['charge.failed', 'transfer.success', 'subscription.create', 'invoice.update']) {
      const body = JSON.stringify({ event, data: { reference: 'pb_ref1' } });
      await expect(controller.handle(req(body), sign(body))).resolves.toEqual({ received: true });
    }
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('acknowledges a charge.success with no reference without acting on it', async () => {
    const { controller, payments } = setup();
    const body = JSON.stringify({ event: 'charge.success', data: {} });
    await expect(controller.handle(req(body), sign(body))).resolves.toEqual({ received: true });
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('answers 200 for a reference we do not know so Paystack stops retrying', async () => {
    const { controller, payments } = setup();
    payments.reconcile.mockResolvedValue({ status: 'unknown', paymentId: null });
    await expect(controller.handle(req(chargeSuccess), sign(chargeSuccess))).resolves.toEqual({ received: true });
  });

  it('rejects a correctly signed but malformed payload', async () => {
    const { controller } = setup();
    await expect(controller.handle(req('not json'), sign('not json'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a transient failure surface (so Paystack retries) instead of swallowing it', async () => {
    const { controller, payments } = setup();
    payments.reconcile.mockRejectedValue(new Error('Paystack unreachable'));
    await expect(controller.handle(req(chargeSuccess), sign(chargeSuccess))).rejects.toThrow('Paystack unreachable');
  });
});
