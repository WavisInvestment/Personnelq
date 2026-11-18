'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AssessmentRunner } from '@/components/assessments/runner';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { RetakeAsk } from '@/components/retake-ask';
import { formatMoney, startCheckout } from '@/lib/billing';
import {
  ASSESSMENT_SLUGS,
  formatDate,
  listAssessments,
  readApiProblem,
  startAssessment,
  type AssessmentListItem,
  type AssessmentRoute,
  type SubmissionView,
} from '@/lib/assessments';

function Intro({
  assessment,
  onStart,
  starting,
  error,
  onPay,
  paying,
  onStartCompany,
  onReload,
}: {
  assessment: AssessmentListItem;
  onStart: () => void;
  starting: boolean;
  error: string;
  onPay: () => void;
  paying: boolean;
  onStartCompany: () => void;
  onReload: () => void;
}) {
  const isSnapshot = assessment.type === 'free_snapshot';
  const resuming = assessment.status === 'in_progress';
  const blocked = assessment.blocked_reason;
  const cover = assessment.company_cover;
  // Starting for a company is only offered for a fresh attempt; resuming keeps whatever was already started.
  // Repeating one already finished for the company needs its approval first.
  const retakeState = assessment.company_retake;
  const offerCompany = !!cover && !resuming && (!retakeState || retakeState.state === 'approved');

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-medium text-brand-700">{isSnapshot ? 'Free · preview' : 'Full assessment'}</p>
      <h1 className="mt-2 font-display text-4xl font-medium leading-tight">{assessment.name}</h1>
      {assessment.description && <p className="mt-3 text-lg text-ink-soft">{assessment.description}</p>}

      <dl className="mt-8 grid grid-cols-2 gap-4">
        <div className="border-l-2 border-line-strong py-1 pl-4">
          <dt className="text-sm text-ink-muted">Questions</dt>
          <dd className="mt-1 font-display text-3xl font-medium">{assessment.total_questions}</dd>
        </div>
        <div className="border-l-2 border-line-strong py-1 pl-4">
          <dt className="text-sm text-ink-muted">Time</dt>
          <dd className="mt-1 font-display text-3xl font-medium">About {assessment.estimated_minutes} min</dd>
        </div>
      </dl>

      <ul className="mt-8 space-y-3 text-[15px] leading-relaxed text-ink-soft">
        <li className="flex gap-3">
          <Dot />
          <span>Rate how much each statement describes you, from strongly disagree to strongly agree.</span>
        </li>
        <li className="flex gap-3">
          <Dot />
          <span>There are no right or wrong answers. Go with your first instinct and answer as you are, not as you’d like to be.</span>
        </li>
        <li className="flex gap-3">
          <Dot />
          <span>Your answers save as you go, so you can stop and pick it up later.</span>
        </li>
        {isSnapshot ? (
          <li className="flex gap-3">
            <Dot />
            <span>
              The snapshot gives you a first read of your personality and a short written analysis. The full assessment adds
              your complete profile and class, a detailed reading and a shareable badge.
            </span>
          </li>
        ) : (
          <li className="flex gap-3">
            <Dot />
            <span>Your results are private to you. You choose what, if anything, to share later.</span>
          </li>
        )}
      </ul>

      {error && (
        <Alert tone="error" className="mt-8">
          {error}
        </Alert>
      )}

      <div className="mt-10">
        {cover && !resuming && retakeState && (
          <div className="mb-8">
            <RetakeAsk assessmentId={assessment.id} company={cover.name} state={retakeState} onChanged={onReload} />
          </div>
        )}
        {offerCompany && cover && (
          <div className="mb-8 rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <h2 className="font-display text-xl font-medium">Take it for {cover.name}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              {cover.name} covers this attempt, so there is nothing to pay. <strong className="font-semibold">The company’s administrators and HR can see the results.</strong>{' '}
              Your own results and anything you take privately stay private.
            </p>
            <Button size="lg" className="mt-5" onClick={onStartCompany} loading={starting}>
              Begin for {cover.name}
            </Button>
            <p className="mt-6 border-t border-brand-200 pt-4 text-sm text-ink-soft">Prefer to keep it to yourself? You can take it privately below{blocked === 'PAYMENT_REQUIRED' ? ' (needs a purchase)' : ''}.</p>
          </div>
        )}
        {blocked === 'RETAKE_LOCKED' && (
          <div className="space-y-4">
            <Alert tone="info">
              {assessment.latest_result && <>You completed this on {formatDate(assessment.latest_result.completed_at)}. </>}
              {assessment.retake_available_at
                ? <>You can take it again on {formatDate(assessment.retake_available_at)}, so your results stay comparable over time.</>
                : <>It can only be taken once.</>}
            </Alert>
            {assessment.latest_result && (
              <ButtonLink href={`/results/${assessment.latest_result.id}`} size="lg">
                View your results
              </ButtonLink>
            )}
          </div>
        )}

        {blocked === 'PAYMENT_REQUIRED' && (
          <div className="space-y-4">
            <Alert tone="info">
              The full assessment is a paid attempt{assessment.price ? <> ({formatMoney(assessment.price.amount, assessment.price.currency)})</> : null}.
              You’ll pay securely with Paystack, then come straight back to begin.
            </Alert>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={onPay} loading={paying}>
                {assessment.price ? `Pay ${formatMoney(assessment.price.amount, assessment.price.currency)} and begin` : 'Pay and begin'}
              </Button>
              <Link href="/dashboard" className="text-sm font-medium text-ink-soft underline-offset-4 hover:underline">
                Not now
              </Link>
            </div>
          </div>
        )}

        {blocked === 'PAYMENT_UNAVAILABLE' && (
          <div className="space-y-4">
            <Alert tone="info">Purchases aren’t available right now. Please check back soon.</Alert>
            <ButtonLink href="/dashboard" variant="secondary">
              Back to dashboard
            </ButtonLink>
          </div>
        )}

        {!blocked && (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onStart} loading={starting}>
              {resuming
                ? `Resume (${assessment.in_progress?.progress_percent ?? 0}% done)`
                : assessment.status === 'completed'
                  ? 'Take it again'
                  : offerCompany
                    ? 'Begin privately'
                    : 'Begin'}
            </Button>
            <Link href="/dashboard" className="text-sm font-medium text-ink-soft underline-offset-4 hover:underline">
              Not now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />;
}

function AssessmentFlow({ route }: { route: AssessmentRoute }) {
  const router = useRouter();

  const [assessment, setAssessment] = useState<AssessmentListItem | null>(null);
  const [loadError, setLoadError] = useState('');
  const [submission, setSubmission] = useState<SubmissionView | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAssessments()
      .then((all) => {
        if (cancelled) return;
        const found = all.find((a) => a.slug === ASSESSMENT_SLUGS[route]);
        if (found) setAssessment(found);
        else setLoadError('That assessment isn’t available right now.');
      })
      .catch((err) => !cancelled && setLoadError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [route]);

  const start = async (organizationId?: string) => {
    if (!assessment) return;
    setStarting(true);
    setStartError('');
    try {
      const { submission } = await startAssessment(assessment.id, organizationId);
      if (submission.result_id) {
        router.replace(`/results/${submission.result_id}`);
        return;
      }
      setSubmission(submission);
    } catch (err) {
      const problem = readApiProblem(err);
      if (problem.code === 'RETAKE_LOCKED' || problem.code === 'RETAKE_NEEDS_APPROVAL' || problem.code === 'PAYMENT_REQUIRED' || problem.code === 'PAYMENT_UNAVAILABLE' || problem.code === 'COMPANY_COVER_UNAVAILABLE') {
        // The list was stale (for example this tab was open a while); reload it so the right message shows.
        listAssessments().then((all) => setAssessment(all.find((a) => a.slug === ASSESSMENT_SLUGS[route]) ?? assessment));
      }
      setStartError(problem.message);
    } finally {
      setStarting(false);
    }
  };

  const reload = () => listAssessments().then((all) => setAssessment(all.find((a) => a.slug === ASSESSMENT_SLUGS[route]) ?? assessment)).catch(() => undefined);

  const pay = async () => {
    if (!assessment) return;
    setPaying(true);
    setStartError('');
    try {
      const checkout = await startCheckout(assessment.id);
      // Paystack's hosted page; it sends the customer back to /payments/callback afterwards.
      window.location.assign(checkout.authorization_url);
    } catch (err) {
      const problem = readApiProblem(err);
      if (['RETAKE_LOCKED', 'ALREADY_PAID', 'ATTEMPT_IN_PROGRESS', 'NO_PAYMENT_NEEDED'].includes(problem.code ?? '')) {
        listAssessments().then((all) => setAssessment(all.find((a) => a.slug === ASSESSMENT_SLUGS[route]) ?? assessment));
      }
      setStartError(problem.message);
      setPaying(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert tone="error">{loadError}</Alert>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  if (!assessment) {
    return <div className="mx-auto h-96 max-w-2xl animate-pulse border-t border-line" aria-hidden="true" />;
  }

  if (submission) {
    return <AssessmentRunner submission={submission} onFinished={(id) => router.push(`/results/${id}`)} />;
  }

  return <Intro assessment={assessment} onStart={() => start()} onStartCompany={() => start(assessment.company_cover?.id)} onReload={reload} starting={starting} error={startError} onPay={pay} paying={paying} />;
}

export default function AssessmentPage() {
  const { type } = useParams<{ type: string }>();
  if (!(type in ASSESSMENT_SLUGS)) notFound();

  return (
    <AppShell>
      <AssessmentFlow route={type as AssessmentRoute} />
    </AppShell>
  );
}
