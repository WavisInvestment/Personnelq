import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'That confirmation link is not valid' })
  token: string;
}
