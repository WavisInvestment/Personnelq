'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/admin/toolbar';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import { formatDate, formatMoney, humanize, type Overview } from '@/lib/admin';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`border-t border-line-strong pb-2 pt-6 ${className}`}>{children}</section>;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <Card>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-2 font-display text-[2rem] font-medium leading-none">{value}</p>
      {note && <p className="mt-2.5 text-sm text-ink-muted">{note}</p>}
    </Card>
  );
}

function money(items: { currency: string; amount: number }[]) {
  if (items.length === 0) return '—';
  return items.map((i) => formatMoney(i.amount, i.currency)).join(' · ');
}

function Breakdown({ title, data, empty }: { title: string; data: Record<string, number>; empty: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));

  return (
    <Card>
      <h2 className="font-display text-lg font-medium">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {entries.map(([key, count]) => (
            <li key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-soft">{humanize(key)}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-soft">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SignupChart({ days }: { days: Overview['signups_30d'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="lg:col-span-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-medium">New individuals, last 30 days</h2>
        <p className="text-sm text-ink-muted">{total} total</p>
      </div>
      <div
        role="img"
        aria-label={`Bar chart of daily signups over the last 30 days, ${total} in total`}
        className="mt-6 flex h-40 items-end gap-[3px]"
      >
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-[3px] transition-colors ${d.count ? 'bg-brand-500 group-hover:bg-brand-700' : 'bg-line'}`}
              style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : '3px' }}
            />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block">
              {formatDate(d.date)}: {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-muted">
        <span>{formatDate(days[0]?.date)}</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    apiClient
      .get('/admin/overview')
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load the overview.')));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <>
      <PageHeader title="Overview" description="A live snapshot of companies, individuals and revenue across the platform." />

      {error && (
        <div className="space-y-4">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-paper-soft" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Individuals"
              value={data.users.total.toLocaleString()}
              note={`+${data.users.new_30d} in 30 days · +${data.users.new_7d} this week`}
            />
            <Stat
              label="Companies"
              value={data.organizations.total.toLocaleString()}
              note={`${data.organizations.by_status.active ?? 0} active`}
            />
            <Stat
              label="Active subscriptions"
              value={data.subscriptions.active.toLocaleString()}
              note={<>Est. monthly recurring: {money(data.subscriptions.mrr)}</>}
            />
            <Stat
              label="Revenue collected"
              value={
                data.payments.revenue.length === 0 ? (
                  '—'
                ) : (
                  <span className="flex flex-col gap-1 text-[1.35rem] leading-tight">
                    {data.payments.revenue.map((r) => (
                      <span key={r.currency}>{formatMoney(r.total, r.currency)}</span>
                    ))}
                  </span>
                )
              }
              note={`${data.payments.by_status.success ?? 0} successful payments`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SignupChart days={data.signups_30d} />
            <Card>
              <h2 className="font-display text-lg font-medium">Assessments</h2>
              <dl className="mt-4 space-y-5">
                <div>
                  <dt className="text-sm text-ink-muted">Completed</dt>
                  <dd className="mt-1 font-display text-3xl font-medium">{data.assessments.completed.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">In progress</dt>
                  <dd className="mt-1 font-display text-3xl font-medium">{data.assessments.in_progress.toLocaleString()}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Breakdown title="Companies by type" data={data.organizations.by_type} empty="No companies yet." />
            <Breakdown title="Companies by status" data={data.organizations.by_status} empty="No companies yet." />
            <Breakdown title="Payments by status" data={data.payments.by_status} empty="No payments yet." />
          </div>

          <Card>
            <h2 className="font-display text-lg font-medium">Recent signups</h2>
            {data.recent_signups.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">Nobody has signed up yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.recent_signups.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {u.first_name} {u.last_name}
                      </p>
                      <p className="text-sm text-ink-muted">{u.email}</p>
                    </div>
                    <p className="text-sm text-ink-muted">{formatDate(u.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
