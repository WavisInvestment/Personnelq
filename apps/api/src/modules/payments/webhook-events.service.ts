import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsService } from './payments.service';

/**
 * Keeps every payment-provider event we receive. A provider retries a delivery byte for byte, so a hash of the body
 * recognises a repeat; an event that already worked is acknowledged without doing anything, and one that failed is
 * tried again on the next delivery or replayed by hand from the admin console.
 */
@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  /** Records the delivery (or finds the earlier identical one) and acts on it. Throws if processing failed, so the provider retries. */
  async receive(provider: string, raw: Buffer, event: { event?: string; data?: { reference?: string } }) {
    const dedupe_key = createHash('sha256').update(raw).digest('hex');
    const event_type = event.event ?? 'unknown';
    const reference = event.data?.reference ?? null;

    let row = await this.prisma.webhookEvent.findUnique({ where: { provider_dedupe_key: { provider, dedupe_key } } });
    if (!row) {
      try {
        row = await this.prisma.webhookEvent.create({ data: { provider, dedupe_key, event_type, reference, payload: event as Prisma.InputJsonValue } });
      } catch (err) {
        // two identical deliveries at the same instant: the loser reads the winner's row
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        row = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { provider_dedupe_key: { provider, dedupe_key } } });
      }
    }

    if (row.status === 'processed' || row.status === 'ignored') return { duplicate: true as const };
    await this.process(row.id, event_type, reference);
    return { duplicate: false as const };
  }

  private async process(id: string, event_type: string, reference: string | null) {
    // Only completed charges matter. Everything else is kept for the record and acknowledged.
    if (event_type !== 'charge.success' || !reference) {
      await this.prisma.webhookEvent.update({ where: { id }, data: { status: 'ignored', processed_at: new Date(), attempts: { increment: 1 } } });
      return;
    }
    try {
      const result = await this.payments.reconcile(reference);
      if (result.status === 'unknown') this.logger.warn(`Webhook for unknown reference ${reference}`);
      const settled = result.status === 'success' || result.status === 'failed';
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          // "pending" means the provider does not yet call it paid; keep it replayable rather than pretending it is done
          status: settled ? 'processed' : result.status === 'unknown' ? 'ignored' : 'failed',
          error: settled ? null : result.status === 'unknown' ? 'No payment with this reference' : 'Still pending at the provider',
          processed_at: settled ? new Date() : null,
          attempts: { increment: 1 },
        },
      });
    } catch (err) {
      await this.prisma.webhookEvent.update({ where: { id }, data: { status: 'failed', error: String((err as Error).message).slice(0, 500), attempts: { increment: 1 } } });
      throw err;
    }
  }

  async list(status?: string, limit = 50) {
    const rows = await this.prisma.webhookEvent.findMany({
      where: status ? { status } : {},
      orderBy: { received_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: { id: true, provider: true, event_type: true, reference: true, status: true, attempts: true, error: true, received_at: true, processed_at: true },
    });
    return { data: rows };
  }

  /** Runs a stored event again (for example after the provider was unreachable). Settling a payment is idempotent, so this is safe. */
  async replay(id: string) {
    const row = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Event not found');
    await this.process(row.id, row.event_type, row.reference);
    const after = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, error: true, attempts: true } });
    return after;
  }
}
