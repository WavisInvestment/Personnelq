import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SessionOrganizationDto {
  id: string;
  name: string;
  slug: string;
  type: string;
  role: string;
}

export class AuthResponseDto {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    platform_role: string | null;
    email_verified: boolean;
    organizations: SessionOrganizationDto[];
  };
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refresh_token: string;
}
