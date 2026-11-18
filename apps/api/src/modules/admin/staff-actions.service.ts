import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaymentsService } from '../payments/payments.service';

export interface Actor {
  id: string;
  first_name: string;
  last_name: string;
}

const conflict = (code: string, message: string) => new ConflictException({ statusCode: 409, code, message });

/**
 * The things platform staff can do to a person, a company or a payment. Every one needs a reason where it matters,
 * is refused when it would change nothing, and is written to the staff-action record (shown on the person's or
 * company's page). Suspending a company is also written to the company's own audit trail.
 */
@Injectable()
export class StaffActionsService {
  private readonly logger = new Logger(StaffActionsService.name);

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private payments: PaymentsService,
  ) {}

  private record(actor: Actor, action: string, targetType: 'user' | 'organization' | 'payment', targetId: string, reason?: string, details?: Prisma.InputJsonValue) {
    return this.prisma.staffAction.create({
      data: { actor_id: actor.id, actor_name: `${actor.first_name} ${actor.last_name}`.trim(), action, target_type: targetType, target_id: targetId, reason: reason ?? null, details },
    });
  }

  private async person(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deleted_at: null } });
    if (!user) throw new NotFoundException('Person not found');
    return user;
  }

  // ------------------------------------------------------------ people

  async unlock(id: string, actor: Actor) {
    const user = await this.person(id);
    await this.prisma.user.update({ where: { id }, data: { failed_login_attempts: 0, locked_until: null } });
    await this.record(actor, 'user.unlocked', 'user', id, undefined, { was_locked: !!user.locked_until && user.locked_until > new Date(), failed_attempts: user.failed_login_attempts });
    return { unlocked: true };
  }

  /** Emails the person the normal reset link. Nothing is changed for them until they use it. */
  async sendPasswordReset(id: string, actor: Actor) {
    const user = await this.person(id);
    await this.auth.forgotPassword(user.email);
    await this.record(actor, 'user.reset_sent', 'user', id);
    return { sent: true };
  }

  async suspendUser(id: string, actor: Actor, reason: string) {
    if (id === actor.id) throw new BadRequestException({ statusCode: 400, code: 'CANNOT_SUSPEND_SELF', message: 'You cannot suspend your own account.' });
    const user = await this.person(id);
    if (user.platform_role_id) throw conflict('STAFF_ACCOUNT', 'Platform staff accounts are managed by changing their role, not by suspending them here.');
    if (user.suspended_at) throw conflict('ALREADY_SUSPENDED', 'This account is already suspended.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { suspended_at: new Date(), suspended_reason: reason } }),
      // signed out everywhere at once; the next request is refused anyway
      this.prisma.session.deleteMany({ where: { user_id: id } }),
    ]);
    await this.record(actor, 'user.suspended', 'user', id, reason);
    this.logger.warn(`Staff ${actor.id} suspended person ${id}`);
    return { suspended: true };
  }

  async reactivateUser(id: string, actor: Actor) {
    const user = await this.person(id);
    if (!user.suspended_at) throw conflict('NOT_SUSPENDED', 'This account is not suspended.');
    await this.prisma.user.update({ where: { id }, data: { suspended_at: null, suspended_reason: null, failed_login_attempts: 0, locked_until: null } });
    await this.record(actor, 'user.reactivated', 'user', id, undefined, { was_suspended_for: user.suspended_reason });
    return { suspended: false };
  }

  // ------------------------------------------------------------ companies

  private async company(id: string) {
    const org = await this.prisma.organization.findFirst({ where: { id, deleted_at: null }, select: { id: true, name: true, status: true, suspended_reason: true } });
    if (!org) throw new NotFoundException('Company not found');
    return org;
  }

  /** The company's own audit trail gets a line too, so its administrators can see platform staff acted. */
  private companyTrail(organizationId: string, actor: Actor, action: string, changes?: Prisma.InputJsonValue) {
    return this.prisma.auditLog
      .create({ data: { organization_id: organizationId, actor_id: actor.id, user_id: actor.id, action, resource_type: 'organization', resource_id: organizationId, changes } })
      .catch((err) => this.logger.error(`Audit log write failed: ${(err as Error).message}`));
  }

  async suspendOrganization(id: string, actor: Actor, reason: string) {
    const org = await this.company(id);
    if (org.status === 'suspended') throw conflict('ALREADY_SUSPENDED', 'This company is already suspended.');
    await this.prisma.organization.update({ where: { id }, data: { status: 'suspended', suspended_at: new Date(), suspended_reason: reason } });
    await this.record(actor, 'organization.suspended', 'organization', id, reason, { was: org.status });
    await this.companyTrail(id, actor, 'platform.company_suspended', { reason });
    this.logger.warn(`Staff ${actor.id} suspended company ${id}`);
    return { status: 'suspended' };
  }

  async reactivateOrganization(id: string, actor: Actor) {
    const org = await this.company(id);
    if (org.status !== 'suspended') throw conflict('NOT_SUSPENDED', 'This company is not suspended.');
    await this.prisma.organization.update({ where: { id }, data: { status: 'active', suspended_at: null, suspended_reason: null } });
    await this.record(actor, 'organization.reactivated', 'organization', id, undefined, { was_suspended_for: org.suspended_reason });
    await this.companyTrail(id, actor, 'platform.company_reactivated');
    return { status: 'active' };
  }

  // ------------------------------------------------------------ payments

  async refund(paymentId: string, actor: Actor, reason: string) {
    const result = await this.payments.refund(paymentId, reason);
    await this.record(actor, 'payment.refunded', 'payment', paymentId, reason, { provider_status: result.refund_status });
    return result;
  }
}
