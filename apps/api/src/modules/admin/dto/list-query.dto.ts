import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class OrganizationListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;
}

export class UserListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  staff?: string;
}

export class AuditLogQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource_type?: string;
}
