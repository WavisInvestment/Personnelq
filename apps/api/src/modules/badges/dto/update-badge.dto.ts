import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const EXPIRY_CHOICES = [30, 90, 365] as const;

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class UpdateBadgeDto {
  /** Turn sharing on or off. Off keeps your settings but makes the link stop working. */
  @IsBoolean()
  is_public: boolean;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(60)
  display_name?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(280)
  custom_message?: string | null;

  @IsOptional()
  @IsBoolean()
  show_scores?: boolean;

  @IsOptional()
  @IsBoolean()
  show_descriptions?: boolean;

  @IsOptional()
  @IsBoolean()
  show_date?: boolean;

  @IsOptional()
  @IsBoolean()
  show_class?: boolean;

  /** null = never expires. Omit to leave the current expiry as it is. */
  @IsOptional()
  @IsIn([...EXPIRY_CHOICES, null])
  expires_in_days?: (typeof EXPIRY_CHOICES)[number] | null;
}
