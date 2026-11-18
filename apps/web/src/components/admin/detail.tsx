'use client';

import Link from 'next/link';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDateTime, humanize, type StaffActionRow } from '@/lib/admin';
import { readApiProblem } from '@/lib/assessments';
import { apiClient } from '@/lib/api';

/** Loads one record for a detail page, with a retry. */
export function useAdminRecord<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<number | null>(null);

  const load = useCallback(() => {
    setError('');
    apiClient
      .get(path)
      .then((r) => setData(r.data as T))
      .catch((err) => {
        const p = readApiProblem(err);
        setStatus(p.status);
        setError(p.status === 404 ? 'We couldn’t find that record. It may have been removed.' : p.message);
      });
  }, [path]);

  useEffect(load, [load]);
  return { data, error, status, reload: load };
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-5 inline-block text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
      ← {children}
    </Link>
  );
}

export function DetailState({ error, onRetry, back }: { error: string; onRetry: () => void; back: { href: string; label: string } }) {
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href={back.href}>{back.label}</BackLink>
      {error ? (
        <>
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-xl bg-paper-soft" aria-hidden="true" />
      )}
    </div>
  );
}

export function Panel({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="p-5 sm:p-6 rounded-xl bg-paper-soft">
      <h2 id={id} className="font-display text-xl font-medium">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A label and its value, in a tidy grid. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{i.label}</dt>
          <dd className="mt-1 break-words text-[15px]">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="p-4 rounded-xl bg-paper-soft">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-medium tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A small table that is not paged or filtered: the rows of one record. */
export function MiniTable<T>({ columns, rows, getKey, empty }: { columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[]; rows: T[]; getKey: (row: T) => string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.header} scope="col" className="whitespace-nowrap px-2 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={getKey(row)}>
              {columns.map((c) => (
                <td key={c.header} className={`px-2 py-2.5 align-top ${c.className ?? ''}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Runs one staff action, then reloads the page's data. Shows what happened (or what went wrong) above the buttons. */
export function useStaffAction(reload: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const run = async (key: string, task: () => Promise<unknown>, message: string) => {
    setBusy(key);
    setError('');
    setDone('');
    try {
      await task();
      setDone(message);
      reload();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, done, run };
}

/** The record of what platform staff have done to this person or company, newest first. */
export function StaffHistory({ rows }: { rows: StaffActionRow[] }) {
  return (
    <Panel id="staff-history" title="What staff have done" hint="Every action below is kept on record with who did it and why.">
      <MiniTable
        rows={rows}
        getKey={(r) => r.id}
        empty="Nothing yet."
        columns={[
          { header: 'Action', cell: (r) => humanize(r.action) },
          { header: 'Reason', cell: (r) => r.reason ?? '—' },
          { header: 'By', cell: (r) => r.by },
          { header: 'When', cell: (r) => formatDateTime(r.at) },
        ]}
      />
    </Panel>
  );
}
