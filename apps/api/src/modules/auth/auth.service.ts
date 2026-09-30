import { Injectable, BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto, ip_address: string, user_agent: string): Promise<AuthResponseDto> {
    const { email, first_name, last_name, password, password_confirm } = signupDto;

    // Validate password match
    if (password !== password_confirm) {
      throw new BadRequestException('Passwords do not match');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        first_name,
        last_name,
        password_hash,
      },
    });

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
      },
    };
  }

  async login(loginDto: LoginDto, ip_address: string, user_agent: string): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account is locked
    if (user.locked_until && user.locked_until > new Date()) {
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const failed_attempts = user.failed_login_attempts + 1;
      const locked_until = failed_attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: failed_attempts,
          locked_until,
        },
      });

      throw new UnauthorizedException('Invalid email or password');
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
      },
    };
  }

  async refreshToken(refresh_token: string): Promise<{ access_token: string }> {
    // Find session
    const session = await this.prisma.session.findUnique({
      where: { refresh_token },
      include: { user: true },
    });

    if (!session || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
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

  private generateAccessToken(user_id: string): string {
    return this.jwtService.sign(
      { sub: user_id },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRY') || '900s',
      },
    );
  }

  private generateRandomToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }
}
