'use client';

import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { StatusBadge } from '@/components/admin/status-badge';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/admin/toolbar';
import { useAdminList } from '@/components/admin/use-admin-list';
import { formatDateTime, humanize, type AdminAuditLog } from '@/lib/admin';

const columns: Column<AdminAuditLog>[] = [
  { header: 'When', cell: (l) => <span className="whitespace-nowrap">{formatDateTime(l.created_at)}</span> },
  { header: 'Action', cell: (l) => <code className="text-xs text-ink-soft">{l.action}</code> },
  {
    header: 'Resource',
    cell: (l) => (
      <>
        <p>{humanize(l.resource_type)}</p>
        <p className="max-w-[160px] truncate text-xs text-ink-muted">{l.resource_id}</p>
      </>
    ),
  },
  { header: 'Company', cell: (l) => l.organization.name },
  {
    header: 'Done by',
    cell: (l) => (
      <>
        <p>
          {l.actor.first_name} {l.actor.last_name}
        </p>
        <p className="text-xs text-ink-muted">{l.actor.email}</p>
      </>
    ),
  },
  {
    header: 'Result',
    cell: (l) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={l.status} />
        {l.error_message && <span className="max-w-[180px] text-xs text-red-700">{l.error_message}</span>}
      </div>
    ),
  },
  { header: 'IP address', cell: (l) => <span className="text-xs text-ink-muted">{l.ip_address ?? '—'}</span> },
];

export default function AuditLogPage() {
  const list = useAdminList<AdminAuditLog>('/admin/audit-logs');

  return (
    <>
      <PageHeader title="Audit log" description="A record of sensitive actions taken by people across all companies." />

      <Toolbar>
        <SearchInput label="Search actions" placeholder="Search by action, e.g. invited" value={list.search} onChange={list.setSearch} />
        <FilterSelect
          label="Result"
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: '', label: 'All results' },
            { value: 'success', label: 'Successful' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={list.rows}
        getKey={(l) => l.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        emptyTitle="No audit entries found"
        emptyHint="Actions such as invitations and plan changes are recorded here."
      />
      <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
    </>
  );
}
