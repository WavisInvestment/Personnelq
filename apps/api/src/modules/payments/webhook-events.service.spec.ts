import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { WebhookEventsService } from './webhook-events.service';

const body = JSON.stringify({ event: 'charge.success', data: { reference: 'pb_1' } });
const raw = Buffer.from(body);
const event = JSON.parse(body);
const hash = createHash('sha256').update(raw).digest('hex');

function setup(existing: any = null) {
  const prisma: any = {
    webhookEvent: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ev1', status: 'received', attempts: 0, ...data })),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const payments: any = { reconcile: jest.fn().mockResolvedValue({ status: 'success', paymentId: 'p1' }) };
  return { prisma, payments, service: new WebhookEventsService(prisma, payments) };
}

describe('WebhookEventsService', () => {
  it('records a new delivery under a hash of its body, settles it and marks it processed', async () => {
    const { service, prisma, payments } = setup();
    await expect(service.receive('paystack', raw, event)).resolves.toEqual({ duplicate: false });
    expect(prisma.webhookEvent.create.mock.calls[0][0].data).toMatchObject({ provider: 'paystack', dedupe_key: hash, event_type: 'charge.success', reference: 'pb_1' });
    expect(payments.reconcile).toHaveBeenCalledWith('pb_1');
    expect(prisma.webhookEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'processed', error: null, attempts: { increment: 1 } });
  });

  it('acknowledges a repeat of an event that already worked without acting again', async () => {
    const { service, payments, prisma } = setup({ id: 'ev1', status: 'processed' });
    await expect(service.receive('paystack', raw, event)).resolves.toEqual({ duplicate: true });
    expect(payments.reconcile).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('tries a failed event again when the provider redelivers it', async () => {
    const { service, payments } = setup({ id: 'ev1', status: 'failed' });
    await expect(service.receive('paystack', raw, event)).resolves.toEqual({ duplicate: false });
    expect(payments.reconcile).toHaveBeenCalledTimes(1);
  });

  it('keeps a failure on record and lets it propagate so the provider retries', async () => {
    const { service, payments, prisma } = setup();
    payments.reconcile.mockRejectedValue(new Error('Paystack unreachable'));
    await expect(service.receive('paystack', raw, event)).rejects.toThrow('Paystack unreachable');
    expect(prisma.webhookEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'failed', error: 'Paystack unreachable' });
  });

  it('records events it does not act on as ignored', async () => {
    const { service, payments, prisma } = setup();
    await service.receive('paystack', Buffer.from('{"event":"transfer.success"}'), { event: 'transfer.success' });
    expect(payments.reconcile).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'ignored' });
  });

  it('marks an unknown reference ignored and a still-pending payment failed, so it stays replayable', async () => {
    const unknown = setup();
    unknown.payments.reconcile.mockResolvedValue({ status: 'unknown', paymentId: null });
    await unknown.service.receive('paystack', raw, event);
    expect(unknown.prisma.webhookEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'ignored', error: 'No payment with this reference' });

    const pending = setup();
    pending.payments.reconcile.mockResolvedValue({ status: 'pending', paymentId: 'p1' });
    await pending.service.receive('paystack', raw, event);
    expect(pending.prisma.webhookEvent.update.mock.calls[0][0].data).toMatchObject({ status: 'failed', processed_at: null });
  });

  it('two identical deliveries at once end up on the same row', async () => {
    const { service, prisma } = setup();
    const stored = { id: 'ev1', status: 'received', attempts: 0, event_type: 'charge.success', reference: 'pb_1' };
    prisma.webhookEvent.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    prisma.webhookEvent.findUniqueOrThrow.mockResolvedValue(stored);
    await expect(service.receive('paystack', raw, event)).resolves.toEqual({ duplicate: false });
    expect(prisma.webhookEvent.update.mock.calls[0][0].where).toEqual({ id: 'ev1' });
  });

  it('lists events (capped) and replays a stored one', async () => {
    const { service, prisma, payments } = setup();
    await service.list('failed', 9999);
    expect(prisma.webhookEvent.findMany.mock.calls[0][0]).toMatchObject({ where: { status: 'failed' }, take: 200 });

    prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'ev1', event_type: 'charge.success', reference: 'pb_1' });
    prisma.webhookEvent.findUniqueOrThrow.mockResolvedValue({ id: 'ev1', status: 'processed', error: null, attempts: 2 });
    await expect(service.replay('ev1')).resolves.toMatchObject({ status: 'processed' });
    expect(payments.reconcile).toHaveBeenCalledWith('pb_1');

    prisma.webhookEvent.findUnique.mockResolvedValue(null);
    await expect(service.replay('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
