import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { MailService } from '../mail/mail.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Housekeeping that must happen without anyone clicking: closing out things that have run out of time, warning
 * companies before their plan ends, and clearing stale credentials. Every task is safe to run twice and from several
 * API instances at once (each claims its work with a conditional update), so there is no scheduler dependency.
 *
 * ponytail: an in-process hourly timer. If the API is scaled out and the duplicate queries matter, move runAll() to a
 * single cron-triggered worker; nothing else changes.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private billing: BillingConfigService,
    private config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    // On in production by default; elsewhere only when asked for, so a development database is never touched by surprise.
    const flag = this.config.get<string>('JOBS_ENABLED');
    const on = flag ? flag === 'true' : this.config.get<string>('NODE_ENV') === 'production';
    if (!on) {
      this.logger.log('Scheduled jobs are off (set JOBS_ENABLED=true to run them outside production)');
      return;
    }
    const every = Number(this.config.get('JOBS_INTERVAL_MS')) || HOUR_MS;
    // The first pass waits a little so start-up isn't slowed down.
    const first = setTimeout(() => void this.runAll(), 30_000);
    first.unref();
    this.timer = setInterval(() => void this.runAll(), every);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs every task; one failing never stops the others. Returns what each did (used by tests and for logging). */
  async runAll() {
    const report: Record<string, number | string> = {};
    const tasks: [string, () => Promise<number>][] = [
      ['invitations_expired', () => this.expireInvitations()],
      ['retakes_expired', () => this.expireRetakes()],
      ['plan_notices_sent', () => this.sendPlanNotices()],
      ['stale_credentials_cleared', () => this.clearStale()],
    ];
    for (const [name, task] of tasks) {
      try {
        report[name] = await task();
      } catch (err) {
        report[name] = 'failed';
        this.logger.error(`Job ${name} failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Jobs: ${JSON.stringify(report)}`);
    return report;
  }

  /** A waiting invitation past its date becomes "expired" in the database too (the app already treated it as such). */
  async expireInvitations() {
    const { count } = await this.prisma.employeeInvitation.updateMany({ where: { status: 'pending', expires_at: { lte: new Date() } }, data: { status: 'expired', open_key: null } });
    return count;
  }

  async expireRetakes() {
    const { count } = await this.prisma.retakeRequest.updateMany({ where: { status: 'approved', expires_at: { lte: new Date() } }, data: { status: 'expired', open_key: null } });
    return count;
  }

  /**
   * Company plans: warn 7 days and 1 day before the end, and mark the plan ended on the day. Administrators are emailed.
   * Skipped entirely while payments are switched off (then nobody has a plan to lose).
   */
  async sendPlanNotices() {
    if (!this.billing.paymentsEnabled()) return 0;
    const now = new Date();
    const subs = await this.prisma.subscription.findMany({
      where: { status: 'active', end_date: { lte: new Date(now.getTime() + 7 * DAY_MS) }, organization: { deleted_at: null } },
      select: { id: true, plan_name: true, end_date: true, last_expiry_notice: true, organization_id: true, organization: { select: { name: true } } },
    });

    let sent = 0;
    for (const sub of subs) {
      const left = sub.end_date.getTime() - now.getTime();
      const stage = left <= 0 ? 'ended' : left <= DAY_MS ? '1d' : '7d';
      if (sub.last_expiry_notice === stage || sub.last_expiry_notice === 'ended' || (stage === '7d' && sub.last_expiry_notice === '1d')) continue;

      // Only the instance that wins this update sends the email.
      const claimed = await this.prisma.subscription.updateMany({
        where: { id: sub.id, last_expiry_notice: sub.last_expiry_notice },
        data: { last_expiry_notice: stage, ...(stage === 'ended' ? { status: 'expired' } : {}) },
      });
      if (claimed.count === 0) continue;
      if (stage === 'ended') {
        await this.prisma.organization.update({ where: { id: sub.organization_id }, data: { subscription_status: 'inactive' } });
      }

      const admins = await this.prisma.organizationMember.findMany({
        where: { organization_id: sub.organization_id, status: 'active', deleted_at: null, role: { key: 'admin' } },
        select: { user: { select: { email: true } } },
      });
      for (const a of admins) {
        await this.mail.sendPlanNotice(a.user.email, {
          organization: sub.organization.name,
          plan: sub.plan_name,
          ends: sub.end_date,
          ended: stage === 'ended',
          link: `${this.billing.frontendUrl}/billing`,
        });
        sent++;
      }
    }
    return sent;
  }

  /** Sign-in sessions, reset links and confirmation links that have run out are removed rather than kept forever. */
  async clearStale() {
    const now = new Date();
    const [sessions, resets, verifications, keys, events] = await Promise.all([
      this.prisma.session.deleteMany({ where: { expires_at: { lt: now } } }),
      this.prisma.user.updateMany({ where: { password_reset_expires: { lt: now } }, data: { password_reset_token: null, password_reset_expires: null } }),
      this.prisma.user.updateMany({ where: { email_verify_expires: { lt: now } }, data: { email_verify_token: null, email_verify_expires: null, pending_email: null } }),
      // Retry keys last a day. Provider events that worked are kept for six months for the record; failed ones stay until handled.
      this.prisma.idempotencyKey.deleteMany({ where: { expires_at: { lt: now } } }),
      this.prisma.webhookEvent.deleteMany({ where: { status: { in: ['processed', 'ignored'] }, received_at: { lt: new Date(now.getTime() - 180 * DAY_MS) } } }),
    ]);
    return sessions.count + resets.count + verifications.count + keys.count + events.count;
  }
}
