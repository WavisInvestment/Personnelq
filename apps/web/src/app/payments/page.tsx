'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { formatMoney, listPayments, type PaymentRow } from '@/lib/billing';

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-brand-50 text-brand-700 ring-brand-200',
  pending: 'bg-paper-soft text-ink-soft ring-line-strong',
  failed: 'bg-red-50 text-red-800 ring-red-200',
};
const STATUS_LABELS: Record<string, string> = { success: 'Paid', pending: 'Not completed', failed: 'Failed' };

function PaymentsFlow() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listPayments()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-4xl font-medium leading-tight">Payment history</h1>
      <p className="mt-2 text-[15px] text-ink-muted">Receipts are also emailed to you when a payment succeeds.</p>

      {error && <Alert tone="error" className="mt-8">{error}</Alert>}

      {!error && !rows && <div className="mt-8 h-48 animate-pulse border-t border-line" aria-hidden="true" />}

      {rows && rows.length === 0 && (
        <div className="mt-8 border-dashed border-line-strong py-10 text-center border-t border-line">
          <p className="font-display text-2xl font-medium">No payments yet</p>
          <p className="mt-2 text-[15px] text-ink-muted">When you buy the full assessment it will show up here.</p>
          <ButtonLink href="/dashboard" variant="secondary" className="mt-6">
            Back to dashboard
          </ButtonLink>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="stagger mt-8 divide-y divide-line overflow-hidden border-t border-line">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.description ?? (p.payment_type === 'subscription' ? 'Subscription' : 'Assessment')}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {formatDate(p.processed_at ?? p.created_at)} · <span className="font-mono text-xs">{p.reference}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                <span
                  className={cn(
                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                    STATUS_STYLES[p.status] ?? STATUS_STYLES.pending,
                  )}
                >
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <AppShell>
      <PaymentsFlow />
    </AppShell>
  );
}
