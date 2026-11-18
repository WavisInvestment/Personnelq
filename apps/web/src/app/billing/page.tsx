'use client';

import { useEffect, useState } from 'react';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { formatMoney, getBilling, startSubscriptionCheckout, type BillingOverview } from '@/lib/billing';

function BillingFlow() {
  const user = useSessionUser();
  const organization = user.organizations?.find((o) => o.role === 'admin');
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    getBilling(organization.id)
      .then((o) => !cancelled && setOverview(o))
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [organization]);

  if (!organization) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="info">Billing is managed by a company administrator.</Alert>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  const subscribe = async (slug: string) => {
    setBuying(slug);
    setError('');
    try {
      const checkout = await startSubscriptionCheckout(organization.id, slug);
      window.location.assign(checkout.authorization_url);
    } catch (err) {
      setError(readApiProblem(err).message);
      setBuying(null);
    }
  };

  const sub = overview?.subscription;
  const active = sub && sub.status === 'active' && new Date(sub.end_date) > new Date();

  return (
    <div className="animate-fade-up">
      <p className="text-sm font-medium text-brand-700">{organization.name}</p>
      <h1 className="mt-1 font-display text-4xl font-medium leading-tight">Plan and billing</h1>

      {error && <Alert tone="error" className="mt-8">{error}</Alert>}
      {overview?.payments_disabled && (
        <Alert tone="info" className="mt-8">
          Plans and payments are switched off, so {organization.name} has full access at no charge. Nothing to buy here.
        </Alert>
      )}

      {!overview && !error && <div className="mt-8 h-48 animate-pulse border-t border-line" aria-hidden="true" />}

      {overview && !overview.payments_disabled && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="current-heading" className="py-6 sm:py-8 border-t border-line">
            <h2 id="current-heading" className="font-display text-2xl font-medium">
              Current plan
            </h2>
            {sub ? (
              <>
                <p className="mt-3 text-lg">
                  <strong className="font-semibold">{sub.plan_name}</strong>{' '}
                  <span className={active ? 'text-brand-700' : 'text-accent-600'}>{active ? 'is active' : 'has ended'}</span>
                </p>
                <p className="mt-1 text-[15px] text-ink-muted">
                  {active ? 'Renews manually: pay again before' : 'Ended on'} {formatDate(sub.end_date)} · {sub.seats_used} of {sub.seats_limit} seats used ·{' '}
                  {formatMoney(sub.amount, sub.currency)} per {sub.billing_cycle === 'annual' ? 'year' : 'month'}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[15px] text-ink-muted">You don’t have a plan yet. Pick one below.</p>
            )}
          </section>

          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="font-display text-2xl font-medium">
              {sub ? 'Change or renew' : 'Choose a plan'}
            </h2>
            {sub && active && <p className="mt-1 text-sm text-ink-muted">Renewing the same plan adds a new period on top of the days you have left. Switching to a different plan credits the days left against the new price and starts a fresh period today.</p>}

            {!overview.payments_enabled || overview.plans.length === 0 ? (
              <Alert tone="info" className="mt-5">Plans can’t be purchased right now. Please check back soon.</Alert>
            ) : (
              <ul className="mt-5 grid gap-5 md:grid-cols-2">
                {overview.plans.map((plan) => (
                  <li key={plan.slug} className="flex flex-col py-6 border-t border-line">
                    <h3 className="font-display text-2xl font-medium">{plan.name}</h3>
                    {plan.description && <p className="mt-1 text-[15px] text-ink-muted">{plan.description}</p>}
                    <p className="mt-4 font-display text-3xl font-medium tabular-nums">
                      {formatMoney(plan.amount, plan.currency)}
                      <span className="ml-1 font-sans text-sm font-normal text-ink-muted">/ {plan.billing_cycle === 'annual' ? 'year' : 'month'}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">Up to {plan.seats} people</p>
                    {plan.switch_charge != null && !plan.blocked && (
                      <p className="mt-3 text-sm text-ink-soft">
                        You pay <strong className="font-semibold">{formatMoney(plan.switch_charge, plan.currency)}</strong> today, after a {formatMoney(plan.switch_credit ?? 0, plan.currency)} credit for the days left on your current plan.
                      </p>
                    )}
                    {plan.blocked && <p className="mt-3 text-sm text-accent-600">{plan.blocked}</p>}
                    <Button className="mt-6" onClick={() => subscribe(plan.slug)} loading={buying === plan.slug} disabled={buying !== null || !!plan.blocked}>
                      {sub && sub.plan_name === plan.name ? 'Renew' : 'Choose'} {plan.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <AppShell>
      <BillingFlow />
    </AppShell>
  );
}
