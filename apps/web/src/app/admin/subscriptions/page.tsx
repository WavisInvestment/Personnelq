'use client';

import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { StatusBadge } from '@/components/admin/status-badge';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/admin/toolbar';
import { useAdminList } from '@/components/admin/use-admin-list';
import { formatDate, formatMoney, humanize, type AdminSubscription } from '@/lib/admin';

const columns: Column<AdminSubscription>[] = [
  {
    header: 'Company',
    className: 'min-w-[200px]',
    cell: (s) => (
      <>
        <p className="font-medium">{s.organization.name}</p>
        <p className="text-xs text-ink-muted">{s.organization.slug}</p>
      </>
    ),
  },
  { header: 'Plan', cell: (s) => humanize(s.plan_name) },
  { header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
  {
    header: 'Billing',
    cell: (s) => (
      <>
        <p className="font-medium tabular-nums">{formatMoney(s.amount, s.currency)}</p>
        <p className="text-xs text-ink-muted">{humanize(s.billing_cycle)}</p>
      </>
    ),
  },
  {
    header: 'Seats',
    cell: (s) => {
      const pct = Math.min(100, Math.round((s.seats_used / Math.max(1, s.seats_limit)) * 100));
      return (
        <div className="w-28">
          <p className="text-xs tabular-nums text-ink-soft">
            {s.seats_used} / {s.seats_limit}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-soft">
            <div
              className={`h-full rounded-full ${pct >= 90 ? 'bg-accent-500' : 'bg-brand-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    },
  },
  { header: 'Period ends', cell: (s) => formatDate(s.end_date) },
  { header: 'Renewal', cell: (s) => (s.auto_renew ? 'Automatic' : 'Manual') },
];

export default function SubscriptionsPage() {
  const list = useAdminList<AdminSubscription>('/admin/subscriptions');

  return (
    <>
      <PageHeader title="Subscriptions" description="Plans, billing and seat usage for every subscribed company." />

      <Toolbar>
        <SearchInput label="Search subscriptions" placeholder="Search by company name" value={list.search} onChange={list.setSearch} />
        <FilterSelect
          label="Status"
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'past_due', label: 'Past due' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={list.rows}
        getKey={(s) => s.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        emptyTitle="No subscriptions found"
        emptyHint="Subscriptions appear here once a company subscribes to a plan."
      />
      <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
    </>
  );
}
