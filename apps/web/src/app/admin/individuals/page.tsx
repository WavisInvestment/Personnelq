'use client';

import Link from 'next/link';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { Pill, StatusBadge } from '@/components/admin/status-badge';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '@/components/admin/toolbar';
import { useAdminList } from '@/components/admin/use-admin-list';
import { formatDate, humanize, type AdminUser } from '@/lib/admin';

const columns: Column<AdminUser>[] = [
  {
    header: 'Person',
    className: 'min-w-[210px]',
    cell: (u) => (
      <>
        <Link href={`/admin/individuals/${u.id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
          {u.first_name} {u.last_name}
        </Link>
        <p className="text-xs text-ink-muted">{u.email}</p>
      </>
    ),
  },
  {
    header: 'Email status',
    cell: (u) => <StatusBadge status={u.email_verified ? 'verified' : 'pending'} />,
  },
  {
    header: 'Companies',
    cell: (u) =>
      u.organizations.length === 0 ? (
        <Pill>Individual</Pill>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {u.organizations.map((o) => (
            <Pill key={o.id} className="max-w-[280px] truncate">
              {o.name} · {o.role_name}
            </Pill>
          ))}
          {u.organization_count > u.organizations.length && (
            <Pill>+{u.organization_count - u.organizations.length} more</Pill>
          )}
        </div>
      ),
  },
  { header: 'Assessments', cell: (u) => <span className="tabular-nums">{u.assessment_count}</span> },
  {
    header: 'Roles',
    cell: (u) => (
      <div className="flex flex-wrap gap-1.5">
        {u.account_role_name && <Pill>{u.account_role_name}</Pill>}
        {u.platform_role && (
          <span className="inline-flex rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-600">
            {u.platform_role_name ?? humanize(u.platform_role)}
          </span>
        )}
      </div>
    ),
  },
  { header: 'Joined', cell: (u) => formatDate(u.created_at) },
];

export default function IndividualsPage() {
  const list = useAdminList<AdminUser>('/admin/users');

  return (
    <>
      <PageHeader title="Individuals" description="Everyone with an account, whether they joined alone or through a company." />

      <Toolbar>
        <SearchInput label="Search individuals" placeholder="Search name or email" value={list.search} onChange={list.setSearch} />
        <FilterSelect
          label="Access"
          value={list.filters.staff ?? ''}
          onChange={(v) => list.setFilter('staff', v)}
          options={[
            { value: '', label: 'Everyone' },
            { value: 'true', label: 'Platform staff only' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={list.rows}
        getKey={(u) => u.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        emptyTitle="No individuals found"
        emptyHint="Try a different search."
      />
      <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
    </>
  );
}
