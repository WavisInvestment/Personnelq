'use client';

import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { StatusBadge } from '@/components/admin/status-badge';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/admin/toolbar';
import { useAdminList } from '@/components/admin/use-admin-list';
import { formatDateTime, formatMoney, humanize, type AdminPayment } from '@/lib/admin';

const columns: Column<AdminPayment>[] = [
  { header: 'Date', cell: (p) => <span className="whitespace-nowrap">{formatDateTime(p.created_at)}</span> },
  {
    header: 'Paid by',
    className: 'min-w-[180px]',
    cell: (p) =>
      p.organization ? (
        <>
          <p className="font-medium">{p.organization.name}</p>
          <p className="text-xs text-ink-muted">Company</p>
        </>
      ) : p.user ? (
        <>
          <p className="font-medium">
            {p.user.first_name} {p.user.last_name}
          </p>
          <p className="text-xs text-ink-muted">Individual · {p.user.email}</p>
        </>
      ) : (
        // The person's account was deleted; the payment record is kept for the books.
        <p className="text-ink-muted">Deleted account</p>
      ),
  },
  {
    header: 'For',
    cell: (p) => (
      <>
        <p>{humanize(p.payment_type)}</p>
        {p.subscription_plan && <p className="text-xs text-ink-muted">{humanize(p.subscription_plan)} plan</p>}
      </>
    ),
  },
  { header: 'Method', cell: (p) => humanize(p.payment_method) },
  { header: 'Reference', cell: (p) => <code className="text-xs text-ink-soft">{p.provider_reference}</code> },
  {
    header: 'Amount',
    align: 'right',
    cell: (p) => <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>,
  },
  { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
];

export default function PaymentsPage() {
  const list = useAdminList<AdminPayment>('/admin/payments');

  return (
    <>
      <PageHeader title="Payments" description="Every charge across the platform, newest first." />

      <Toolbar>
        <SearchInput label="Search payments" placeholder="Search reference, company or person" value={list.search} onChange={list.setSearch} />
        <FilterSelect
          label="Status"
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'success', label: 'Successful' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={list.rows}
        getKey={(p) => p.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        emptyTitle="No payments found"
        emptyHint="Payments appear here as companies and individuals pay."
      />
      <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
    </>
  );
}
