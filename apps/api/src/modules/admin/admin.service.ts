import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AuditLogQueryDto,
  ListQueryDto,
  OrganizationListQueryDto,
  UserListQueryDto,
} from './dto/list-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUCCESS = 'success'; // Paystack's status for a completed charge

const MONTHLY_FACTOR: Record<string, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
  yearly: 1 / 12,
};

function toRecord<T extends Record<string, any>>(rows: T[], key: keyof T): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all as number]));
}

function contains(value: string) {
  return { contains: value, mode: 'insensitive' as const };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService) {}

  /** What staff have done to one person, company or payment, newest first. */
  private async staffHistory(targetType: 'user' | 'organization', targetId: string) {
    const rows = await this.prisma.staffAction.findMany({ where: { target_type: targetType, target_id: targetId }, orderBy: { created_at: 'desc' }, take: 30 });
    return rows.map((r) => ({ id: r.id, action: r.action, reason: r.reason, by: r.actor_name, at: r.created_at }));
  }

  private page(query: ListQueryDto) {
    return { skip: (query.page - 1) * query.limit, take: query.limit };
  }

  private meta(total: number, query: ListQueryDto) {
    return {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async overview() {
    const now = Date.now();
    const since7 = new Date(now - 7 * DAY_MS);
    const since30 = new Date(now - 30 * DAY_MS);
    const activeUsers = { deleted_at: null };
    const activeOrgs = { deleted_at: null };

    const [
      totalUsers,
      newUsers7,
      newUsers30,
      orgsTotal,
      orgsByStatus,
      orgsByType,
      subsByStatus,
      activeSubs,
      revenue,
      paymentsByStatus,
      completedAssessments,
      inProgressAssessments,
      recentSignups,
      signupRows,
    ] = await Promise.all([
      this.prisma.user.count({ where: activeUsers }),
      this.prisma.user.count({ where: { ...activeUsers, created_at: { gte: since7 } } }),
      this.prisma.user.count({ where: { ...activeUsers, created_at: { gte: since30 } } }),
      this.prisma.organization.count({ where: activeOrgs }),
      this.prisma.organization.groupBy({ by: ['status'], where: activeOrgs, _count: { _all: true } }),
      this.prisma.organization.groupBy({ by: ['type'], where: activeOrgs, _count: { _all: true } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.subscription.findMany({
        where: { status: 'active' },
        select: { amount: true, currency: true, billing_cycle: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: SUCCESS },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.assessmentSubmission.count({ where: { status: 'completed' } }),
      this.prisma.assessmentSubmission.count({ where: { status: 'in_progress' } }),
      this.prisma.user.findMany({
        where: activeUsers,
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, email: true, first_name: true, last_name: true, created_at: true },
      }),
      this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS count
        FROM "User"
        WHERE deleted_at IS NULL AND created_at >= ${since30}
        GROUP BY 1
        ORDER BY 1`,
    ]);

    const perDay = new Map(signupRows.map((r) => [r.day, Number(r.count)]));
    const signups30d = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now - (29 - i) * DAY_MS).toISOString().slice(0, 10);
      return { date, count: perDay.get(date) ?? 0 };
    });

    const mrrByCurrency = new Map<string, number>();
    for (const sub of activeSubs) {
      const monthly = sub.amount * (MONTHLY_FACTOR[sub.billing_cycle] ?? 1);
      mrrByCurrency.set(sub.currency, (mrrByCurrency.get(sub.currency) ?? 0) + monthly);
    }

    return {
      users: { total: totalUsers, new_7d: newUsers7, new_30d: newUsers30 },
      organizations: {
        total: orgsTotal,
        by_status: toRecord(orgsByStatus, 'status'),
        by_type: toRecord(orgsByType, 'type'),
      },
      subscriptions: {
        active: activeSubs.length,
        by_status: toRecord(subsByStatus, 'status'),
        mrr: [...mrrByCurrency].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
      },
      payments: {
        revenue: revenue.map((r) => ({
          currency: r.currency,
          total: r._sum.amount ?? 0,
          count: r._count._all,
        })),
        by_status: toRecord(paymentsByStatus, 'status'),
      },
      assessments: { completed: completedAssessments, in_progress: inProgressAssessments },
      signups_30d: signups30d,
      recent_signups: recentSignups,
    };
  }

  async listOrganizations(query: OrganizationListQueryDto) {
    const where: Prisma.OrganizationWhereInput = {
      deleted_at: null,
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.search && {
        OR: [
          { name: contains(query.search) },
          { slug: contains(query.search) },
          { admin_email: contains(query.search) },
        ],
      }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...this.page(query),
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          admin_name: true,
          admin_email: true,
          subscription_plan: true,
          subscription_status: true,
          subscription_end_date: true,
          max_employees: true,
          created_at: true,
          _count: { select: { members: true } },
        },
      }),
    ]);

    const subs = await this.prisma.subscription.findMany({
      where: { organization_id: { in: rows.map((r) => r.id) } },
      select: {
        organization_id: true,
        plan_name: true,
        status: true,
        amount: true,
        currency: true,
        billing_cycle: true,
        end_date: true,
        seats_used: true,
        seats_limit: true,
      },
    });
    const subByOrg = new Map(subs.map((s) => [s.organization_id, s]));

    return {
      data: rows.map(({ _count, ...org }) => ({
        ...org,
        member_count: _count.members,
        subscription: subByOrg.get(org.id) ?? null,
      })),
      meta: this.meta(total, query),
    };
  }

  async listUsers(query: UserListQueryDto) {
    const where: Prisma.UserWhereInput = {
      deleted_at: null,
      ...(query.staff === 'true' && { platform_role_id: { not: null } }),
      ...(query.search && {
        OR: [
          { email: contains(query.search) },
          { first_name: contains(query.search) },
          { last_name: contains(query.search) },
        ],
      }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...this.page(query),
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          email_verified: true,
          platform_role: { select: { key: true, name: true } },
          account_role: { select: { key: true, name: true } },
          failed_login_attempts: true,
          locked_until: true,
          created_at: true,
          _count: { select: { organization_members: true, submissions: true } },
          organization_members: {
            take: 3,
            select: {
              role: { select: { key: true, name: true } },
              organization: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map(({ _count, organization_members, platform_role, account_role, ...user }) => ({
        ...user,
        account_role: account_role?.key ?? null,
        account_role_name: account_role?.name ?? null,
        platform_role: platform_role?.key ?? null,
        platform_role_name: platform_role?.name ?? null,
        organization_count: _count.organization_members,
        assessment_count: _count.submissions,
        organizations: organization_members.map((m) => ({
          ...m.organization,
          role: m.role.key,
          role_name: m.role.name,
        })),
      })),
      meta: this.meta(total, query),
    };
  }

  /**
   * Everything about one person that support needs to help them: who they are, which companies they belong to, what they
   * have taken and paid for. It deliberately stops short of what the person keeps private: no scores, no answers, no
   * written insights and no badge link. Staff can see THAT someone finished an assessment, never WHAT it said.
   */
  async userDetail(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, first_name: true, last_name: true, email_verified: true, email_verified_at: true,
        failed_login_attempts: true, locked_until: true, created_at: true, deleted_at: true, suspended_at: true, suspended_reason: true,
        platform_role: { select: { key: true, name: true } },
        account_role: { select: { key: true, name: true } },
        organization_members: {
          orderBy: { joined_at: 'desc' },
          select: { status: true, department: true, job_title: true, joined_at: true, consented_at: true, role: { select: { key: true, name: true } }, organization: { select: { id: true, name: true, type: true } } },
        },
        submissions: {
          where: { deleted_at: null },
          orderBy: { started_at: 'desc' },
          take: 100,
          select: {
            id: true, status: true, started_at: true, completed_at: true, progress_percent: true, submission_number: true,
            assessment: { select: { name: true, type: true, version: true } },
            organization: { select: { id: true, name: true } },
          },
        },
        shareable_badges: { select: { is_public: true, published_at: true, expires_at: true, view_count: true, last_viewed_at: true } },
        payments: {
          orderBy: { created_at: 'desc' },
          take: 50,
          select: { id: true, amount: true, currency: true, status: true, payment_type: true, description: true, provider_reference: true, created_at: true, processed_at: true, organization: { select: { id: true, name: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Person not found');

    const [activeSessions, lastSession, staff_actions] = await Promise.all([
      this.prisma.session.count({ where: { user_id: id, expires_at: { gt: new Date() } } }),
      this.prisma.session.findFirst({ where: { user_id: id }, orderBy: { created_at: 'desc' }, select: { created_at: true } }),
      this.staffHistory('user', id),
    ]);
    this.logger.log(`Staff ${actorId} viewed person ${id}`);

    const { organization_members, submissions, shareable_badges, payments, platform_role, account_role, ...rest } = user;
    return {
      ...rest,
      deleted: user.deleted_at !== null,
      platform_role: platform_role?.key ?? null,
      platform_role_name: platform_role?.name ?? null,
      account_role: account_role?.key ?? null,
      companies: organization_members.map((m) => ({
        ...m.organization,
        role: m.role.key,
        role_name: m.role.name,
        status: m.status,
        department: m.department,
        job_title: m.job_title,
        joined_at: m.joined_at,
        // whether the person agreed that this company sees the results they take through it
        shares_results: m.consented_at !== null,
      })),
      assessments: submissions.map((x) => ({
        id: x.id,
        name: x.assessment.name,
        type: x.assessment.type,
        version: x.assessment.version,
        status: x.status,
        attempt: x.submission_number,
        progress_percent: x.progress_percent,
        started_at: x.started_at,
        completed_at: x.completed_at,
        company: x.organization,
      })),
      badges: shareable_badges,
      payments,
      sign_in: { active_sessions: activeSessions, last_signed_in: lastSession?.created_at ?? null },
      suspended: user.suspended_at !== null,
      staff_actions,
    };
  }

  /**
   * One company in full: contact, plan, people, invitations, its own assessments, payments and recent activity.
   * Opening it is recorded in the company's audit trail, so the company can see that platform staff looked.
   * People appear with whether they have finished, never with scores.
   */
  async organizationDetail(id: string, actorId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, name: true, slug: true, type: true, status: true, suspended_reason: true, suspended_at: true, admin_name: true, admin_email: true, admin_phone: true, created_at: true, updated_at: true },
    });
    if (!org) throw new NotFoundException('Company not found');

    const [subscription, members, invitationGroups, recentInvitations, assessments, payments, retakes, activity, completed, inProgress, staff_actions] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { organization_id: id } }),
      this.prisma.organizationMember.findMany({
        where: { organization_id: id },
        orderBy: [{ status: 'asc' }, { joined_at: 'asc' }],
        take: 500,
        select: { user_id: true, status: true, department: true, job_title: true, joined_at: true, consented_at: true, role: { select: { key: true, name: true } }, user: { select: { first_name: true, last_name: true, email: true } } },
      }),
      this.prisma.employeeInvitation.groupBy({ by: ['status'], where: { organization_id: id }, _count: { _all: true } }),
      this.prisma.employeeInvitation.findMany({ where: { organization_id: id }, orderBy: { created_at: 'desc' }, take: 10, select: { id: true, recipient_email: true, role_key: true, status: true, created_at: true, expires_at: true } }),
      this.prisma.assessment.findMany({
        where: { organization_id: id, deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: { id: true, name: true, version: true, published_at: true, created_at: true, _count: { select: { submissions: true } } },
      }),
      this.prisma.payment.findMany({ where: { organization_id: id }, orderBy: { created_at: 'desc' }, take: 20, select: { id: true, amount: true, currency: true, status: true, payment_type: true, description: true, provider_reference: true, created_at: true, user: { select: { first_name: true, last_name: true } } } }),
      this.prisma.retakeRequest.groupBy({ by: ['status'], where: { organization_id: id, status: { in: ['requested', 'approved'] } }, _count: { _all: true } }),
      this.prisma.auditLog.findMany({ where: { organization_id: id }, orderBy: { created_at: 'desc' }, take: 15, select: { id: true, action: true, created_at: true, actor: { select: { first_name: true, last_name: true } } } }),
      this.prisma.assessmentSubmission.groupBy({ by: ['user_id'], where: { organization_id: id, status: 'completed', deleted_at: null }, _count: { _all: true } }),
      this.prisma.assessmentSubmission.groupBy({ by: ['user_id'], where: { organization_id: id, status: 'in_progress', deleted_at: null }, _count: { _all: true } }),
      this.staffHistory('organization', id),
    ]);

    await this.prisma.auditLog
      .create({ data: { organization_id: id, actor_id: actorId, user_id: actorId, action: 'platform.company_viewed', resource_type: 'organization', resource_id: id } })
      .catch((err) => this.logger.error(`Audit log write failed: ${(err as Error).message}`));

    const done = new Set(completed.map((c) => c.user_id));
    const started = new Set(inProgress.map((c) => c.user_id));
    const count = (rows: { status: string; _count: { _all: number } }[], status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;

    return {
      ...org,
      subscription,
      counts: {
        active_members: members.filter((m) => m.status === 'active').length,
        inactive_members: members.filter((m) => m.status !== 'active').length,
        retakes_waiting: count(retakes, 'requested'),
        retakes_approved: count(retakes, 'approved'),
      },
      members: members.map((m) => ({
        user_id: m.user_id,
        name: `${m.user.first_name} ${m.user.last_name}`.trim(),
        email: m.user.email,
        role: m.role.key,
        role_name: m.role.name,
        status: m.status,
        department: m.department,
        job_title: m.job_title,
        joined_at: m.joined_at,
        shares_results: m.consented_at !== null,
        progress: done.has(m.user_id) ? 'completed' : started.has(m.user_id) ? 'in_progress' : 'not_started',
      })),
      invitations: {
        pending: count(invitationGroups, 'pending'),
        accepted: count(invitationGroups, 'accepted'),
        expired: count(invitationGroups, 'expired'),
        revoked: count(invitationGroups, 'revoked'),
        recent: recentInvitations.map((i) => ({ id: i.id, email: i.recipient_email, role: i.role_key, status: i.status, sent_at: i.created_at, expires_at: i.expires_at })),
      },
      assessments: assessments.map(({ _count, ...a }) => ({ ...a, status: a.published_at ? 'published' : 'draft', attempts: _count.submissions })),
      payments: payments.map(({ user, ...p }) => ({ ...p, paid_by: user ? `${user.first_name} ${user.last_name}`.trim() : null })),
      activity: activity.map((a) => ({ id: a.id, action: a.action, at: a.created_at, by: `${a.actor.first_name} ${a.actor.last_name}`.trim() })),
      staff_actions,
    };
  }

  async listRoles() {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: [{ scope: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          scope: true,
          key: true,
          name: true,
          description: true,
          is_system: true,
          permissions: { select: { permission: { select: { key: true } } } },
          _count: { select: { platform_users: true, memberships: true, account_users: true } },
        },
      }),
      this.prisma.permission.findMany({
        orderBy: [{ scope: 'asc' }, { key: 'asc' }],
        select: { key: true, scope: true, description: true },
      }),
    ]);

    return {
      roles: roles.map(({ permissions: links, _count, ...role }) => ({
        ...role,
        permissions: links.map((l) => l.permission.key),
        user_count:
          role.scope === 'platform'
            ? _count.platform_users
            : role.scope === 'account'
              ? _count.account_users
              : _count.memberships,
      })),
      permissions,
    };
  }

  async listSubscriptions(query: ListQueryDto) {
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && { organization: { name: contains(query.search) } }),
    };

    const [total, data] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...this.page(query),
        select: {
          id: true,
          plan_name: true,
          status: true,
          billing_cycle: true,
          amount: true,
          currency: true,
          start_date: true,
          end_date: true,
          auto_renew: true,
          seats_used: true,
          seats_limit: true,
          cancelled_at: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return { data, meta: this.meta(total, query) };
  }

  async listPayments(query: ListQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { provider_reference: contains(query.search) },
          { organization: { name: contains(query.search) } },
          // People who paid for themselves have no company, so they are found by name or email.
          { user: { email: contains(query.search) } },
          { user: { first_name: contains(query.search) } },
          { user: { last_name: contains(query.search) } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...this.page(query),
        // Gateway secrets (authorization_url, access_code) and raw metadata are deliberately not selected.
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          payment_method: true,
          payment_provider: true,
          provider_reference: true,
          payment_type: true,
          subscription_plan: true,
          description: true,
          created_at: true,
          processed_at: true,
          // Null for a person paying for themselves; the person is shown instead.
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      }),
    ]);

    return { data, meta: this.meta(total, query) };
  }

  async listAuditLogs(query: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.resource_type && { resource_type: query.resource_type }),
      ...(query.search && { action: contains(query.search) }),
    };

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...this.page(query),
        select: {
          id: true,
          action: true,
          resource_type: true,
          resource_id: true,
          status: true,
          error_message: true,
          ip_address: true,
          created_at: true,
          organization: { select: { id: true, name: true } },
          actor: { select: { id: true, email: true, first_name: true, last_name: true } },
        },
      }),
    ]);

    return { data, meta: this.meta(total, query) };
  }
}
