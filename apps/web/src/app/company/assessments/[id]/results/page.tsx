'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { downloadAssessmentCsv, getAssessmentResults, type AssessmentResults } from '@/lib/custom-assessments';

const STATUS: Record<string, { label: string; style: string }> = {
  completed: { label: 'Finished', style: 'bg-brand-50 text-brand-700 ring-brand-200' },
  in_progress: { label: 'In progress', style: 'bg-accent-100 text-accent-600 ring-accent-400/40' },
  not_started: { label: 'Not started', style: 'bg-paper-soft text-ink-muted ring-line-strong' },
};

function ResultsFlow({ id }: { id: string }) {
  const user = useSessionUser();
  const org = user.organizations?.find((o) => o.role === 'admin' || o.role === 'hr');
  const [data, setData] = useState<AssessmentResults | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    getAssessmentResults(org.id, id)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(readApiProblem(err).status === 404 ? 'We couldn’t find that assessment.' : readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [org, id]);

  if (!org || error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone={error ? 'error' : 'info'}>{error || 'This page is for administrators and HR.'}</Alert>
        <ButtonLink href="/company" variant="secondary">
          Back to the dashboard
        </ButtonLink>
      </div>
    );
  }
  if (!data) return <div className="h-96 animate-pulse border-t border-line" aria-hidden="true" />;

  const { team } = data;
  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAssessmentCsv(org.id, id);
    } catch {
      setError('We couldn’t create the export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <Link href="/company" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
        Back to the dashboard
      </Link>
      <p className="mt-4 text-sm font-medium text-brand-700">{org.name} · Custom assessment results</p>
      <h1 className="mt-1 font-display text-4xl font-medium leading-tight">{data.assessment.name}</h1>
      <p className="mt-2 text-sm text-ink-muted">Version {data.assessment.version}</p>

      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Finished', `${team.completed} of ${team.members}`, `${team.completion_pct}%`],
          ['In progress', String(team.in_progress), ''],
          ['Not started', String(team.not_started), ''],
          ['Average overall', team.overall_average === null ? 'n/a' : String(Math.round(team.overall_average)), 'out of 100'],
        ].map(([label, value, hint]) => (
          <div key={label} className="border-l-2 border-line-strong py-1 pl-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="mt-1 font-display text-3xl font-medium tabular-nums">{value}</dd>
            {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
          </div>
        ))}
      </dl>

      {team.completed > 0 && (
        <section aria-labelledby="sections-heading" className="mt-8 py-6 sm:py-8 border-t border-line">
          <h2 id="sections-heading" className="font-display text-xl font-medium">
            By section
          </h2>
          <ul className="mt-5 space-y-5">
            {data.sections.map((s) => {
              const total = s.low + s.medium + s.high || 1;
              return (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-ink-muted">
                      Average <span className="tabular-nums text-ink">{s.average === null ? 'n/a' : Math.round(s.average)}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-paper-soft" role="img" aria-label={`${s.name}: ${s.low} low, ${s.medium} medium, ${s.high} high`}>
                    <span style={{ width: `${(s.low / total) * 100}%`, backgroundColor: '#d6cebf' }} />
                    <span style={{ width: `${(s.medium / total) * 100}%`, backgroundColor: '#9bb8b1' }} />
                    <span style={{ width: `${(s.high / total) * 100}%`, backgroundColor: '#17665a' }} />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-ink-muted">
                    {s.low} low · {s.medium} medium · {s.high} high
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="people-heading" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="people-heading" className="font-display text-xl font-medium">
            People
          </h2>
          <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}>
            Download CSV
          </Button>
        </div>
        {data.members.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nobody has joined the company yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto border-t border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Overall</th>
                  {data.sections.map((s) => (
                    <th key={s.key} className="px-3 py-3 text-right font-medium">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.user_id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-ink-muted">{m.department ?? m.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS[m.status].style)}>
                        {STATUS[m.status].label}
                        {m.status === 'in_progress' && m.progress_percent !== null ? ` ${m.progress_percent}%` : ''}
                      </span>
                      {m.completed_at && <p className="mt-1 text-xs text-ink-muted">{formatDate(m.completed_at)}</p>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.overall ? `${Math.round(m.overall.score)}` : '–'}</td>
                    {data.sections.map((s) => {
                      const x = m.sections.find((y) => y.key === s.key);
                      return (
                        <td key={s.key} className="px-3 py-3 text-right tabular-nums text-ink-soft" title={x?.level_label}>
                          {x ? Math.round(x.score) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">People agreed that your company sees results they take through it. Custom assessments are specific to your company and can’t be compared with other organisations’.</p>
      </section>
    </div>
  );
}

export default function AssessmentResultsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <ResultsFlow id={id} />
    </AppShell>
  );
}
