'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { formatDate, listResults, readApiProblem, type ResultSummary } from '@/lib/assessments';
import { TRAITS } from '@/lib/traits';

function MiniBars({ traits }: { traits: ResultSummary['traits'] }) {
  return (
    <ul className="grid grid-cols-5 gap-3" aria-label="Trait scores">
      {TRAITS.map((meta) => {
        const t = traits.find((x) => x.trait === meta.key);
        const score = t?.score ?? 0;
        return (
          <li key={meta.key} className="min-w-0" title={`${meta.name}: ${Math.round(score)} (${t?.level_label})`}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold" style={{ color: meta.color }} aria-hidden="true">
                {meta.letter}
              </span>
              <span className="tabular-nums text-ink-muted">{Math.round(score)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-soft">
              <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: meta.color }} />
            </div>
            <span className="sr-only">
              {meta.name}: {Math.round(score)}, {t?.level_label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultsFlow() {
  const [results, setResults] = useState<ResultSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    listResults()
      .then((r) => !cancelled && setResults(r))
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const groups = results
    ? Object.values(
        results.reduce<Record<string, { name: string; items: ResultSummary[] }>>((acc, r) => {
          // Company-made assessments have no slug, so they are grouped by name.
          (acc[r.assessment.slug ?? `custom:${r.assessment.name}`] ??= { name: r.assessment.name, items: [] }).items.push(r);
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <div className="mb-10">
        <h1 className="font-display text-4xl font-medium leading-tight sm:text-5xl">My results</h1>
        <p className="mt-3 text-lg text-ink-muted">Every assessment you’ve completed, kept so you can see how you change over time.</p>
      </div>

      {error && (
        <div className="space-y-4">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {!results && !error && <div className="h-64 animate-pulse border-t border-line" aria-hidden="true" />}

      {results && results.length === 0 && (
        <div className="py-10 text-center border-t border-line">
          <h2 className="font-display text-2xl font-medium">No results yet</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-muted">
            Take the free snapshot to see your first profile. It takes about five minutes.
          </p>
          <ButtonLink href="/assessments/snapshot" size="lg" className="mt-6">
            Start the free snapshot
          </ButtonLink>
        </div>
      )}

      <div className="space-y-12">
        {groups.map((group) => (
          <section key={group.name} aria-labelledby={`g-${group.name}`}>
            <h2 id={`g-${group.name}`} className="font-display text-2xl font-medium">
              {group.name}
            </h2>
            <ol className="stagger mt-4 space-y-3">
              {group.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/results/${r.id}`}
                    className="block p-5 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift rounded-xl bg-paper-soft"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{formatDate(r.completed_at)}</span>
                        <span className="text-sm text-ink-muted">Attempt {r.submission_number}</span>
                        {r.is_current && (
                          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                            Latest
                          </span>
                        )}
                        {r.kind === 'custom' && (
                          <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-600">{r.company ?? 'Company assessment'}</span>
                        )}
                        {r.is_preview && (
                          <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-600">Preview</span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-brand-700">View →</span>
                    </div>
                    <div className="mt-4">
                      {r.kind === 'custom' ? (
                        <p className="text-sm text-ink-muted">
                          Overall <span className="font-medium tabular-nums text-ink">{Math.round(r.overall_score)}</span> / 100
                        </p>
                      ) : r.is_preview ? (
                        <p className="text-sm text-ink-muted">A first read with a short written analysis.</p>
                      ) : (
                        <MiniBars traits={r.traits} />
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

export default function ResultsPage() {
  return (
    <AppShell>
      <ResultsFlow />
    </AppShell>
  );
}
