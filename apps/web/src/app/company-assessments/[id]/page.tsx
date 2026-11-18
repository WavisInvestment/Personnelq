'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AssessmentRunner } from '@/components/assessments/runner';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { RetakeAsk } from '@/components/retake-ask';
import { formatDate, readApiProblem, startAssessment, type SubmissionView } from '@/lib/assessments';
import { listCompanyAssessments, type CompanyAssessment } from '@/lib/custom-assessments';

function Flow({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<CompanyAssessment | null>(null);
  const [missing, setMissing] = useState(false);
  const [submission, setSubmission] = useState<SubmissionView | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listCompanyAssessments()
      .then((all) => {
        if (cancelled) return;
        const found = all.find((a) => a.id === id);
        if (found) setItem(found);
        else setMissing(true);
      })
      .catch((err) => !cancelled && (setError(readApiProblem(err).message), setMissing(true)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert tone={error ? 'error' : 'info'}>{error || 'That assessment isn’t available. It may have been archived, or your company’s plan may have ended.'}</Alert>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }
  if (!item) return <div className="mx-auto h-96 max-w-2xl animate-pulse border-t border-line" aria-hidden="true" />;
  if (submission) return <AssessmentRunner submission={submission} onFinished={(resultId) => router.push(`/results/${resultId}`)} />;

  const resuming = item.status === 'in_progress';
  const reload = () =>
    listCompanyAssessments()
      .then((all) => {
        const found = all.find((a) => a.id === id);
        if (found) setItem(found);
      })
      .catch(() => undefined);
  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const { submission: s } = await startAssessment(item.id);
      if (s.result_id) {
        router.replace(`/results/${s.result_id}`);
        return;
      }
      setSubmission(s);
    } catch (err) {
      const p = readApiProblem(err);
      if (p.code === 'RETAKE_NEEDS_APPROVAL') reload();
      setError(p.code === 'RETAKE_LOCKED' || p.code === 'RETAKE_NEEDS_APPROVAL' ? p.message : p.status === 404 ? 'This assessment is no longer available.' : p.message);
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-medium text-brand-700">{item.company.name} · Company assessment</p>
      <h1 className="mt-2 font-display text-4xl font-medium leading-tight">{item.name}</h1>
      {item.description && <p className="mt-3 text-lg text-ink-soft">{item.description}</p>}

      <dl className="mt-8 grid grid-cols-2 gap-4">
        <div className="border-l-2 border-line-strong py-1 pl-4">
          <dt className="text-sm text-ink-muted">Statements</dt>
          <dd className="mt-1 font-display text-3xl font-medium">{item.total_questions}</dd>
        </div>
        <div className="border-l-2 border-line-strong py-1 pl-4">
          <dt className="text-sm text-ink-muted">Time</dt>
          <dd className="mt-1 font-display text-3xl font-medium">About {item.estimated_minutes} min</dd>
        </div>
      </dl>

      <Alert tone="info" className="mt-8">
        This assessment was written by <strong className="font-semibold">{item.company.name}</strong>, not by Personnelq. <strong className="font-semibold">The company’s administrators and HR can see your results.</strong> Your own results and anything you take privately stay private.
      </Alert>
      <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">Rate how much each statement describes you, from strongly disagree to strongly agree. Your answers save as you go, so you can stop and pick it up later.</p>

      {error && <Alert tone="error" className="mt-6">{error}</Alert>}

      {item.company_retake && item.status === 'completed' && (
        <div className="mt-8">
          <RetakeAsk assessmentId={item.id} company={item.company.name} state={item.company_retake} onChanged={reload} />
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {item.can_start ? (
          <Button size="lg" onClick={start} loading={starting}>
            {resuming ? `Resume (${item.in_progress?.progress_percent ?? 0}% done)` : item.status === 'completed' ? 'Take it again' : 'Begin'}
          </Button>
        ) : (
          <>
            <p className="text-sm text-ink-muted">You finished this on {formatDate(item.latest_result?.completed_at)}.</p>
            {item.latest_result && <ButtonLink href={`/results/${item.latest_result.id}`}>View your results</ButtonLink>}
          </>
        )}
        <Link href="/dashboard" className="text-sm font-medium text-ink-soft underline-offset-4 hover:underline">
          Not now
        </Link>
      </div>
    </div>
  );
}

export default function CompanyAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <Flow id={id} />
    </AppShell>
  );
}
