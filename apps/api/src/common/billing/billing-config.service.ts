import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

export interface Money {
  /** Major units, e.g. 5000 for ₦5,000 or 3.5 for $3.50 */
  amount: number;
  currency: string;
}

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export interface PlanDefinition extends Money {
  slug: string;
  name: string;
  description?: string;
  seats: number;
  billing_cycle: BillingCycle;
}

const planSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'slug must be lowercase letters, digits and dashes'),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  seats: z.number().int().min(1).max(100000),
  amount: z.number().positive().max(100_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  billing_cycle: z.enum(BILLING_CYCLES),
});

const PLACEHOLDER = /x{3,}|^\s*$|changeme|your[-_]|replace/i;

export const toMinorUnits = (amount: number) => Math.round(amount * 100);

export function addBillingPeriod(from: Date, cycle: BillingCycle): Date {
  const months = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12;
  const end = new Date(from);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  // Jan 31 + 1 month should be Feb 28/29, not March 3
  const daysInTarget = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, daysInTarget));
  return end;
}

/**
 * Everything about money that is a business decision lives in the environment, never in code:
 * what the full assessment costs, which company plans exist and what they cost.
 * An unset or malformed value means "not offered", it never falls back to an invented price.
 */
@Injectable()
export class BillingConfigService {
  private readonly logger = new Logger(BillingConfigService.name);

  constructor(private config: ConfigService) {}

  get currency(): string {
    return (this.config.get<string>('PAYMENT_CURRENCY') || 'NGN').toUpperCase();
  }

  get paystackSecretKey(): string | null {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
    return key && !PLACEHOLDER.test(key) && /^sk_(test|live)_[A-Za-z0-9]{8,}$/.test(key) ? key : null;
  }

  /**
   * Master switch. Set PAYMENTS_ENABLED=false to run the whole product free: nobody is asked to pay, companies
   * need no plan, and the checkout endpoints refuse. Payments already in flight still settle.
   */
  paymentsEnabled(): boolean {
    const raw = String(this.config.get('PAYMENTS_ENABLED') ?? '').trim().toLowerCase();
    return !['false', '0', 'off', 'no', 'disabled'].includes(raw);
  }

  /** With payments off there are no plans, so every company gets this many people free. */
  freeOrganizationSeats(): number {
    const n = Number(this.config.get('FREE_ORGANIZATION_SEATS'));
    return Number.isInteger(n) && n > 0 && n <= 100_000 ? n : 500;
  }

  paystackConfigured(): boolean {
    return this.paystackSecretKey !== null;
  }

  get paystackBaseUrl(): string {
    return (this.config.get<string>('PAYSTACK_BASE_URL') || 'https://api.paystack.co').replace(/\/$/, '');
  }

  /** Where Paystack sends the person back after paying, and where emailed links point. */
  get frontendUrl(): string {
    const value = this.config.get<string>('FRONTEND_URL') || this.config.get<string>('APP_URL') || 'http://localhost:3000';
    return value.split(',')[0].trim().replace(/\/$/, '');
  }

  assessmentPrice(): Money | null {
    const raw = this.config.get<string>('FULL_ASSESSMENT_PRICE');
    if (!raw || PLACEHOLDER.test(raw)) return null;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      this.logger.error(`FULL_ASSESSMENT_PRICE "${raw}" is not a valid positive number; the full assessment will not be sold.`);
      return null;
    }
    return { amount, currency: this.currency };
  }

  plans(): PlanDefinition[] {
    const raw = this.config.get<string>('SUBSCRIPTION_PLANS');
    if (!raw || !raw.trim()) return [];

    try {
      const parsed = z.array(planSchema).parse(JSON.parse(raw));
      const slugs = new Set<string>();
      return parsed.map((p) => {
        if (slugs.has(p.slug)) throw new Error(`duplicate plan slug "${p.slug}"`);
        slugs.add(p.slug);
        return { ...p, currency: (p.currency ?? this.currency).toUpperCase() };
      });
    } catch (err) {
      const reason =
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`).join('; ')
          : (err as Error).message;
      this.logger.error(`SUBSCRIPTION_PLANS is invalid, so no plans are offered. ${reason}`);
      return [];
    }
  }

  plan(slug: string): PlanDefinition | undefined {
    return this.plans().find((p) => p.slug === slug);
  }
}
