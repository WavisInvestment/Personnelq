import { IsString, Matches, MaxLength } from 'class-validator';

export class CheckoutDto {
  @IsString()
  @MaxLength(64)
  assessment_id: string;
}

export class SubscriptionCheckoutDto {
  @IsString()
  @MaxLength(64)
  organization_id: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/)
  plan: string;
}
