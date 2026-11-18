import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Why staff are doing something that affects a person, a company or money. It is kept on record. */
export class ReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: 'Give a reason of at least 5 characters' })
  @MaxLength(300)
  reason: string;
}
