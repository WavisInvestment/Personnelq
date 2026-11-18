import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { AuthService } from "../auth/auth.service";
import {
  ChangeEmailDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from "./dto/account.dto";

const fail = (
  status: HttpStatus,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => new HttpException({ statusCode: status, message, code, ...extra }, status);

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  private async user(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** Asking for the password again before anything that changes how the account is secured or whether it exists. */
  private async confirmPassword(
    user: { password_hash: string },
    password: string,
  ) {
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw fail(
        HttpStatus.FORBIDDEN,
        "WRONG_PASSWORD",
        "That password isn’t right.",
      );
    }
  }

  /**
   * An account created from a company's invitation belongs to that company while the person is still in it: it can't
   * be deleted and its email address can't be changed. Once the company removes them it is theirs again.
   */
  private async managedBy(user: {
    id: string;
    joined_via_organization_id: string | null;
  }) {
    if (!user.joined_via_organization_id) return null;
    const m = await this.prisma.organizationMember.findFirst({
      where: {
        user_id: user.id,
        organization_id: user.joined_via_organization_id,
        status: { in: ["active", "suspended"] },
        deleted_at: null,
        organization: { deleted_at: null },
      },
      select: { organization: { select: { name: true } } },
    });
    return m ? m.organization.name : null;
  }

  private async assertNotManaged(
    user: { id: string; joined_via_organization_id: string | null },
    what: string,
  ) {
    const company = await this.managedBy(user);
    if (company) {
      throw fail(
        HttpStatus.FORBIDDEN,
        "ACCOUNT_MANAGED",
        `This account was created from ${company}’s invitation, so you can’t ${what}. Ask ${company} if something needs to change.`,
      );
    }
  }

  async get(userId: string) {
    const user = await this.user(userId);
    const managed_by = await this.managedBy(user);
    const [memberships, sessions] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { user_id: userId, status: "active", deleted_at: null },
        select: {
          role: { select: { key: true } },
          organization: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.session.count({
        where: { user_id: userId, expires_at: { gt: new Date() } },
      }),
    ]);
    return {
      id: user.id,
      email: user.email,
      pending_email: user.pending_email,
      email_verified: user.email_verified,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: user.created_at,
      signed_in_devices: sessions,
      managed: managed_by !== null,
      managed_by,
      organizations: memberships.map((m) => ({
        ...m.organization,
        role: m.role.key,
      })),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.user(userId);
    const data = {
      ...(dto.first_name && { first_name: dto.first_name }),
      ...(dto.last_name && { last_name: dto.last_name }),
    };
    if (Object.keys(data).length === 0)
      throw new BadRequestException("Nothing to change");
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { first_name: true, last_name: true },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.password !== dto.password_confirm)
      throw new BadRequestException("Passwords do not match");
    const user = await this.user(userId);
    await this.confirmPassword(user, dto.current_password);
    if (dto.password === dto.current_password)
      throw fail(
        HttpStatus.BAD_REQUEST,
        "SAME_PASSWORD",
        "Choose a password you haven’t used just now.",
      );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          password_hash: await bcrypt.hash(dto.password, 10),
          password_reset_token: null,
          password_reset_expires: null,
        },
      }),
      // Every other device is signed out; this one keeps going.
      this.prisma.session.deleteMany({
        where: {
          user_id: userId,
          ...(dto.refresh_token
            ? { refresh_token: { not: dto.refresh_token } }
            : {}),
        },
      }),
    ]);
    return { changed: true };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.user(userId);
    await this.assertNotManaged(user, "change its email address");
    await this.confirmPassword(user, dto.password);
    if (dto.email === user.email)
      throw fail(
        HttpStatus.BAD_REQUEST,
        "SAME_EMAIL",
        "That is already your email address.",
      );
    if (
      await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      })
    ) {
      throw fail(
        HttpStatus.CONFLICT,
        "EMAIL_TAKEN",
        "That email address can’t be used for this account.",
      );
    }
    // The address only changes once its owner clicks the link we send there. Until then sign-in keeps using the old one.
    await this.prisma.user.update({
      where: { id: userId },
      data: { pending_email: dto.email },
    });
    const email_status = await this.auth.sendVerification(
      userId,
      dto.email,
      user.first_name,
    );
    return { pending_email: dto.email, email_status };
  }

  async signOutEverywhere(userId: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { user_id: userId },
    });
    return { signed_out: count };
  }

  /** Everything we hold about the person, as one file (their right to a copy). */
  async exportData(userId: string) {
    const user = await this.user(userId);
    const [memberships, submissions, results, badges, payments, activity] =
      await Promise.all([
        this.prisma.organizationMember.findMany({
          where: { user_id: userId },
          select: {
            department: true,
            job_title: true,
            status: true,
            joined_at: true,
            organization: { select: { name: true } },
            role: { select: { name: true } },
          },
        }),
        this.prisma.assessmentSubmission.findMany({
          where: { user_id: userId, deleted_at: null },
          orderBy: { started_at: "asc" },
          select: {
            status: true,
            started_at: true,
            completed_at: true,
            assessment: { select: { name: true, version: true } },
            answers: {
              select: {
                answer_value: true,
                question: {
                  select: { question_number: true, question_text: true },
                },
              },
            },
          },
        }),
        this.prisma.assessmentResult.findMany({
          where: { user_id: userId, deleted_at: null },
          orderBy: { calculated_at: "asc" },
          select: {
            calculated_at: true,
            overall_score: true,
            custom_scores: true,
            ai_interpretation: true,
            assessment: { select: { name: true } },
            openness_score: true,
            conscientiousness_score: true,
            extraversion_score: true,
            agreeableness_score: true,
            neuroticism_score: true,
          },
        }),
        this.prisma.shareableBadge.findMany({ where: { user_id: userId } }),
        this.prisma.payment.findMany({
          where: { user_id: userId },
          orderBy: { created_at: "asc" },
          select: {
            created_at: true,
            amount: true,
            currency: true,
            status: true,
            description: true,
            provider_reference: true,
          },
        }),
        this.prisma.auditLog.findMany({
          where: { user_id: userId },
          orderBy: { created_at: "asc" },
          select: {
            created_at: true,
            action: true,
            organization: { select: { name: true } },
          },
        }),
      ]);
    return {
      exported_at: new Date().toISOString(),
      account: {
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        created_at: user.created_at,
        email_verified: user.email_verified,
      },
      companies: memberships,
      assessments: submissions,
      results,
      // The link token is a secret that grants access; the copy keeps the settings but not the token.
      badges: badges.map(({ share_token: _token, ...rest }: any) => rest),
      payments,
      company_activity_about_you: activity,
    };
  }

  /**
   * Deletes the person's content and anonymises the account row (it must stay: payments and company audit trails point
   * at it). A company's only administrator can't just vanish while other people depend on the company.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.user(userId);
    if (user.platform_role_id)
      throw fail(
        HttpStatus.FORBIDDEN,
        "STAFF_ACCOUNT",
        "Platform staff accounts are removed by another administrator.",
      );
    await this.assertNotManaged(user, "delete it");
    await this.confirmPassword(user, password);

    const admin = await this.prisma.organizationMember.findMany({
      where: {
        user_id: userId,
        status: "active",
        deleted_at: null,
        role: { key: "admin" },
      },
      select: {
        organization_id: true,
        organization: { select: { name: true } },
      },
    });
    const alone: string[] = [];
    const blocked: string[] = [];
    for (const m of admin) {
      const others = await this.prisma.organizationMember.findMany({
        where: {
          organization_id: m.organization_id,
          user_id: { not: userId },
          status: "active",
          deleted_at: null,
        },
        select: { role: { select: { key: true } } },
      });
      if (others.length === 0) alone.push(m.organization_id);
      else if (!others.some((o) => o.role.key === "admin"))
        blocked.push(m.organization.name);
    }
    if (blocked.length) {
      throw fail(
        HttpStatus.CONFLICT,
        "SOLE_ADMIN",
        `You are the only administrator of ${blocked.join(", ")}. Make someone else an administrator, or remove everyone, before deleting your account.`,
        { organizations: blocked },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // A company with nobody else in it closes with its administrator.
      if (alone.length) {
        await tx.employeeInvitation.updateMany({
          where: { organization_id: { in: alone }, status: "pending" },
          data: { status: "revoked", open_key: null },
        });
        await tx.organization.updateMany({
          where: { id: { in: alone } },
          data: {
            deleted_at: new Date(),
            status: "inactive",
            subscription_status: "inactive",
          },
        });
      }
      await tx.organizationMember.deleteMany({ where: { user_id: userId } });
      await tx.shareableBadge.deleteMany({ where: { user_id: userId } });
      await tx.assessmentResult.deleteMany({ where: { user_id: userId } });
      await tx.assessmentSubmission.deleteMany({ where: { user_id: userId } });
      await tx.personalityProfile.deleteMany({ where: { user_id: userId } });
      await tx.retakeRequest.deleteMany({ where: { user_id: userId } });
      await tx.idempotencyKey.deleteMany({ where: { user_id: userId } });
      await tx.session.deleteMany({ where: { user_id: userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@deleted.invalid`,
          first_name: "Deleted",
          last_name: "user",
          phone_number: null,
          avatar_url: null,
          // Not a bcrypt hash, so no password can ever match it.
          password_hash: randomBytes(32).toString("hex"),
          password_reset_token: null,
          password_reset_expires: null,
          email_verify_token: null,
          email_verify_expires: null,
          pending_email: null,
          email_verified: false,
          deleted_at: new Date(),
        },
      });
    });
    this.logger.log(`Account ${userId} deleted`);
    return { deleted: true };
  }
}
