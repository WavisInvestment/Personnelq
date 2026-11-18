import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnswerItemDto {
  @IsString()
  @MaxLength(64)
  question_id: string;

  // The allowed range depends on the question, so the service checks it; this only rejects nonsense.
  @IsInt()
  @Min(0)
  @Max(100)
  value: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  time_spent_seconds?: number;
}

export class SaveAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
