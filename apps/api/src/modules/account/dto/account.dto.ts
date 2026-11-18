import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '../../../common/email';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  last_name?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  current_password: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: 'Password must contain uppercase, lowercase, number, and special character' })
  password: string;

  @IsString()
  password_confirm: string;

  /** The device's own refresh token, so that device stays signed in while every other one is signed out. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refresh_token?: string;
}

export class ChangeEmailDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(128)
  password: string;
}
