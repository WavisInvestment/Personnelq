import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Meta } from '@/lib/admin';

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | null;
  getKey: (row: T) => string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  emptyTitle: string;
  emptyHint?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyHint,
}: DataTableProps<T>) {
  if (error && !rows) {
    return (
      <div className="space-y-4 border-t border-line py-6">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const initialLoad = loading && !rows;

  return (
    <div className="overflow-hidden border-t border-line">
      {error && (
        <div className="border-b border-line p-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className={cn('overflow-x-auto transition-opacity', loading && rows && 'opacity-60')}>
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-paper/60">
              {columns.map((col) => (
                <th
                  key={col.header}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted',
                    col.align === 'right' && 'text-right',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {initialLoad &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-hidden="true">
                  {columns.map((col) => (
                    <td key={col.header} className="px-4 py-4">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-paper-soft" />
                    </td>
                  ))}
                </tr>
              ))}
            {rows?.map((row) => (
              <tr key={getKey(row)} className="transition-colors hover:bg-paper/50">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={cn('px-4 py-3.5 align-middle', col.align === 'right' && 'text-right', col.className)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows && rows.length === 0 && !loading && (
        <div className="px-6 py-14 text-center">
          <p className="font-display text-lg font-medium">{emptyTitle}</p>
          {emptyHint && <p className="mt-1 text-sm text-ink-muted">{emptyHint}</p>}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  meta,
  onPage,
  loading,
}: {
  meta: Meta | null;
  onPage: (page: number) => void;
  loading: boolean;
}) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted" aria-live="polite">
        Showing {from}–{to} of {meta.total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={loading || meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <span className="px-1 text-sm text-ink-muted">
          Page {meta.page} of {meta.total_pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading || meta.page >= meta.total_pages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
