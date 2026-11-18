import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import {
  AuthResponseDto,
  SessionOrganizationDto,
} from "./dto/auth-response.dto";
import { slugify } from "./utils/slug";
import { MailService } from "../../common/mail/mail.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async signup(
    signupDto: SignupDto,
    ip_address: string,
    user_agent: string,
  ): Promise<AuthResponseDto> {
    const { first_name, last_name, password, password_confirm } = signupDto;
    let email = signupDto.email;

    // Validate password match
    if (password !== password_confirm) {
      throw new BadRequestException("Passwords do not match");
    }

    let joinedVia: string | null = null;

    // From an invitation link the email isn't a choice: it must be the address the invitation was sent to.
    if (signupDto.invitation_token) {
      const invitation = await this.prisma.employeeInvitation.findUnique({
        where: { invitation_token: signupDto.invitation_token },
        select: {
          recipient_email: true,
          status: true,
          expires_at: true,
          organization_id: true,
        },
      });
      if (
        !invitation ||
        invitation.status !== "pending" ||
        invitation.expires_at.getTime() <= Date.now()
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            "This invitation is no longer valid. Ask the company to send you a new one.",
          code: "INVITATION_INVALID",
        });
      }
      if (
        email.trim().toLowerCase() !== invitation.recipient_email.toLowerCase()
      ) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            "An invitation can only be used with the email address it was sent to.",
          code: "INVITATION_EMAIL_MISMATCH",
        });
      }
      if ((signupDto.account_type ?? "individual") !== "individual") {
        throw new BadRequestException({
          statusCode: 400,
          message: "People who are invited join as individuals.",
          code: "INVITATION_ACCOUNT_TYPE",
        });
      }
      email = invitation.recipient_email;
      joinedVia = invitation.organization_id;
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create the user and, when signing up as an organisation, the organisation and its admin
    // membership, all-or-nothing so nobody ends up with a half-made account.
    const account_type = signupDto.account_type ?? "individual";
    let organizations: SessionOrganizationDto[] = [];

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          first_name,
          last_name,
          password_hash,
          // An invitation link was emailed to this very address, which already proves it is theirs.
          ...(signupDto.invitation_token
            ? { email_verified: true, email_verified_at: new Date() }
            : {}),
          // An account made from an invitation belongs to that company: it cannot leave it.
          joined_via_organization_id: joinedVia,
          // Everyone starts as an individual; the role row is created by the migration / seed.
          account_role: {
            connect: { scope_key: { scope: "account", key: "individual" } },
          },
        },
      });

      if (account_type !== "individual") {
        const name = (signupDto.organization_name ?? "").trim();
        const org = await tx.organization.create({
          data: {
            name,
            slug: await this.uniqueSlug(tx, name),
            type: account_type,
            admin_name: `${first_name} ${last_name}`,
            admin_email: email,
          },
        });
        await tx.organizationMember.create({
          data: {
            user: { connect: { id: created.id } },
            organization: { connect: { id: org.id } },
            role: {
              connect: { scope_key: { scope: "organization", key: "admin" } },
            },
          },
        });
        organizations = [
          {
            id: org.id,
            name: org.name,
            slug: org.slug,
            type: org.type,
            role: "admin",
          },
        ];
      }

      return created;
    });

    if (!signupDto.invitation_token)
      await this.sendVerification(user.id, user.email, user.first_name);

    // Create session with refresh token
    const refresh_token = this.generateRandomToken();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token,
        ip_address,
        user_agent,
        expires_at,
      },
    });

    // Generate JWT tokens
    const access_token = this.generateAccessToken(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        platform_role: null,
        email_verified: !!signupDto.invitation_token,
        organizations,
      },
    };
  }

  async login(
    loginDto: LoginDto,
    ip_address: string,
    user_agent: string,
  ): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        platform_role: { select: { key: true } },
        organization_members: {
          where: { status: "active", deleted_at: null },
          select: {
            role: { select: { key: true } },
            organization: {
              select: { id: true, name: true, slug: true, type: true },
            },
          },
        },
      },
    });

    if (!user || user.deleted_at) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Check if account is locked
    if (user.locked_until && user.locked_until > new Date()) {
      throw new UnauthorizedException(
        "Account is temporarily locked. Please try again later.",
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const failed_attempts = user.failed_login_attempts + 1;
      const locked_until =
        failed_attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: failed_attempts,
          locked_until,
        },
      });

      throw new UnauthorizedException("Invalid email or password");
    }

    // Only now (the password was right) say why: it does not reveal anything to someone guessing.
    if (user.suspended_at) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "ACCOUNT_SUSPENDED",
        message:
          "This account has been suspended. Contact support if you think that is a mistake.",
      });
    }

    // Reset failed login attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
      },
    });

    // Create new session
    const refresh_token = this.generateRandomToken();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token,
        ip_address,
        user_agent,
        expires_at,
      },
    });

    // Generate tokens
    const access_token = this.generateAccessToken(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        platform_role: user.platform_role?.key ?? null,
        email_verified: user.email_verified,
        organizations: (user.organization_members ?? []).map((m) => ({
          ...m.organization,
          role: m.role.key,
        })),
      },
    };
  }

  async refreshToken(refresh_token: string): Promise<{ access_token: string }> {
    // Find session
    const session = await this.prisma.session.findUnique({
      where: { refresh_token },
      include: { user: true },
    });

    if (
      !session ||
      session.expires_at < new Date() ||
      session.user.deleted_at ||
      session.user.suspended_at
    ) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Generate new access token
    const access_token = this.generateAccessToken(session.user.id);

    // Update token version for refresh token rotation
    await this.prisma.session.update({
      where: { id: session.id },
      data: { token_version: session.token_version + 1 },
    });

    return { access_token };
  }

  async logout(user_id: string, refresh_token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        user_id,
        refresh_token,
      },
    });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericResponse = {
      message:
        "If an account exists for that email, a reset link has been sent.",
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deleted_at) {
      return genericResponse;
    }

    const token = this.generateRandomToken();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: this.hashToken(token),
        password_reset_expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    await this.mailService.sendPasswordReset(
      user.email,
      user.first_name,
      `${frontendUrl}/auth/reset-password?token=${token}`,
    );

    return genericResponse;
  }

  async resetPassword(
    token: string,
    password: string,
    password_confirm: string,
  ): Promise<{ message: string }> {
    if (password !== password_confirm) {
      throw new BadRequestException("Passwords do not match");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        password_reset_token: this.hashToken(token),
        password_reset_expires: { gt: new Date() },
        deleted_at: null,
      },
    });

    if (!user) {
      throw new BadRequestException("Reset link is invalid or has expired");
    }

    const password_hash = await bcrypt.hash(password, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        password_reset_token: null,
        password_reset_expires: null,
        // Receiving the reset link proves the address is theirs.
        ...(user.email_verified
          ? {}
          : { email_verified: true, email_verified_at: new Date() }),
        failed_login_attempts: 0,
        locked_until: null,
      },
    });

    // Sign out every device after a password change
    await this.prisma.session.deleteMany({ where: { user_id: user.id } });

    return {
      message:
        "Password has been reset. Please sign in with your new password.",
    };
  }

  // ------------------------------------------------------------ email verification

  /** Emails a fresh confirmation link (valid 24 hours) to the given address, replacing any earlier one. */
  async sendVerification(userId: string, to: string, first_name: string) {
    const token = this.generateRandomToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email_verify_token: this.hashToken(token),
        email_verify_expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    return this.mailService.sendEmailVerification(
      to,
      first_name,
      `${frontendUrl}/auth/verify-email?token=${token}`,
    );
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
    });
    if (!user) throw new UnauthorizedException();
    if (user.email_verified && !user.pending_email)
      return { already_verified: true, email_status: null };
    const email_status = await this.sendVerification(
      user.id,
      user.pending_email ?? user.email,
      user.first_name,
    );
    return { already_verified: false, email_status };
  }

  /** Confirms an address from its emailed link. For an email change this is also the moment the new address takes over. */
  async verifyEmail(token: string): Promise<{ verified: true; email: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        email_verify_token: this.hashToken(token),
        email_verify_expires: { gt: new Date() },
        deleted_at: null,
      },
    });
    if (!user) {
      throw new BadRequestException({
        statusCode: 400,
        code: "EMAIL_LINK_INVALID",
        message:
          "This confirmation link is invalid or has expired. Sign in and ask for a new one.",
      });
    }

    let email = user.email;
    if (user.pending_email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: user.pending_email },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            pending_email: null,
            email_verify_token: null,
            email_verify_expires: null,
          },
        });
        throw new ConflictException({
          statusCode: 409,
          code: "EMAIL_TAKEN",
          message: "That email address now belongs to another account.",
        });
      }
      email = user.pending_email;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        pending_email: null,
        email_verified: true,
        email_verified_at: new Date(),
        email_verify_token: null,
        email_verify_expires: null,
      },
    });
    return { verified: true, email };
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (
        !(await tx.organization.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }))
      ) {
        return candidate;
      }
      candidate = `${base}-${this.generateRandomToken().slice(0, 4)}`;
    }
    throw new ConflictException(
      "Could not reserve a unique address for that organisation name. Please try again.",
    );
  }

  private hashToken(token: string): string {
    return require("crypto").createHash("sha256").update(token).digest("hex");
  }

  private generateAccessToken(user_id: string): string {
    return this.jwtService.sign(
      { sub: user_id },
      {
        secret: this.configService.get<string>("JWT_SECRET"),
        expiresIn: (this.configService.get<string>("JWT_EXPIRY") ||
          "900s") as any,
      },
    );
  }

  private generateRandomToken(): string {
    return require("crypto").randomBytes(32).toString("hex");
  }
}
