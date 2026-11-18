import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { MailService } from '../../common/mail/mail.service';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let mailService: MailService;

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password_hash: 'hashed_password',
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    email_verified: false,
    email_verified_at: null,
    password_reset_token: null,
    password_reset_expires: null,
    phone_number: null,
    avatar_url: null,
    preferred_language: 'en',
    timezone: 'UTC',
  };

  beforeEach(async () => {
    const prismaMock: any = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      organization: { findUnique: jest.fn(), create: jest.fn() },
      organizationMember: { create: jest.fn() },
      employeeInvitation: { findUnique: jest.fn() },
    };
    prismaMock.$transaction = jest.fn((callback: any) => callback(prismaMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: MailService,
          useValue: { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn().mockResolvedValue('sent') },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('test-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                JWT_SECRET: 'test-secret',
                JWT_EXPIRY: '900s',
              };
              return config[key as keyof typeof config];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    mailService = module.get<MailService>(MailService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('signup from a company invitation', () => {
    const TOKEN = 'T'.repeat(43);
    const base: SignupDto = { email: 'Eve@Acme.test', first_name: 'Eve', last_name: 'Okafor', password: 'SecurePass123!', password_confirm: 'SecurePass123!', invitation_token: TOKEN };
    const pending = (over: object = {}) => ({ organization_id: 'org-1', recipient_email: 'eve@acme.test', status: 'pending', expires_at: new Date(Date.now() + 86400000), ...over });
    const arrange = (invitation: unknown) => {
      (prisma as any).employeeInvitation.findUnique.mockResolvedValue(invitation);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ ...mockUser, email: 'eve@acme.test' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
    };

    it('creates the account with the invited address exactly as the invitation has it, as an individual', async () => {
      arrange(pending());
      await service.signup(base, '127.0.0.1', 'UA');
      const data = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
      expect(data.email).toBe('eve@acme.test');
      expect(data.account_role).toEqual({ connect: { scope_key: { scope: 'account', key: 'individual' } } });
      expect((prisma as any).organization.create).not.toHaveBeenCalled();
    });

    it('remembers which company the account was created for, so it cannot leave it', async () => {
      arrange(pending());
      await service.signup(base, '127.0.0.1', 'UA');
      expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.joined_via_organization_id).toBe('org-1');
    });

    it('refuses a different email address, whatever the form said (400)', async () => {
      arrange(pending());
      const e: any = await service.signup({ ...base, email: 'someone@else.test' }, '127.0.0.1', 'UA').catch((x) => x);
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.getResponse()).toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      ['expired', pending({ expires_at: new Date(Date.now() - 1000) })],
      ['cancelled', pending({ status: 'revoked' })],
      ['already used', pending({ status: 'accepted' })],
    ])('refuses an invitation that is %s (400)', async (_n, invitation) => {
      arrange(invitation);
      const e: any = await service.signup(base, '127.0.0.1', 'UA').catch((x) => x);
      expect(e.getResponse()).toMatchObject({ code: 'INVITATION_INVALID' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('does not let an invited person sign up as a company, school or church', async () => {
      arrange(pending());
      const e: any = await service.signup({ ...base, account_type: 'corporate', organization_name: 'Sneaky Co' }, '127.0.0.1', 'UA').catch((x) => x);
      expect(e.getResponse()).toMatchObject({ code: 'INVITATION_ACCOUNT_TYPE' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('still says the email is taken when the invited person already has an account', async () => {
      arrange(pending());
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      await expect(service.signup(base, '127.0.0.1', 'UA')).rejects.toThrow(ConflictException);
    });
  });

  describe('signup', () => {
    it('should create a new user successfully', async () => {
      const signupDto: SignupDto = {
        email: 'newuser@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password: 'SecurePass123!',
        password_confirm: 'SecurePass123!',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: 'session-id',
        refresh_token: 'refresh-token',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      const result = await service.signup(signupDto, '127.0.0.1', 'Mozilla/5.0');

      expect(result.access_token).toBe('test-token');
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.platform_role).toBeNull();
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.session.create).toHaveBeenCalled();
      // Every new account is attached to the personal 'individual' role.
      expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.account_role).toEqual({
        connect: { scope_key: { scope: 'account', key: 'individual' } },
      });
    });

    it('creates no organisation when signing up as an individual', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      const result = await service.signup(
        { email: 'solo@example.com', first_name: 'Solo', last_name: 'Person', password: 'SecurePass123!', password_confirm: 'SecurePass123!', account_type: 'individual' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect((prisma as any).organization.create).not.toHaveBeenCalled();
      expect((prisma as any).organizationMember.create).not.toHaveBeenCalled();
      expect(result.user.organizations).toEqual([]);
    });

    it('creates the organisation and makes the signer its admin when signing up as a company', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      (prisma as any).organization.findUnique.mockResolvedValue(null);
      (prisma as any).organization.create.mockImplementation(async ({ data }: any) => ({ id: 'org-1', ...data }));

      const result = await service.signup(
        { email: 'hr@acme.com', first_name: 'Hana', last_name: 'Bello', password: 'SecurePass123!', password_confirm: 'SecurePass123!', account_type: 'corporate', organization_name: '  Acme Logistics  ' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      const orgData = (prisma as any).organization.create.mock.calls[0][0].data;
      expect(orgData).toMatchObject({ name: 'Acme Logistics', slug: 'acme-logistics', type: 'corporate', admin_name: 'Hana Bello', admin_email: 'hr@acme.com' });
      const memberData = (prisma as any).organizationMember.create.mock.calls[0][0].data;
      expect(memberData.role).toEqual({ connect: { scope_key: { scope: 'organization', key: 'admin' } } });
      expect(memberData.organization).toEqual({ connect: { id: 'org-1' } });
      expect(result.user.organizations).toEqual([
        { id: 'org-1', name: 'Acme Logistics', slug: 'acme-logistics', type: 'corporate', role: 'admin' },
      ]);
    });

    it('creates school and church organisations with their own type', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      (prisma as any).organization.findUnique.mockResolvedValue(null);
      (prisma as any).organization.create.mockImplementation(async ({ data }: any) => ({ id: 'org-x', ...data }));

      for (const type of ['school', 'church'] as const) {
        (prisma as any).organization.create.mockClear();
        await service.signup(
          { email: `${type}@example.com`, first_name: 'A', last_name: 'B', password: 'SecurePass123!', password_confirm: 'SecurePass123!', account_type: type, organization_name: 'Grace Chapel' },
          '127.0.0.1',
          'Mozilla/5.0',
        );
        expect((prisma as any).organization.create.mock.calls[0][0].data.type).toBe(type);
      }
    });

    it('adds a suffix when the organisation address is already taken', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      (prisma as any).organization.findUnique.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValue(null);
      (prisma as any).organization.create.mockImplementation(async ({ data }: any) => ({ id: 'org-2', ...data }));

      await service.signup(
        { email: 'hr@acme2.com', first_name: 'A', last_name: 'B', password: 'SecurePass123!', password_confirm: 'SecurePass123!', account_type: 'corporate', organization_name: 'Acme' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect((prisma as any).organization.create.mock.calls[0][0].data.slug).toMatch(/^acme-[0-9a-f]{4}$/);
    });

    it('runs user and organisation creation inside one transaction', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      await service.signup(
        { email: 'tx@example.com', first_name: 'A', last_name: 'B', password: 'SecurePass123!', password_confirm: 'SecurePass123!', account_type: 'individual' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      const signupDto: SignupDto = {
        email: 'existing@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password: 'SecurePass123!',
        password_confirm: 'SecurePass123!',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.signup(signupDto, '127.0.0.1', 'Mozilla/5.0')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      const signupDto: SignupDto = {
        email: 'newuser@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password: 'SecurePass123!',
        password_confirm: 'DifferentPass123!',
      };

      await expect(service.signup(signupDto, '127.0.0.1', 'Mozilla/5.0')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('should return tokens on successful login', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: 'session-id',
        refresh_token: 'refresh-token',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto, '127.0.0.1', 'Mozilla/5.0');

      expect(result.access_token).toBe('test-token');
      expect(result.user.email).toBe(mockUser.email);
    });

    it('refuses a suspended account with the reason, but only once the password is right (no hint to guessers)', async () => {
      const suspended = { ...mockUser, suspended_at: new Date(), suspended_reason: 'Abuse' };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(suspended);

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ email: 'test@example.com', password: 'Wrong123!pass' }, '127.0.0.1', 'UA')).rejects.toThrow(UnauthorizedException);

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: 'test@example.com', password: 'SecurePass123!' }, '127.0.0.1', 'UA')).rejects.toMatchObject({ response: { code: 'ACCOUNT_SUSPENDED' } });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto, '127.0.0.1', 'Mozilla/5.0')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException with non-existent user', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'SecurePass123!',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login(loginDto, '127.0.0.1', 'Mozilla/5.0')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should return new access token', async () => {
      const mockSession = {
        id: 'session-id',
        refresh_token: 'valid-refresh-token',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: mockUser,
        token_version: 1,
        user_id: 'test-user-id',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0',
        created_at: new Date(),
        updated_at: new Date(),
      };

      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.session.update as jest.Mock).mockResolvedValue({ ...mockSession, token_version: 2 });

      const result = await service.refreshToken('valid-refresh-token');

      expect(result.access_token).toBe('test-token');
      expect(prisma.session.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('should store a hashed token and send the reset email for an existing user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.forgotPassword('test@example.com');

      expect(result.message).toContain('If an account exists');
      const updateArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      const storedHash = updateArgs.data.password_reset_token;
      const [, , link] = (mailService.sendPasswordReset as jest.Mock).mock.calls[0];
      const rawToken = new URL(link).searchParams.get('token');
      expect(storedHash).toHaveLength(64);
      expect(storedHash).not.toBe(rawToken);
      expect(updateArgs.data.password_reset_expires.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return the same response and send nothing for an unknown email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result.message).toContain('If an account exists');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should update the password, clear the token and revoke all sessions', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hash');

      await service.resetPassword('a'.repeat(64), 'NewSecure123!', 'NewSecure123!');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password_hash: 'new_hash',
            password_reset_token: null,
            password_reset_expires: null,
            failed_login_attempts: 0,
            locked_until: null,
          }),
        }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: mockUser.id } });
    });

    it('should reject an invalid or expired token', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.resetPassword('b'.repeat(64), 'NewSecure123!', 'NewSecure123!'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should reject mismatched passwords', async () => {
      await expect(
        service.resetPassword('a'.repeat(64), 'NewSecure123!', 'Different123!'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
