import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value))
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  emails: string[];

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80)
  department?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80)
  job_title?: string | null;

  /** The company role the invited people join with. Anything above employee needs an administrator. */
  @IsOptional()
  @IsIn(['employee', 'hr', 'admin'])
  role?: 'employee' | 'hr' | 'admin';
}

export class MemberDepartmentDto {
  /** A department from the company's list, or null / empty for none. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsString()
  @MaxLength(80)
  department?: string | null;
}

export class MemberUpdateDto extends MemberDepartmentDto {
  @IsOptional()
  @IsIn(['employee', 'hr', 'admin'])
  role?: 'employee' | 'hr' | 'admin';
}

export class RetakeAllowDto {
  @IsString()
  @MaxLength(64)
  user_id: string;

  /** Defaults to the official full assessment. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assessment_id?: string;
}

export class RetakeAskDto {
  @IsString()
  @MaxLength(64)
  assessment_id: string;

  @IsString()
  @MaxLength(64)
  organization_id: string;
}

export class CompanyProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  admin_name?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(40)
  admin_phone?: string | null;
}

export class PauseMemberDto {
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}
