import { BillingConfigService, addBillingPeriod, toMinorUnits } from './billing-config.service';

const make = (env: Record<string, string | undefined>) =>
  new BillingConfigService({ get: (key: string) => env[key] } as any);

describe('BillingConfigService', () => {
  describe('master switch', () => {
    it('is on unless it is clearly turned off', () => {
      expect(make({}).paymentsEnabled()).toBe(true);
      expect(make({ PAYMENTS_ENABLED: '' }).paymentsEnabled()).toBe(true);
      expect(make({ PAYMENTS_ENABLED: 'true' }).paymentsEnabled()).toBe(true);
      expect(make({ PAYMENTS_ENABLED: 'maybe' }).paymentsEnabled()).toBe(true);
    });

    it.each(['false', 'FALSE', ' off ', '0', 'no', 'disabled'])('is off for %p', (value) => {
      expect(make({ PAYMENTS_ENABLED: value }).paymentsEnabled()).toBe(false);
    });

    it('gives free companies a sensible seat limit, and ignores nonsense', () => {
      expect(make({}).freeOrganizationSeats()).toBe(500);
      expect(make({ FREE_ORGANIZATION_SEATS: '40' }).freeOrganizationSeats()).toBe(40);
      for (const bad of ['0', '-3', '2.5', 'many', '9999999']) expect(make({ FREE_ORGANIZATION_SEATS: bad }).freeOrganizationSeats()).toBe(500);
    });
  });

  describe('Paystack key', () => {
    it('accepts a test or live secret key', () => {
      expect(make({ PAYSTACK_SECRET_KEY: 'sk_test_a1b2c3d4e5f6g7h8' }).paystackConfigured()).toBe(true);
      expect(make({ PAYSTACK_SECRET_KEY: 'sk_live_a1b2c3d4e5f6g7h8' }).paystackConfigured()).toBe(true);
    });

    it('treats the .env.example placeholder, an empty value and a public key as not configured', () => {
      expect(make({ PAYSTACK_SECRET_KEY: 'sk_test_xxxxx' }).paystackConfigured()).toBe(false);
      expect(make({ PAYSTACK_SECRET_KEY: '' }).paystackConfigured()).toBe(false);
      expect(make({}).paystackConfigured()).toBe(false);
      expect(make({ PAYSTACK_SECRET_KEY: 'pk_test_a1b2c3d4e5f6g7h8' }).paystackConfigured()).toBe(false);
    });

    it('never exposes a key that is not valid', () => {
      expect(make({ PAYSTACK_SECRET_KEY: 'sk_test_xxxxx' }).paystackSecretKey).toBeNull();
    });

    it('defaults to the live API address and honours an override', () => {
      expect(make({}).paystackBaseUrl).toBe('https://api.paystack.co');
      expect(make({ PAYSTACK_BASE_URL: 'http://localhost:9999/' }).paystackBaseUrl).toBe('http://localhost:9999');
    });
  });

  describe('assessment price', () => {
    it('is not offered unless a price is configured: there is no built-in default', () => {
      expect(make({}).assessmentPrice()).toBeNull();
      expect(make({ FULL_ASSESSMENT_PRICE: '' }).assessmentPrice()).toBeNull();
    });

    it('reads a price in major units with the configured currency (NGN by default)', () => {
      expect(make({ FULL_ASSESSMENT_PRICE: '5000' }).assessmentPrice()).toEqual({ amount: 5000, currency: 'NGN' });
      expect(make({ FULL_ASSESSMENT_PRICE: '3.5', PAYMENT_CURRENCY: 'usd' }).assessmentPrice()).toEqual({ amount: 3.5, currency: 'USD' });
    });

    it.each(['abc', '0', '-5', 'NaN', '999999999999'])('rejects an invalid price (%s) rather than guessing', (value) => {
      expect(make({ FULL_ASSESSMENT_PRICE: value }).assessmentPrice()).toBeNull();
    });
  });

  describe('subscription plans', () => {
    const plan = { slug: 'team', name: 'Team', seats: 25, amount: 50000, billing_cycle: 'monthly' };

    it('offers no plans unless configured', () => {
      expect(make({}).plans()).toEqual([]);
      expect(make({ SUBSCRIPTION_PLANS: '  ' }).plans()).toEqual([]);
    });

    it('parses plans and fills in the default currency', () => {
      const plans = make({ SUBSCRIPTION_PLANS: JSON.stringify([plan, { ...plan, slug: 'big', seats: 200, currency: 'usd' }]) }).plans();
      expect(plans).toHaveLength(2);
      expect(plans[0]).toMatchObject({ slug: 'team', currency: 'NGN', seats: 25 });
      expect(plans[1]).toMatchObject({ slug: 'big', currency: 'USD' });
    });

    it('finds a plan by slug', () => {
      const billing = make({ SUBSCRIPTION_PLANS: JSON.stringify([plan]) });
      expect(billing.plan('team')?.name).toBe('Team');
      expect(billing.plan('nope')).toBeUndefined();
    });

    it.each([
      ['malformed JSON', '{not json'],
      ['not an array', JSON.stringify(plan)],
      ['a bad slug', JSON.stringify([{ ...plan, slug: 'Bad Slug!' }])],
      ['a non-positive amount', JSON.stringify([{ ...plan, amount: 0 }])],
      ['an unknown billing cycle', JSON.stringify([{ ...plan, billing_cycle: 'weekly' }])],
      ['duplicate slugs', JSON.stringify([plan, plan])],
    ])('offers no plans at all when the config has %s (never half-valid)', (_name, value) => {
      expect(make({ SUBSCRIPTION_PLANS: value }).plans()).toEqual([]);
    });
  });

  describe('frontend address', () => {
    it('prefers FRONTEND_URL, then APP_URL, then localhost', () => {
      expect(make({ FRONTEND_URL: 'https://app.example.com/', APP_URL: 'http://x' }).frontendUrl).toBe('https://app.example.com');
      expect(make({ APP_URL: 'http://localhost:3000' }).frontendUrl).toBe('http://localhost:3000');
      expect(make({}).frontendUrl).toBe('http://localhost:3000');
      expect(make({ FRONTEND_URL: 'https://a.com, https://b.com' }).frontendUrl).toBe('https://a.com');
    });
  });
});

describe('toMinorUnits', () => {
  it('converts to kobo/cents without floating point drift', () => {
    expect(toMinorUnits(5000)).toBe(500000);
    expect(toMinorUnits(3.5)).toBe(350);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(toMinorUnits(19.99)).toBe(1999);
  });
});

describe('addBillingPeriod', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('adds one, three or twelve months', () => {
    const from = new Date('2026-03-10T10:00:00Z');
    expect(iso(addBillingPeriod(from, 'monthly'))).toBe('2026-04-10');
    expect(iso(addBillingPeriod(from, 'quarterly'))).toBe('2026-06-10');
    expect(iso(addBillingPeriod(from, 'annual'))).toBe('2027-03-10');
  });

  it('clamps to the end of a shorter month instead of spilling into the next', () => {
    expect(iso(addBillingPeriod(new Date('2026-01-31T00:00:00Z'), 'monthly'))).toBe('2026-02-28');
    expect(iso(addBillingPeriod(new Date('2028-01-31T00:00:00Z'), 'monthly'))).toBe('2028-02-29');
    expect(iso(addBillingPeriod(new Date('2026-11-30T00:00:00Z'), 'quarterly'))).toBe('2027-02-28');
  });

  it('does not change the original date', () => {
    const from = new Date('2026-03-10T00:00:00Z');
    addBillingPeriod(from, 'monthly');
    expect(iso(from)).toBe('2026-03-10');
  });
});
