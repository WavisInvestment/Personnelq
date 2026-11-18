'use client';

import Link from 'next/link';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { Pill, StatusBadge } from '@/components/admin/status-badge';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/admin/toolbar';
import { useAdminList } from '@/components/admin/use-admin-list';
import { formatDate, humanize, type AdminOrganization } from '@/lib/admin';

const columns: Column<AdminOrganization>[] = [
  {
    header: 'Company',
    className: 'min-w-[200px]',
    cell: (o) => (
      <>
        <Link href={`/admin/companies/${o.id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
          {o.name}
        </Link>
        <p className="text-xs text-ink-muted">{o.slug}</p>
      </>
    ),
  },
  { header: 'Type', cell: (o) => <Pill>{humanize(o.type)}</Pill> },
  { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  {
    header: 'Admin contact',
    cell: (o) => (
      <>
        <p>{o.admin_name}</p>
        <p className="text-xs text-ink-muted">{o.admin_email}</p>
      </>
    ),
  },
  {
    header: 'Members',
    cell: (o) => (
      <span className="tabular-nums">
        {o.member_count} <span className="text-ink-muted">/ {o.max_employees}</span>
      </span>
    ),
  },
  {
    header: 'Plan',
    cell: (o) => (
      <div className="flex flex-col items-start gap-1">
        <span>{humanize(o.subscription?.plan_name ?? o.subscription_plan)}</span>
        <StatusBadge status={o.subscription?.status ?? o.subscription_status} />
      </div>
    ),
  },
  { header: 'Plan ends', cell: (o) => formatDate(o.subscription?.end_date) },
  { header: 'Joined', cell: (o) => formatDate(o.created_at) },
];

export default function CompaniesPage() {
  const list = useAdminList<AdminOrganization>('/admin/organizations');

  return (
    <>
      <PageHeader title="Companies" description="Every organisation on the platform, with its plan, seats and admin contact." />

      <Toolbar>
        <SearchInput label="Search companies" placeholder="Search name, slug or admin email" value={list.search} onChange={list.setSearch} />
        <FilterSelect
          label="Type"
          value={list.filters.type ?? ''}
          onChange={(v) => list.setFilter('type', v)}
          options={[
            { value: '', label: 'All types' },
            { value: 'corporate', label: 'Corporate' },
            { value: 'school', label: 'School' },
            { value: 'church', label: 'Church' },
            { value: 'professional', label: 'Professional' },
          ]}
        />
        <FilterSelect
          label="Status"
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={list.rows}
        getKey={(o) => o.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        emptyTitle="No companies found"
        emptyHint="Try a different search or clear the filters."
      />
      <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
    </>
  );
}
