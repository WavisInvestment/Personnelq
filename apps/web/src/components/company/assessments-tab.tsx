'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { createAssessment, listAssessments, type AssessmentListItem } from '@/lib/custom-assessments';

export function AssessmentsTab({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<AssessmentListItem[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listAssessments(organizationId)
      .then((d) => !cancelled && setItems(d))
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      router.push(`/company/assessments/${await createAssessment(organizationId, name.trim())}`);
    } catch (err) {
      setError(readApiProblem(err).message);
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="py-6 sm:py-8 border-t border-line">
        <h2 className="font-display text-xl font-medium">Create an assessment</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Write your own statements, group them into sections and say what each score means. Once published, everyone in your company can take it, and you see the results here. It is labelled as your company’s own assessment, not an official Personnelq one.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-sm font-medium">
            Name
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Customer service fit" className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal" />
          </label>
          <Button type="submit" loading={creating} disabled={name.trim().length < 3}>
            Start writing
          </Button>
        </div>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      </form>

      <section aria-labelledby="mine-heading">
        <h2 id="mine-heading" className="font-display text-xl font-medium">
          Your assessments
        </h2>
        {!items && !error && <div className="mt-4 h-24 animate-pulse border-t border-line" aria-hidden="true" />}
        {items && items.length === 0 && <p className="mt-3 text-sm text-ink-muted">None yet. Create your first one above.</p>}
        {items && items.length > 0 && (
          <ul className="mt-4 divide-y divide-line overflow-hidden border-t border-line">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/company/assessments/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                      {a.name}
                    </Link>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', a.status === 'published' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-paper-soft text-ink-muted ring-line-strong')}>
                      {a.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Version {a.version} · {a.sections} {a.sections === 1 ? 'section' : 'sections'} · {a.questions} {a.questions === 1 ? 'statement' : 'statements'}
                    {a.published_at ? ` · published ${formatDate(a.published_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {a.status === 'published' && (
                    <span className="text-ink-muted tabular-nums">
                      {a.completed} of {a.team_size} finished
                    </span>
                  )}
                  <Link href={`/company/assessments/${a.id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                    {a.status === 'published' ? 'Open' : 'Edit'}
                  </Link>
                  {a.status === 'published' && (
                    <Link href={`/company/assessments/${a.id}/results`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                      Results
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
