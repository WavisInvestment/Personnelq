import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { BillingConfigService } from "../../common/billing/billing-config.service";
import { toCsv } from "../../common/csv";
import { MailService } from "../../common/mail/mail.service";
import { RbacService } from "../../common/rbac/rbac.service";
import { requireVerifiedEmail } from "../../common/verified";
import { PrismaService } from "../../database/prisma.service";
import { byDepartment, distribution, Scores } from "../analytics/stats";
import { TRAITS } from "../assessments/catalog/ocean-items";
import { TRAIT_META } from "../reports/radar-svg";
import { CLASSES, classView, classify } from "../assessments/scoring/classes";
import { describeTrait } from "../assessments/scoring/interpretation";
import { LEVEL_LABELS, levelFor } from "../assessments/scoring/scoring";
import { PdfService, PdfUnavailableError } from "../reports/pdf.service";
import { CreateInvitationsDto } from "./dto/organizations.dto";
import { MatchPerson, matchPeople } from "./matching";
import { renderTeamReportHtml } from "./team-report";

interface Person {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified?: boolean;
}

export const COMPANY_ROLES = ["employee", "hr", "admin"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
export const INVITE_DAYS = 14;
export const REMIND_EVERY_DAYS = 3;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,64}$/;

const fail = (
  status: HttpStatus,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => new HttpException({ statusCode: status, message, code, ...extra }, status);

const scoresOf = (r: {
  openness_score: number | null;
  conscientiousness_score: number | null;
  extraversion_score: number | null;
  agreeableness_score: number | null;
  neuroticism_score: number | null;
}): Scores => ({
  openness: r.openness_score ?? 0,
  conscientiousness: r.conscientiousness_score ?? 0,
  extraversion: r.extraversion_score ?? 0,
  agreeableness: r.agreeableness_score ?? 0,
  neuroticism: r.neuroticism_score ?? 0,
});

const maskEmail = (email: string) => {
  const [name, domain = ""] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
};

type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
const invitationStatus = (inv: {
  status: string;
  expires_at: Date;
}): InvitationStatus =>
  inv.status === "pending" && inv.expires_at.getTime() <= Date.now()
    ? "expired"
    : (inv.status as InvitationStatus);

export type TeamStatus = "completed" | "in_progress" | "not_started";

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  job_title: string | null;
  joined_at: Date;
  status: TeamStatus;
  progress_percent: number | null;
  /** The personality class of the person's company result, or null until they finish. */
  profile_class: { key: string; name: string } | null;
  result: {
    id: string;
    completed_at: Date;
    overall: number;
    scores: Scores;
  } | null;
}

const classOf = (scores: Scores) => {
  const c = classify(scores);
  return { key: c.key as string, name: c.name };
};

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private mail: MailService,
    private billing: BillingConfigService,
    private pdf: PdfService,
  ) {}

  // ------------------------------------------------------------ helpers

  /** Non-members and members without the permission get the same answer, so a company's existence isn't revealed. */
  private async require(
    userId: string,
    organizationId: string,
    permission: string,
  ) {
    const permissions = await this.rbac.permissionsInOrganization(
      userId,
      organizationId,
    );
    if (!permissions.includes(permission))
      throw new ForbiddenException("You don’t have access to this company.");
  }

  private async organization(id: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        suspended_reason: true,
      },
    });
    if (!org) throw new NotFoundException("Company not found");
    return org;
  }

  /** Platform staff can suspend a company. Reading stays possible; inviting, resending and reminding do not. */
  private assertOpen<
    T extends { status: string; suspended_reason: string | null },
  >(org: T): T {
    if (org.status === "suspended") {
      throw fail(
        HttpStatus.FORBIDDEN,
        "ORGANIZATION_SUSPENDED",
        `This company is suspended${org.suspended_reason ? `: ${org.suspended_reason}` : ""}. Contact support to have it restored.`,
      );
    }
    return org;
  }

  private audit(
    organizationId: string,
    actorId: string,
    subjectId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog
      .create({
        data: {
          organization_id: organizationId,
          actor_id: actorId,
          user_id: subjectId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          changes,
        },
      })
      .catch((err) =>
        this.logger.error(
          `Audit log write failed for ${action}: ${(err as Error).message}`,
        ),
      );
  }

  /** The plan that lets a company invite people. With payments off every company has a free one. */
  private async activeSubscription(organizationId: string) {
    if (!this.billing.paymentsEnabled()) {
      return {
        status: "active",
        end_date: new Date("9999-12-31T00:00:00Z"),
        seats_limit: this.billing.freeOrganizationSeats(),
        plan_name: "Free",
      };
    }
    const sub = await this.prisma.subscription.findUnique({
      where: { organization_id: organizationId },
    });
    return sub && sub.status === "active" && sub.end_date.getTime() > Date.now()
      ? sub
      : null;
  }

  private teamWhere(
    organizationId: string,
  ): Prisma.OrganizationMemberWhereInput {
    return {
      organization_id: organizationId,
      status: "active",
      deleted_at: null,
      consented_at: { not: null },
    };
  }

  /**
   * The team: people who accepted an invitation and are still members. Each person's latest result taken THROUGH this
   * company is used (not "current": a later private attempt must not hide the company one, and is never counted).
   */
  private async loadTeam(
    organizationId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<TeamMember[]> {
    const members = await db.organizationMember.findMany({
      where: this.teamWhere(organizationId),
      orderBy: { joined_at: "asc" },
      include: {
        user: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
        role: { select: { key: true } },
      },
    });
    const ids = members.map((m) => m.user_id);
    if (ids.length === 0) return [];

    const [results, inProgress] = await Promise.all([
      db.assessmentResult.findMany({
        where: {
          organization_id: organizationId,
          user_id: { in: ids },
          deleted_at: null,
          assessment: { type: "full_assessment" },
        },
        orderBy: { calculated_at: "desc" },
        select: {
          id: true,
          user_id: true,
          calculated_at: true,
          overall_score: true,
          openness_score: true,
          conscientiousness_score: true,
          extraversion_score: true,
          agreeableness_score: true,
          neuroticism_score: true,
        },
      }),
      db.assessmentSubmission.findMany({
        where: {
          organization_id: organizationId,
          user_id: { in: ids },
          status: "in_progress",
          deleted_at: null,
          assessment: { type: "full_assessment" },
        },
        select: { user_id: true, progress_percent: true },
      }),
    ]);

    const latest = new Map<string, (typeof results)[number]>();
    for (const r of results)
      if (!latest.has(r.user_id)) latest.set(r.user_id, r);
    const progress = new Map(
      inProgress.map((s) => [s.user_id, s.progress_percent]),
    );

    return members.map((m) => {
      const r = latest.get(m.user_id);
      return {
        user_id: m.user_id,
        name: `${m.user.first_name} ${m.user.last_name}`.trim(),
        email: m.user.email,
        role: m.role.key,
        department: m.department,
        job_title: m.job_title,
        joined_at: m.consented_at ?? m.joined_at,
        status: r
          ? "completed"
          : progress.has(m.user_id)
            ? "in_progress"
            : "not_started",
        progress_percent: r ? 100 : (progress.get(m.user_id) ?? null),
        profile_class: r ? classOf(scoresOf(r)) : null,
        result: r
          ? {
              id: r.id,
              completed_at: r.calculated_at,
              overall: r.overall_score,
              scores: scoresOf(r),
            }
          : null,
      };
    });
  }

  private summarise(team: TeamMember[]) {
    const done = team.filter((m) => m.result);
    return {
      members: team.length,
      completed: done.length,
      in_progress: team.filter((m) => m.status === "in_progress").length,
      not_started: team.filter((m) => m.status === "not_started").length,
      completion_pct: team.length
        ? Math.round((done.length / team.length) * 100)
        : 0,
      distribution: distribution(
        done.map((m) => ({
          department: m.department,
          scores: m.result!.scores,
        })),
      ),
      departments: byDepartment(
        team.map((m) => ({
          department: m.department,
          completed: !!m.result,
          scores: m.result?.scores ?? null,
        })),
      ),
    };
  }

  private async syncSeats(
    organizationId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const used = await db.organizationMember.count({
      where: this.teamWhere(organizationId),
    });
    await db.subscription.updateMany({
      where: { organization_id: organizationId },
      data: { seats_used: used },
    });
    return used;
  }

  // ------------------------------------------------------------ dashboard

  async dashboard(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "read:team_results");
    const org = await this.organization(organizationId);
    const [team, sub, pending, invites] = await Promise.all([
      this.loadTeam(organizationId),
      this.prisma.subscription.findUnique({
        where: { organization_id: organizationId },
      }),
      this.prisma.employeeInvitation.count({
        where: {
          organization_id: organizationId,
          status: "pending",
          expires_at: { gt: new Date() },
        },
      }),
      this.prisma.employeeInvitation.findMany({
        where: { organization_id: organizationId },
        orderBy: { created_at: "desc" },
        take: 5,
        select: { recipient_email: true, created_at: true },
      }),
    ]);
    const summary = this.summarise(team);

    const activity = [
      ...team
        .filter((m) => m.result)
        .map((m) => ({
          type: "completed" as const,
          who: m.name,
          at: m.result!.completed_at,
        })),
      ...team.map((m) => ({
        type: "joined" as const,
        who: m.name,
        at: m.joined_at,
      })),
      ...invites.map((i) => ({
        type: "invited" as const,
        who: i.recipient_email,
        at: i.created_at,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10);

    return {
      organization: {
        id: org.id,
        name: org.name,
        type: org.type,
        status: org.status,
        suspended_reason:
          org.status === "suspended" ? org.suspended_reason : null,
      },
      plan: !this.billing.paymentsEnabled()
        ? {
            name: "Free",
            active: true,
            end_date: null,
            seats_limit: this.billing.freeOrganizationSeats(),
            seats_used: summary.members,
          }
        : sub
          ? {
              name: sub.plan_name,
              active:
                sub.status === "active" && sub.end_date.getTime() > Date.now(),
              end_date: sub.end_date,
              seats_limit: sub.seats_limit,
              seats_used: summary.members,
            }
          : null,
      team: {
        members: summary.members,
        completed: summary.completed,
        in_progress: summary.in_progress,
        not_started: summary.not_started,
        pending_invitations: pending,
        completion_pct: summary.completion_pct,
      },
      distribution: summary.distribution,
      departments: summary.departments,
      recent: activity,
    };
  }

  async members(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "read:team_results");
    const [team, paused] = await Promise.all([
      this.loadTeam(organizationId),
      this.prisma.organizationMember.findMany({
        where: {
          organization_id: organizationId,
          status: "suspended",
          deleted_at: null,
        },
        orderBy: { updated_at: "desc" },
        select: {
          user_id: true,
          department: true,
          suspended_reason: true,
          updated_at: true,
          role: { select: { key: true } },
          user: { select: { first_name: true, last_name: true, email: true } },
        },
      }),
    ]);
    return {
      data: team,
      suspended: paused.map((m) => ({
        user_id: m.user_id,
        name: `${m.user.first_name} ${m.user.last_name}`.trim(),
        email: m.user.email,
        role: m.role.key,
        department: m.department,
        reason: m.suspended_reason,
        since: m.updated_at,
      })),
    };
  }

  /**
   * The team grouped by personality class: for every class, who is in it, plus the people who have not finished yet.
   * It uses only results people took through this company, the same people and results the People tab already lists.
   */
  async classes(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "read:team_results");
    const team = await this.loadTeam(organizationId);
    const person = (m: TeamMember) => ({
      user_id: m.user_id,
      name: m.name,
      department: m.department,
      job_title: m.job_title,
      role: m.role,
    });

    const classes = CLASSES.map((c) => {
      const members = team.filter((m) => m.profile_class?.key === c.key).map(person);
      return { ...classView(c), count: members.length, members };
    });
    const classified = classes.reduce((n, c) => n + c.count, 0);
    const largest = classes.reduce((a, b) => (b.count > a.count ? b : a), classes[0]);

    return {
      classes,
      classified,
      not_classified: team.filter((m) => !m.profile_class).map(person),
      balance: {
        most_common: classified > 0 ? { key: largest.key, name: largest.name, count: largest.count } : null,
        missing: classes.filter((c) => c.count === 0).map((c) => ({ key: c.key, name: c.name })),
      },
    };
  }

  /**
   * Suggested pairs from people's classes (see matching.ts). A suggestion only: nothing is saved and nobody is told.
   * A new `seed` gives another set of suggestions with the same quality.
   */
  async matches(userId: string, organizationId: string, opts: { crossDepartment: boolean; seed?: number }) {
    await this.require(userId, organizationId, "read:team_results");
    const team = await this.loadTeam(organizationId);
    const people: MatchPerson[] = team
      .filter((m) => m.profile_class)
      .map((m) => ({ user_id: m.user_id, name: m.name, department: m.department, class_key: m.profile_class!.key as MatchPerson["class_key"], class_name: m.profile_class!.name }));
    const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
    const out = matchPeople(people, { crossDepartment: opts.crossDepartment, seed });
    return {
      ...out,
      seed,
      cross_department: opts.crossDepartment,
      people: people.length,
      not_classified: team.length - people.length,
    };
  }

  async memberResult(actor: Person, organizationId: string, targetId: string) {
    await this.require(actor.id, organizationId, "read:team_results");
    const member = (await this.loadTeam(organizationId)).find(
      (m) => m.user_id === targetId,
    );
    if (!member || !member.result)
      throw new NotFoundException("No company result for this person");

    const row = await this.prisma.assessmentResult.findUnique({
      where: { id: member.result.id },
      include: { assessment: { select: { name: true } } },
    });
    // Looking at one person's scores is recorded, and the person can be told it happens (see the invitation text).
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.result_viewed",
      "assessment_result",
      member.result.id,
    );

    return {
      member: {
        user_id: member.user_id,
        name: member.name,
        email: member.email,
        department: member.department,
        job_title: member.job_title,
        joined_at: member.joined_at,
      },
      result: {
        id: member.result.id,
        assessment: row?.assessment.name ?? "Full personality assessment",
        completed_at: member.result.completed_at,
        traits: TRAITS.map((trait) => {
          const score = member.result!.scores[trait];
          const level = levelFor(score);
          return {
            trait,
            score,
            level,
            level_label: LEVEL_LABELS[level],
            description: describeTrait(trait, level),
          };
        }),
      },
    };
  }

  // ------------------------------------------------------------ leaving and removing

  /** Ends a membership. The person's results stay theirs but are detached, so the company stops seeing them. */
  private async deactivate(organizationId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({
        where: {
          user_id_organization_id: {
            user_id: userId,
            organization_id: organizationId,
          },
        },
        data: {
          status: "inactive",
          deleted_at: new Date(),
          consented_at: null,
        },
      });
      await tx.assessmentResult.updateMany({
        where: { organization_id: organizationId, user_id: userId },
        data: { organization_id: null },
      });
      await tx.assessmentSubmission.updateMany({
        where: { organization_id: organizationId, user_id: userId },
        data: { organization_id: null },
      });
      await this.syncSeats(organizationId, tx);
    });
  }

  private async activeMembership(
    organizationId: string,
    userId: string,
    includePaused = false,
  ) {
    const m = await this.prisma.organizationMember.findUnique({
      where: {
        user_id_organization_id: {
          user_id: userId,
          organization_id: organizationId,
        },
      },
      include: { role: { select: { key: true } } },
    });
    return m &&
      (m.status === "active" || (includePaused && m.status === "suspended")) &&
      !m.deleted_at
      ? m
      : null;
  }

  async removeMember(actor: Person, organizationId: string, targetId: string) {
    await this.require(actor.id, organizationId, "manage:team");
    if (targetId === actor.id)
      throw fail(
        HttpStatus.BAD_REQUEST,
        "USE_LEAVE",
        "To leave the company, use “Leave company”.",
      );
    const target = await this.activeMembership(organizationId, targetId);
    if (!target)
      throw new NotFoundException("Person not found in this company");
    if (target.role.key === "admin")
      throw fail(
        HttpStatus.CONFLICT,
        "CANNOT_REMOVE_ADMIN",
        "A company administrator can’t be removed here.",
      );
    await this.deactivate(organizationId, targetId);
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.removed",
      "organization_member",
      target.id,
    );
    return { removed: true };
  }

  async leave(user: Person, organizationId: string) {
    const m = await this.activeMembership(organizationId, user.id, true);
    if (!m) throw new NotFoundException("You are not a member of this company");
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { joined_via_organization_id: true },
    });
    if (account?.joined_via_organization_id === organizationId) {
      throw fail(
        HttpStatus.FORBIDDEN,
        "CANNOT_LEAVE",
        "This account was created from an invitation, so it stays with the company.",
      );
    }
    if (
      m.role.key === "admin" &&
      (await this.otherAdmins(organizationId, user.id)) === 0
    ) {
      throw fail(
        HttpStatus.CONFLICT,
        "ADMIN_CANNOT_LEAVE",
        "You are the only administrator. Make someone else an administrator before you leave.",
      );
    }
    await this.deactivate(organizationId, user.id);
    await this.audit(
      organizationId,
      user.id,
      user.id,
      "member.left",
      "organization_member",
      m.id,
    );
    return { left: true };
  }

  // ------------------------------------------------------------ invitations

  private newToken() {
    return randomBytes(32).toString("base64url");
  }

  private invitationKey(organizationId: string, email: string) {
    return `${organizationId}:${email.toLowerCase()}`;
  }

  private linkFor(token: string) {
    return `${this.billing.frontendUrl}/invite/${token}`;
  }

  async createInvitations(
    actor: Person,
    organizationId: string,
    dto: CreateInvitationsDto,
  ) {
    await this.require(actor.id, organizationId, "invite:members");
    requireVerifiedEmail(actor);
    // Only an administrator can bring in someone with more than the employee role.
    const roleKey: CompanyRole = dto.role ?? "employee";
    if (roleKey !== "employee")
      await this.require(actor.id, organizationId, "manage:organization");
    const org = this.assertOpen(await this.organization(organizationId));
    const sub = await this.activeSubscription(organizationId);
    if (!sub)
      throw fail(
        HttpStatus.PAYMENT_REQUIRED,
        "SUBSCRIPTION_REQUIRED",
        "Your company needs an active plan before inviting people.",
      );

    const emails = [...new Set(dto.emails)];
    const department = this.tidyDepartment(dto.department);
    const [team, pendingInvites, assessment] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: this.teamWhere(organizationId),
        select: { user: { select: { email: true } } },
      }),
      this.prisma.employeeInvitation.findMany({
        where: {
          organization_id: organizationId,
          status: "pending",
          expires_at: { gt: new Date() },
        },
        select: { recipient_email: true },
      }),
      this.prisma.assessment.findFirst({
        where: { slug: "ocean-full", organization_id: null, deleted_at: null },
        select: { id: true },
      }),
    ]);
    if (!assessment)
      throw fail(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ASSESSMENT_UNAVAILABLE",
        "The assessment isn’t available right now.",
      );

    const members = new Set(team.map((m) => m.user.email.toLowerCase()));
    const invited = new Set(
      pendingInvites.map((i) => i.recipient_email.toLowerCase()),
    );
    const fresh = emails.filter((e) => !members.has(e) && !invited.has(e));

    const remaining = sub.seats_limit - team.length - pendingInvites.length;
    if (fresh.length > remaining) {
      throw fail(
        HttpStatus.CONFLICT,
        "SEATS_FULL",
        `Your plan has ${Math.max(0, remaining)} open ${remaining === 1 ? "seat" : "seats"}. Remove an invitation or upgrade your plan.`,
        { remaining: Math.max(0, remaining) },
      );
    }

    // An invitation past its date is still "pending" until the hourly job closes it; it must not block a fresh one.
    await this.prisma.employeeInvitation.updateMany({
      where: {
        organization_id: organizationId,
        status: "pending",
        expires_at: { lte: new Date() },
      },
      data: { status: "expired", open_key: null },
    });

    const expires = new Date(Date.now() + INVITE_DAYS * DAY_MS);
    const inviter = `${actor.first_name} ${actor.last_name}`.trim();
    const created: {
      id: string;
      email: string;
      status: string;
      link: string | null;
      email_status: string | null;
    }[] = [];

    for (const email of emails) {
      if (members.has(email)) {
        created.push({
          id: "",
          email,
          status: "already_member",
          link: null,
          email_status: null,
        });
        continue;
      }
      if (invited.has(email)) {
        created.push({
          id: "",
          email,
          status: "already_invited",
          link: null,
          email_status: null,
        });
        continue;
      }

      const token = this.newToken();
      let inv: { id: string };
      try {
        inv = await this.prisma.employeeInvitation.create({
          data: {
            organization_id: organizationId,
            sender_id: actor.id,
            recipient_email: email,
            department,
            job_title: dto.job_title ?? null,
            role_key: roleKey,
            // the database refuses a second waiting invitation for the same person, even from a simultaneous request
            open_key: this.invitationKey(organizationId, email),
            invitation_token: token,
            invitation_url: `/invite/${token}`,
            expires_at: expires,
            assessment_id: assessment.id,
          },
          select: { id: true },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          created.push({
            id: "",
            email,
            status: "already_invited",
            link: null,
            email_status: null,
          });
          continue;
        }
        throw err;
      }
      const link = this.linkFor(token);
      const email_status = await this.mail.sendInvitation(email, {
        organization: org.name,
        inviter,
        link,
        expires,
      });
      await this.audit(
        organizationId,
        actor.id,
        actor.id,
        "invitation.created",
        "employee_invitation",
        inv.id,
        { email },
      );
      created.push({
        id: inv.id,
        email,
        status: "invited",
        link,
        email_status,
      });
    }
    return { invitations: created };
  }

  async listInvitations(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "invite:members");
    const rows = await this.prisma.employeeInvitation.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
      take: 200,
      select: {
        id: true,
        recipient_email: true,
        department: true,
        job_title: true,
        role_key: true,
        status: true,
        expires_at: true,
        created_at: true,
        accepted_at: true,
        invitation_token: true,
      },
    });
    return {
      data: rows.map((r) => {
        const status = invitationStatus(r);
        return {
          id: r.id,
          email: r.recipient_email,
          department: r.department,
          job_title: r.job_title,
          role: r.role_key,
          status,
          sent_at: r.created_at,
          expires_at: r.expires_at,
          accepted_at: r.accepted_at,
          // The link is only useful while it can still be accepted.
          link: status === "pending" ? this.linkFor(r.invitation_token) : null,
        };
      }),
    };
  }

  private async ownInvitation(organizationId: string, invitationId: string) {
    const inv = await this.prisma.employeeInvitation.findFirst({
      where: { id: invitationId, organization_id: organizationId },
    });
    if (!inv) throw new NotFoundException("Invitation not found");
    return inv;
  }

  async revokeInvitation(
    actor: Person,
    organizationId: string,
    invitationId: string,
  ) {
    await this.require(actor.id, organizationId, "invite:members");
    const inv = await this.ownInvitation(organizationId, invitationId);
    if (inv.status !== "pending")
      throw fail(
        HttpStatus.CONFLICT,
        "INVITATION_NOT_PENDING",
        "Only a waiting invitation can be cancelled.",
      );
    await this.prisma.employeeInvitation.updateMany({
      where: { id: inv.id, status: "pending" },
      data: { status: "revoked", open_key: null },
    });
    await this.audit(
      organizationId,
      actor.id,
      actor.id,
      "invitation.revoked",
      "employee_invitation",
      inv.id,
    );
    return { revoked: true };
  }

  async resendInvitation(
    actor: Person,
    organizationId: string,
    invitationId: string,
  ) {
    await this.require(actor.id, organizationId, "invite:members");
    const org = this.assertOpen(await this.organization(organizationId));
    if (!(await this.activeSubscription(organizationId)))
      throw fail(
        HttpStatus.PAYMENT_REQUIRED,
        "SUBSCRIPTION_REQUIRED",
        "Your company needs an active plan before inviting people.",
      );
    const inv = await this.ownInvitation(organizationId, invitationId);
    if (
      invitationStatus(inv) !== "pending" &&
      invitationStatus(inv) !== "expired"
    )
      throw fail(
        HttpStatus.CONFLICT,
        "INVITATION_NOT_PENDING",
        "This invitation can’t be sent again.",
      );

    const expires = new Date(Date.now() + INVITE_DAYS * DAY_MS);
    try {
      await this.prisma.employeeInvitation.update({
        where: { id: inv.id },
        data: {
          status: "pending",
          expires_at: expires,
          open_key: this.invitationKey(organizationId, inv.recipient_email),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw fail(
          HttpStatus.CONFLICT,
          "INVITATION_EXISTS",
          "This person already has a newer waiting invitation.",
        );
      }
      throw err;
    }
    const link = this.linkFor(inv.invitation_token);
    const email_status = await this.mail.sendInvitation(inv.recipient_email, {
      organization: org.name,
      inviter: `${actor.first_name} ${actor.last_name}`.trim(),
      link,
      expires,
    });
    return { email_status, link, expires_at: expires };
  }

  /** What the person sees before signing in. Nothing here lets anyone but the invitee do anything. */
  async invitationInfo(token: string) {
    if (!TOKEN_FORMAT.test(token))
      throw new NotFoundException("Invitation not found");
    const inv = await this.prisma.employeeInvitation.findUnique({
      where: { invitation_token: token },
      include: {
        organization: { select: { name: true, type: true } },
        sender: { select: { first_name: true, last_name: true } },
      },
    });
    if (!inv) throw new NotFoundException("Invitation not found");
    const role = await this.prisma.role.findFirst({
      where: { scope: "organization", key: inv.role_key },
      select: { key: true, name: true },
    });
    return {
      status: invitationStatus(inv),
      organization_name: inv.organization.name,
      organization_type: inv.organization.type,
      inviter_name: `${inv.sender.first_name} ${inv.sender.last_name}`.trim(),
      // The link is a secret that was emailed to this very address, and it is what lets the sign-up and sign-in
      // forms fill the address in and lock it. Accepting still needs to be signed in as this address.
      email: inv.recipient_email,
      email_hint: maskEmail(inv.recipient_email),
      // The role is set by whoever invited: the person doesn't choose it.
      role: { key: role?.key ?? "employee", name: role?.name ?? "Employee" },
      department: inv.department,
      job_title: inv.job_title,
      expires_at: inv.expires_at,
    };
  }

  async acceptInvitation(user: Person, token: string) {
    if (!TOKEN_FORMAT.test(token))
      throw new NotFoundException("Invitation not found");
    const inv = await this.prisma.employeeInvitation.findUnique({
      where: { invitation_token: token },
      include: {
        organization: {
          select: { id: true, name: true, status: true, deleted_at: true },
        },
      },
    });
    if (!inv) throw new NotFoundException("Invitation not found");

    const done = {
      organization: { id: inv.organization.id, name: inv.organization.name },
      next: { href: "/assessments/full" },
    };
    if (inv.status === "accepted" && inv.accepted_by_user_id === user.id)
      return { ...done, already_accepted: true };

    requireVerifiedEmail(user);
    const status = invitationStatus(inv);
    if (status !== "pending") {
      throw fail(
        HttpStatus.CONFLICT,
        `INVITATION_${status.toUpperCase()}`,
        status === "expired"
          ? "This invitation has expired. Ask the company to send a new one."
          : status === "revoked"
            ? "This invitation was cancelled."
            : "This invitation has already been used.",
      );
    }
    // The link alone isn't enough: it only works for the address it was sent to.
    if (user.email.toLowerCase() !== inv.recipient_email.toLowerCase()) {
      throw fail(
        HttpStatus.FORBIDDEN,
        "INVITATION_EMAIL_MISMATCH",
        "This invitation was sent to a different email address. Sign in with that address to accept it.",
      );
    }
    if (
      inv.organization.deleted_at ||
      inv.organization.status !== "active" ||
      !(await this.activeSubscription(inv.organization_id))
    ) {
      throw fail(
        HttpStatus.CONFLICT,
        "ORGANIZATION_INACTIVE",
        "This company can’t take new people right now.",
      );
    }

    const employee = await this.prisma.role.findFirst({
      where: { scope: "organization", key: inv.role_key },
      select: { id: true },
    });
    if (!employee)
      throw fail(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ROLE_MISSING",
        "Please try again shortly.",
      );

    await this.prisma.$transaction(async (tx) => {
      // Only one of two simultaneous accepts wins.
      const claimed = await tx.employeeInvitation.updateMany({
        where: { id: inv.id, status: "pending" },
        data: {
          status: "accepted",
          accepted_at: new Date(),
          accepted_by_user_id: user.id,
          open_key: null,
        },
      });
      if (claimed.count === 0)
        throw fail(
          HttpStatus.CONFLICT,
          "INVITATION_ACCEPTED",
          "This invitation has already been used.",
        );

      const now = new Date();
      const existing = await tx.organizationMember.findUnique({
        where: {
          user_id_organization_id: {
            user_id: user.id,
            organization_id: inv.organization_id,
          },
        },
      });
      if (existing && existing.status === "suspended" && !existing.deleted_at) {
        throw fail(
          HttpStatus.CONFLICT,
          "MEMBER_SUSPENDED",
          "Your access to this company has been paused. Ask the company to restore it.",
        );
      }
      if (existing && existing.status === "active" && !existing.deleted_at) {
        // Already inside (for example an administrator): keep their role, record the consent.
        await tx.organizationMember.update({
          where: { id: existing.id },
          data: {
            consented_at: existing.consented_at ?? now,
            department: inv.department ?? existing.department,
            job_title: inv.job_title ?? existing.job_title,
          },
        });
      } else {
        await tx.organizationMember.upsert({
          where: {
            user_id_organization_id: {
              user_id: user.id,
              organization_id: inv.organization_id,
            },
          },
          create: {
            user_id: user.id,
            organization_id: inv.organization_id,
            role_id: employee.id,
            department: inv.department,
            job_title: inv.job_title,
            consented_at: now,
          },
          update: {
            status: "active",
            deleted_at: null,
            role_id: employee.id,
            department: inv.department,
            job_title: inv.job_title,
            consented_at: now,
          },
        });
      }

      // The limit is the plan's, or the free limit when payments are off (then there is no plan row to read).
      const limit = this.billing.paymentsEnabled()
        ? (
            await tx.subscription.findUnique({
              where: { organization_id: inv.organization_id },
            })
          )?.seats_limit
        : this.billing.freeOrganizationSeats();
      const used = await this.syncSeats(inv.organization_id, tx);
      if (limit !== undefined && used > limit)
        throw fail(
          HttpStatus.CONFLICT,
          "SEATS_FULL",
          "This company has no open seats right now. Ask them to free one up.",
        );
    });

    await this.audit(
      inv.organization_id,
      user.id,
      user.id,
      "invitation.accepted",
      "employee_invitation",
      inv.id,
    );
    return { ...done, already_accepted: false };
  }

  // ------------------------------------------------------------ one member, the company profile, pausing people

  /** Everything about one person in this company except their scores (those stay behind the audited result view). */
  async memberDetail(actor: Person, organizationId: string, targetId: string) {
    await this.require(actor.id, organizationId, "read:team_results");
    const m = await this.prisma.organizationMember.findFirst({
      where: {
        organization_id: organizationId,
        user_id: targetId,
        status: { in: ["active", "suspended"] },
        deleted_at: null,
      },
      include: {
        role: { select: { key: true, name: true } },
        user: { select: { first_name: true, last_name: true, email: true } },
      },
    });
    if (!m) throw new NotFoundException("Person not found in this company");

    const [submissions, retakes, invite, permissions] = await Promise.all([
      this.prisma.assessmentSubmission.findMany({
        where: {
          organization_id: organizationId,
          user_id: targetId,
          deleted_at: null,
        },
        orderBy: { started_at: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          started_at: true,
          completed_at: true,
          progress_percent: true,
          submission_number: true,
          assessment: { select: { name: true, type: true } },
          result: { select: { id: true } },
        },
      }),
      this.prisma.retakeRequest.findMany({
        where: { organization_id: organizationId, user_id: targetId },
        orderBy: { created_at: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          requested_by: true,
          created_at: true,
          decided_at: true,
          expires_at: true,
          assessment: { select: { name: true } },
        },
      }),
      this.prisma.employeeInvitation.findFirst({
        where: {
          organization_id: organizationId,
          accepted_by_user_id: targetId,
        },
        orderBy: { accepted_at: "desc" },
        select: {
          created_at: true,
          accepted_at: true,
          role_key: true,
          sender: { select: { first_name: true, last_name: true } },
        },
      }),
      this.rbac.permissionsInOrganization(actor.id, organizationId),
    ]);

    const isMe = targetId === actor.id;
    const canManage =
      permissions.includes("manage:team") &&
      !isMe &&
      m.role.key !== "admin" &&
      (m.role.key !== "hr" || permissions.includes("manage:organization"));
    return {
      person: {
        user_id: targetId,
        name: `${m.user.first_name} ${m.user.last_name}`.trim(),
        email: m.user.email,
        role: m.role.key,
        role_name: m.role.name,
        department: m.department,
        job_title: m.job_title,
        joined_at: m.consented_at ?? m.joined_at,
        status: m.status,
        shares_results: m.consented_at !== null,
        suspended_reason: m.status === "suspended" ? m.suspended_reason : null,
      },
      invitation: invite
        ? {
            sent_at: invite.created_at,
            accepted_at: invite.accepted_at,
            role: invite.role_key,
            invited_by:
              `${invite.sender.first_name} ${invite.sender.last_name}`.trim(),
          }
        : null,
      assessments: submissions.map((x) => ({
        id: x.id,
        name: x.assessment.name,
        type: x.assessment.type,
        status: x.status,
        attempt: x.submission_number,
        progress_percent: x.progress_percent,
        started_at: x.started_at,
        completed_at: x.completed_at,
        result_id: m.status === "active" ? (x.result?.id ?? null) : null,
      })),
      retakes: retakes.map((r) => ({
        id: r.id,
        assessment: r.assessment.name,
        status: r.status,
        requested_by: r.requested_by,
        requested_at: r.created_at,
        decided_at: r.decided_at,
        expires_at: r.expires_at,
      })),
      can: {
        suspend: canManage && m.status === "active",
        reactivate: canManage && m.status === "suspended",
        remove: canManage,
        view_result: m.status === "active",
      },
    };
  }

  /** The company's own details. Anyone who can see the team can read it; only an administrator can change it. */
  async profile(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "read:team_results");
    const [org, permissions, sub, staff, members] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: organizationId, deleted_at: null },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          suspended_reason: true,
          admin_name: true,
          admin_email: true,
          admin_phone: true,
          created_at: true,
        },
      }),
      this.rbac.permissionsInOrganization(userId, organizationId),
      this.prisma.subscription.findUnique({
        where: { organization_id: organizationId },
      }),
      this.prisma.organizationMember.findMany({
        where: {
          organization_id: organizationId,
          status: "active",
          deleted_at: null,
          role: { key: { in: ["admin", "hr"] } },
        },
        orderBy: { joined_at: "asc" },
        select: {
          role: { select: { key: true, name: true } },
          user: { select: { first_name: true, last_name: true, email: true } },
        },
      }),
      this.prisma.organizationMember.count({
        where: this.teamWhere(organizationId),
      }),
    ]);
    if (!org) throw new NotFoundException("Company not found");
    return {
      ...org,
      suspended_reason:
        org.status === "suspended" ? org.suspended_reason : null,
      plan: this.billing.paymentsEnabled()
        ? sub
          ? {
              name: sub.plan_name,
              active:
                sub.status === "active" && sub.end_date.getTime() > Date.now(),
              end_date: sub.end_date,
              seats_limit: sub.seats_limit,
            }
          : null
        : {
            name: "Free",
            active: true,
            end_date: null,
            seats_limit: this.billing.freeOrganizationSeats(),
          },
      people: members,
      leaders: staff.map((p) => ({
        name: `${p.user.first_name} ${p.user.last_name}`.trim(),
        email: p.user.email,
        role: p.role.key,
        role_name: p.role.name,
      })),
      can_edit: permissions.includes("manage:organization"),
    };
  }

  async updateProfile(
    actor: Person,
    organizationId: string,
    dto: { name?: string; admin_name?: string; admin_phone?: string | null },
  ) {
    await this.require(actor.id, organizationId, "manage:organization");
    const org = await this.organization(organizationId);
    const data: Prisma.OrganizationUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const current = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, admin_name: true, admin_phone: true },
    });
    for (const key of ["name", "admin_name", "admin_phone"] as const) {
      if (dto[key] === undefined) continue;
      const next =
        typeof dto[key] === "string"
          ? (dto[key] as string).trim() || null
          : dto[key];
      if ((key === "name" || key === "admin_name") && !next)
        throw fail(
          HttpStatus.BAD_REQUEST,
          "REQUIRED",
          "The name can’t be empty.",
        );
      if (next !== current[key]) {
        (data as Record<string, unknown>)[key] = next;
        changes[key] = { from: current[key], to: next };
      }
    }
    if (Object.keys(data).length === 0)
      return { changed: false, name: org.name };
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
      select: { name: true, admin_name: true, admin_phone: true },
    });
    await this.audit(
      organizationId,
      actor.id,
      actor.id,
      "organization.updated",
      "organization",
      organizationId,
      changes as unknown as Prisma.InputJsonValue,
    );
    return { changed: true, ...updated };
  }

  /**
   * Pauses one person's access: they drop out of the team (their results are hidden from it, not deleted), cannot take
   * assessments through the company, and the seat is freed. Administrators cannot be paused, and only an administrator can pause HR.
   */
  async suspendMember(
    actor: Person,
    organizationId: string,
    targetId: string,
    reason?: string,
  ) {
    await this.require(actor.id, organizationId, "manage:team");
    if (targetId === actor.id)
      throw fail(
        HttpStatus.BAD_REQUEST,
        "CANNOT_PAUSE_SELF",
        "You can’t pause your own access.",
      );
    const target = await this.activeMembership(organizationId, targetId);
    if (!target)
      throw new NotFoundException("Person not found in this company");
    if (target.role.key === "admin")
      throw fail(
        HttpStatus.CONFLICT,
        "CANNOT_PAUSE_ADMIN",
        "A company administrator’s access can’t be paused. Change their role first.",
      );
    if (target.role.key === "hr")
      await this.require(actor.id, organizationId, "manage:organization");
    const note = (reason ?? "").trim().slice(0, 300) || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({
        where: { id: target.id },
        data: { status: "suspended", suspended_reason: note },
      });
      await this.syncSeats(organizationId, tx);
    });
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.suspended",
      "organization_member",
      target.id,
      note ? { reason: note } : undefined,
    );
    return { status: "suspended" };
  }

  async reactivateMember(
    actor: Person,
    organizationId: string,
    targetId: string,
  ) {
    await this.require(actor.id, organizationId, "manage:team");
    const target = await this.prisma.organizationMember.findUnique({
      where: {
        user_id_organization_id: {
          user_id: targetId,
          organization_id: organizationId,
        },
      },
      include: { role: { select: { key: true } } },
    });
    if (!target || target.deleted_at || target.status !== "suspended")
      throw new NotFoundException("No paused person found");
    if (target.role.key === "hr")
      await this.require(actor.id, organizationId, "manage:organization");
    const sub = await this.activeSubscription(organizationId);
    if (!sub)
      throw fail(
        HttpStatus.PAYMENT_REQUIRED,
        "SUBSCRIPTION_REQUIRED",
        "Your company needs an active plan before restoring someone.",
      );
    const [team, waiting] = await Promise.all([
      this.prisma.organizationMember.count({
        where: this.teamWhere(organizationId),
      }),
      this.prisma.employeeInvitation.count({
        where: {
          organization_id: organizationId,
          status: "pending",
          expires_at: { gt: new Date() },
        },
      }),
    ]);
    if (team + waiting >= sub.seats_limit)
      throw fail(
        HttpStatus.CONFLICT,
        "SEATS_FULL",
        "There is no open seat to restore this person into. Free one up or upgrade your plan.",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({
        where: { id: target.id },
        data: { status: "active", suspended_reason: null },
      });
      await this.syncSeats(organizationId, tx);
    });
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.reactivated",
      "organization_member",
      target.id,
    );
    return { status: "active" };
  }

  // ------------------------------------------------------------ roles

  private otherAdmins(organizationId: string, exceptUserId: string) {
    return this.prisma.organizationMember.count({
      where: {
        organization_id: organizationId,
        user_id: { not: exceptUserId },
        status: "active",
        deleted_at: null,
        role: { key: "admin" },
      },
    });
  }

  /** Administrators and HR who are not part of the "team" (they never accepted an invitation), so their role can still be managed. */
  async staff(userId: string, organizationId: string) {
    await this.require(userId, organizationId, "manage:organization");
    const rows = await this.prisma.organizationMember.findMany({
      where: {
        organization_id: organizationId,
        status: "active",
        deleted_at: null,
        role: { key: { in: ["admin", "hr"] } },
      },
      orderBy: { joined_at: "asc" },
      select: {
        role: { select: { key: true } },
        user: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
    return {
      data: rows.map((r) => ({
        user_id: r.user.id,
        name: `${r.user.first_name} ${r.user.last_name}`.trim(),
        email: r.user.email,
        role: r.role.key,
      })),
    };
  }

  /** Makes someone an administrator, HR or an employee. Only administrators can; the company always keeps at least one. */
  async setMemberRole(
    actor: Person,
    organizationId: string,
    targetId: string,
    role: CompanyRole,
  ) {
    await this.require(actor.id, organizationId, "manage:organization");
    const member = await this.activeMembership(organizationId, targetId);
    if (!member)
      throw new NotFoundException("Person not found in this company");
    if (member.role.key === role) return { role };
    if (
      member.role.key === "admin" &&
      (await this.otherAdmins(organizationId, targetId)) === 0
    ) {
      throw fail(
        HttpStatus.CONFLICT,
        "LAST_ADMIN",
        "A company needs at least one administrator. Make someone else an administrator first.",
      );
    }
    const row = await this.prisma.role.findFirst({
      where: { scope: "organization", key: role },
      select: { id: true },
    });
    if (!row)
      throw fail(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ROLE_MISSING",
        "Please try again shortly.",
      );
    await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { role_id: row.id },
    });
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.role_changed",
      "organization_member",
      member.id,
      { from: member.role.key, to: role },
    );
    return { role };
  }

  // ------------------------------------------------------------ departments

  /**
   * The list of departments to choose from lives in the website (a select), not here. The server only stores what it
   * is given, with spaces tidied; blank means none.
   */
  private tidyDepartment(value: string | null | undefined): string | null {
    const name = (value ?? "").trim().replace(/\s+/g, " ");
    return name || null;
  }

  async setMemberDepartment(
    actor: Person,
    organizationId: string,
    targetId: string,
    value: string | null | undefined,
  ) {
    await this.require(actor.id, organizationId, "manage:team");
    const member = await this.activeMembership(organizationId, targetId);
    if (!member)
      throw new NotFoundException("Person not found in this company");
    const department = this.tidyDepartment(value);
    await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { department },
    });
    await this.audit(
      organizationId,
      actor.id,
      targetId,
      "member.department_changed",
      "organization_member",
      member.id,
      { from: member.department, to: department },
    );
    return { department };
  }

  // ------------------------------------------------------------ reminders

  /**
   * Emails everyone who hasn't finished. Nobody is reminded twice within REMIND_EVERY_DAYS, so a click-happy
   * administrator can't turn this into spam. The audit trail doubles as the "last reminded" record.
   */
  async remind(actor: Person, organizationId: string) {
    await this.require(actor.id, organizationId, "invite:members");
    const org = this.assertOpen(await this.organization(organizationId));
    if (!(await this.activeSubscription(organizationId)))
      throw fail(
        HttpStatus.PAYMENT_REQUIRED,
        "SUBSCRIPTION_REQUIRED",
        "Your company needs an active plan before sending reminders.",
      );

    const waiting = (await this.loadTeam(organizationId)).filter(
      (m) => m.status !== "completed",
    );
    if (waiting.length === 0)
      return { sent: 0, skipped_recent: 0, not_emailed: 0, waiting: 0 };

    const since = new Date(Date.now() - REMIND_EVERY_DAYS * DAY_MS);
    const recent = await this.prisma.auditLog.findMany({
      where: {
        organization_id: organizationId,
        action: "member.reminded",
        user_id: { in: waiting.map((m) => m.user_id) },
        created_at: { gt: since },
      },
      select: { user_id: true },
    });
    const recentlyReminded = new Set(recent.map((r) => r.user_id));

    const sender = `${actor.first_name} ${actor.last_name}`.trim();
    let sent = 0;
    let notEmailed = 0;
    for (const m of waiting) {
      if (recentlyReminded.has(m.user_id)) continue;
      const outcome = await this.mail.sendReminder(m.email, {
        first_name: m.name.split(" ")[0],
        organization: org.name,
        sender,
        link: `${this.billing.frontendUrl}/assessments/full`,
      });
      if (outcome === "sent") {
        sent++;
        await this.audit(
          organizationId,
          actor.id,
          m.user_id,
          "member.reminded",
          "organization_member",
          m.user_id,
        );
      } else {
        notEmailed++;
      }
    }
    return {
      sent,
      skipped_recent: recentlyReminded.size,
      not_emailed: notEmailed,
      waiting: waiting.length,
    };
  }

  // ------------------------------------------------------------ exports

  async exportCsv(actor: Person, organizationId: string) {
    await this.require(actor.id, organizationId, "export:results");
    const org = await this.organization(organizationId);
    const team = await this.loadTeam(organizationId);

    const header = [
      "Name",
      "Email",
      "Department",
      "Job title",
      "Role",
      "Status",
      "Completed on",
      ...TRAITS.map((t) => `${TRAIT_META[t].name} score`),
      ...TRAITS.map((t) => `${TRAIT_META[t].name} level`),
      "Personality class",
    ];
    const rows = [...team]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => [
        m.name,
        m.email,
        m.department,
        m.job_title,
        m.role,
        m.status.replace("_", " "),
        m.result ? m.result.completed_at.toISOString().slice(0, 10) : "",
        ...TRAITS.map((t) =>
          m.result ? Math.round(m.result.scores[t] * 10) / 10 : "",
        ),
        ...TRAITS.map((t) =>
          m.result ? LEVEL_LABELS[levelFor(m.result.scores[t])] : "",
        ),
        m.profile_class?.name ?? "",
      ]);

    await this.audit(
      organizationId,
      actor.id,
      actor.id,
      "results.exported",
      "organization",
      organizationId,
      { format: "csv", people: team.length },
    );
    return {
      csv: toCsv(header, rows),
      filename: `team-results-${new Date().toISOString().slice(0, 10)}.csv`,
      organization: org.name,
    };
  }

  async exportPdf(actor: Person, organizationId: string) {
    await this.require(actor.id, organizationId, "export:results");
    const org = await this.organization(organizationId);
    const summary = this.summarise(await this.loadTeam(organizationId));

    const html = renderTeamReportHtml({
      organization: org.name,
      generatedAt: new Date(),
      members: summary.members,
      completed: summary.completed,
      inProgress: summary.in_progress,
      notStarted: summary.not_started,
      distribution: summary.distribution,
      departments: summary.departments,
    });

    let pdf: Buffer;
    try {
      pdf = await this.pdf.render(html);
    } catch (err) {
      if (err instanceof PdfUnavailableError)
        throw fail(
          HttpStatus.SERVICE_UNAVAILABLE,
          "REPORT_UNAVAILABLE",
          "PDF reports aren’t available right now.",
        );
      this.logger.error(`Team PDF failed: ${(err as Error).message}`);
      throw fail(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "REPORT_FAILED",
        "We couldn’t create the report. Please try again.",
      );
    }
    await this.audit(
      organizationId,
      actor.id,
      actor.id,
      "results.exported",
      "organization",
      organizationId,
      { format: "pdf" },
    );
    return {
      pdf,
      filename: `team-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    };
  }
}
