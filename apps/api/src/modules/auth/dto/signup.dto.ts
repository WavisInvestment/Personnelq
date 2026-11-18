import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../../common/email';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';

/** Who is signing up: themselves, or an organisation of a given type (matches Organization.type). */
export const ACCOUNT_TYPES = ['individual', 'corporate', 'school', 'church'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export class SignupDto {
  @IsOptional()
  @IsIn(ACCOUNT_TYPES, { message: 'Choose whether you are signing up as an individual, company, school or church' })
  account_type?: AccountType = 'individual';

  // Decorators register bottom-up, so the "required" message comes first in the error list.
  @ValidateIf((o) => o.account_type && o.account_type !== 'individual')
  @MaxLength(100, { message: 'Organisation name must be at most 100 characters' })
  @MinLength(2, { message: 'Organisation name must be at least 2 characters' })
  @IsString({ message: 'Organisation name is required' })
  @IsNotEmpty({ message: 'Organisation name is required' })
  organization_name?: string;

  /**
   * Set when signing up from a company invitation link. The email is then fixed to the invited address and the
   * person joins as an individual; the invitation itself is accepted afterwards, with a click.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,64}$/, { message: 'That invitation link is not valid' })
  invitation_token?: string;

  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  last_name: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  password_confirm: string;
}
