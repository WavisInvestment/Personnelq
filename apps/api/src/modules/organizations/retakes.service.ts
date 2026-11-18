import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { MailService } from '../../common/mail/mail.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { requireVerifiedEmail } from '../../common/verified';
import { PrismaService } from '../../database/prisma.service';

interface Person {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long an approval stays usable (the same 14 days an invitation lasts). */
export const RETAKE_APPROVAL_DAYS = 14;

const fail = (status: HttpStatus, code: string, message: string) => new HttpException({ statusCode: status, message, code }, status);

/**
 * Repeating an assessment through a company needs the company's say-so (a locked client decision): the person can ask,
 * or HR can allow it first. An approval lasts 14 days and is used up by starting the attempt. Earlier results are never
 * overwritten: the new attempt becomes the current one and the old one stays in the person's history.
 */
@Injectable()
export class RetakesService {
  private readonly logger = new Logger(RetakesService.name);

  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private mail: MailService,
    private billing: BillingConfigService,
  ) {}

  private async require(userId: string, organizationId: string) {
    const permissions = await this.rbac.permissionsInOrganization(userId, organizationId);
    if (!permissions.includes('approve:retakes')) throw new ForbiddenException('You don’t have access to this company.');
  }

  private audit(organizationId: string, actorId: string, subjectId: string, action: string, resourceId: string, changes?: Prisma.InputJsonValue) {
    return this.prisma.auditLog
      .create({ data: { organization_id: organizationId, actor_id: actorId, user_id: subjectId, action, resource_type: 'retake_request', resource_id: resourceId, changes } })
      .catch((err) => this.logger.error(`Audit log write failed for ${action}: ${(err as Error).message}`));
  }

  private async org(organizationId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId, deleted_at: null }, select: { id: true, name: true, status: true } });
    if (!org) throw new NotFoundException('Company not found');
    return org;
  }

  /** Active members who accepted the invitation (the team); the only people whose attempts a company can approve. */
  private async teamMember(organizationId: string, userId: string) {
    return this.prisma.organizationMember.findFirst({
      where: { organization_id: organizationId, user_id: userId, status: 'active', deleted_at: null, consented_at: { not: null } },
      select: { user: { select: { id: true, email: true, first_name: true, last_name: true } } },
    });
  }

  /** The assessment must be one this company can run: the official full assessment, or one the company made. */
  private async assessment(organizationId: string, assessmentId: string) {
    const a = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        deleted_at: null,
        published_at: { not: null },
        OR: [{ organization_id: organizationId }, { organization_id: null, type: 'full_assessment' }],
      },
      select: { id: true, name: true },
    });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  private liveKey(organizationId: string, userId: string, assessmentId: string) {
    return `${organizationId}:${userId}:${assessmentId}`;
  }

  /** An approval nobody used before its date still holds the "live" slot until the hourly job closes it; free it first. */
  private releaseExpired(organizationId: string, userId: string, assessmentId: string) {
    return this.prisma.retakeRequest.updateMany({
      where: { open_key: this.liveKey(organizationId, userId, assessmentId), status: 'approved', expires_at: { lte: new Date() } },
      data: { status: 'expired', open_key: null },
    });
  }

  /** Creates the live request, or returns the one that already exists (two simultaneous asks end up with the same row). */
  private async createLive(data: { organization_id: string; user_id: string; assessment_id: string; requested_by: 'member' | 'hr' }) {
    await this.releaseExpired(data.organization_id, data.user_id, data.assessment_id);
    try {
      return { row: await this.prisma.retakeRequest.create({ data: { ...data, status: 'requested', open_key: this.liveKey(data.organization_id, data.user_id, data.assessment_id) } }), created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.retakeRequest.findFirst({ where: { open_key: this.liveKey(data.organization_id, data.user_id, data.assessment_id) } });
        if (existing) return { row: existing, created: false };
      }
      throw err;
    }
  }

  private openWhere(organizationId: string, userId: string, assessmentId: string): Prisma.RetakeRequestWhereInput {
    return {
      organization_id: organizationId,
      user_id: userId,
      assessment_id: assessmentId,
      OR: [{ status: 'requested' }, { status: 'approved', expires_at: { gt: new Date() } }],
    };
  }

  private link() {
    return `${this.billing.frontendUrl}/assessments/full`;
  }

  // ------------------------------------------------------------ the person asks

  async request(user: Person, assessmentId: string, organizationId: string) {
    requireVerifiedEmail(user);
    const [org, member, assessment] = await Promise.all([this.org(organizationId), this.teamMember(organizationId, user.id), this.assessment(organizationId, assessmentId)]);
    if (!member) throw new ForbiddenException('You are not part of this company.');

    const finished = await this.prisma.assessmentSubmission.count({
      where: { user_id: user.id, assessment_id: assessment.id, status: 'completed', deleted_at: null },
    });
    if (finished === 0) throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_NEEDED', 'You haven’t finished this assessment yet, so there is nothing to repeat.');

    await this.releaseExpired(organizationId, user.id, assessment.id);
    const open = await this.prisma.retakeRequest.findFirst({ where: this.openWhere(organizationId, user.id, assessment.id), orderBy: { created_at: 'desc' } });
    if (open) return { id: open.id, status: open.status, expires_at: open.expires_at };

    const { row: created, created: fresh } = await this.createLive({ organization_id: organizationId, user_id: user.id, assessment_id: assessment.id, requested_by: 'member' });
    if (!fresh) return { id: created.id, status: created.status, expires_at: created.expires_at };
    await this.audit(organizationId, user.id, user.id, 'retake.requested', created.id, { assessment: assessment.name });

    // Tell the people who can say yes.
    const approvers = await this.prisma.organizationMember.findMany({
      where: { organization_id: organizationId, status: 'active', deleted_at: null, role: { key: { in: ['admin', 'hr'] } } },
      take: 10,
      select: { user: { select: { email: true } } },
    });
    const person = `${user.first_name} ${user.last_name}`.trim();
    const link = `${this.billing.frontendUrl}/company?tab=people`;
    await Promise.all(approvers.map((a) => this.mail.sendRetakeRequested(a.user.email, { organization: org.name, person, assessment: assessment.name, link })));
    return { id: created.id, status: created.status, expires_at: null };
  }

  // ------------------------------------------------------------ the company decides

  async list(userId: string, organizationId: string) {
    await this.require(userId, organizationId);
    const rows = await this.prisma.retakeRequest.findMany({
      where: { organization_id: organizationId, OR: [{ status: 'requested' }, { status: 'approved', expires_at: { gt: new Date() } }] },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true, status: true, requested_by: true, created_at: true, expires_at: true,
        user: { select: { id: true, first_name: true, last_name: true, email: true } },
        assessment: { select: { id: true, name: true } },
      },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status as 'requested' | 'approved',
        requested_by: r.requested_by,
        requested_at: r.created_at,
        expires_at: r.expires_at,
        person: { user_id: r.user.id, name: `${r.user.first_name} ${r.user.last_name}`.trim(), email: r.user.email },
        assessment: r.assessment,
      })),
    };
  }

  private async approveRow(actor: Person, organizationId: string, row: { id: string; user_id: string; assessment_id: string }) {
    const [org, member, assessment] = await Promise.all([this.org(organizationId), this.teamMember(organizationId, row.user_id), this.assessment(organizationId, row.assessment_id)]);
    if (org.status === 'suspended') throw fail(HttpStatus.FORBIDDEN, 'ORGANIZATION_SUSPENDED', 'This company is suspended, so retakes can’t be approved right now.');
    if (!member) throw fail(HttpStatus.CONFLICT, 'NOT_IN_TEAM', 'That person is no longer part of this company.');
    // Company assessments are only offered while the plan runs, so an approval now would be unusable. Payments off = free plan.
    if (this.billing.paymentsEnabled()) {
      const sub = await this.prisma.subscription.findUnique({ where: { organization_id: organizationId }, select: { status: true, end_date: true } });
      if (!sub || sub.status !== 'active' || sub.end_date.getTime() <= Date.now()) {
        throw fail(HttpStatus.PAYMENT_REQUIRED, 'SUBSCRIPTION_REQUIRED', 'Your company needs an active plan before approving retakes.');
      }
    }
    const expires = new Date(Date.now() + RETAKE_APPROVAL_DAYS * DAY_MS);
    await this.prisma.retakeRequest.update({ where: { id: row.id }, data: { status: 'approved', decided_by: actor.id, decided_at: new Date(), expires_at: expires } });
    await this.audit(organizationId, actor.id, row.user_id, 'retake.approved', row.id, { assessment: assessment.name });
    const outcome = await this.mail.sendRetakeApproved(member.user.email, { first_name: member.user.first_name, organization: org.name, assessment: assessment.name, link: this.link(), expires });
    return { id: row.id, status: 'approved' as const, expires_at: expires, email_status: outcome };
  }

  /** HR allows a retake without waiting to be asked (or turns a waiting request into an approval). */
  async allow(actor: Person, organizationId: string, userId: string, assessmentId?: string) {
    await this.require(actor.id, organizationId);
    if (!assessmentId) {
      const official = await this.prisma.assessment.findFirst({ where: { slug: 'ocean-full', organization_id: null, deleted_at: null }, select: { id: true } });
      if (!official) throw new NotFoundException('Assessment not found');
      assessmentId = official.id;
    }
    const [member, assessment] = await Promise.all([this.teamMember(organizationId, userId), this.assessment(organizationId, assessmentId)]);
    if (!member) throw new NotFoundException('Person not found in this company');

    await this.releaseExpired(organizationId, userId, assessment.id);
    const open = await this.prisma.retakeRequest.findFirst({ where: this.openWhere(organizationId, userId, assessment.id), orderBy: { created_at: 'desc' } });
    if (open?.status === 'approved') return { id: open.id, status: 'approved' as const, expires_at: open.expires_at, email_status: null };
    if (open) return this.approveRow(actor, organizationId, open);

    const finished = await this.prisma.assessmentSubmission.count({ where: { user_id: userId, assessment_id: assessment.id, status: 'completed', deleted_at: null } });
    if (finished === 0) throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_NEEDED', 'This person hasn’t finished the assessment yet, so there is nothing to repeat.');
    const { row: created } = await this.createLive({ organization_id: organizationId, user_id: userId, assessment_id: assessment.id, requested_by: 'hr' });
    if (created.status === 'approved') return { id: created.id, status: 'approved' as const, expires_at: created.expires_at, email_status: null };
    return this.approveRow(actor, organizationId, created);
  }

  private async waiting(organizationId: string, retakeId: string) {
    const row = await this.prisma.retakeRequest.findFirst({ where: { id: retakeId, organization_id: organizationId } });
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  async approve(actor: Person, organizationId: string, retakeId: string) {
    await this.require(actor.id, organizationId);
    const row = await this.waiting(organizationId, retakeId);
    if (row.status !== 'requested') throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_WAITING', 'This request has already been dealt with.');
    return this.approveRow(actor, organizationId, row);
  }

  async decline(actor: Person, organizationId: string, retakeId: string) {
    await this.require(actor.id, organizationId);
    const row = await this.waiting(organizationId, retakeId);
    if (row.status !== 'requested') throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_WAITING', 'This request has already been dealt with.');
    await this.prisma.retakeRequest.update({ where: { id: row.id }, data: { status: 'declined', decided_by: actor.id, decided_at: new Date(), open_key: null } });
    await this.audit(organizationId, actor.id, row.user_id, 'retake.declined', row.id);
    return { id: row.id, status: 'declined' as const };
  }

  /** Withdraws an approval that hasn't been used yet. */
  async cancel(actor: Person, organizationId: string, retakeId: string) {
    await this.require(actor.id, organizationId);
    const row = await this.waiting(organizationId, retakeId);
    if (row.status !== 'approved') throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_APPROVED', 'Only an approval that hasn’t been used can be withdrawn.');
    const done = await this.prisma.retakeRequest.updateMany({ where: { id: row.id, status: 'approved' }, data: { status: 'cancelled', decided_by: actor.id, decided_at: new Date(), open_key: null } });
    if (done.count === 0) throw fail(HttpStatus.CONFLICT, 'RETAKE_NOT_APPROVED', 'This approval has just been used.');
    await this.audit(organizationId, actor.id, row.user_id, 'retake.cancelled', row.id);
    return { id: row.id, status: 'cancelled' as const };
  }
}
