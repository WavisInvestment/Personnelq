import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartAssessmentDto {
  /** Take the attempt for this company (covered by its plan, visible to its HR). Omit to take it privately. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  organization_id?: string;
}
