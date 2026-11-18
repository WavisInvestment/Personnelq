'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { EvolutionChart } from '@/components/charts/evolution-chart';
import { ClassEmblem, type ClassKey } from '@/components/class-emblem';
import { TierChip } from '@/components/results/class-card';
import { TraitRadar } from '@/components/trait-radar';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button, ButtonLink } from '@/components/ui/button';
import { ORGANIZATION_TYPE_LABELS } from '@/lib/account-types';
import { humanize } from '@/lib/admin';
import {
  daysUntil,
  formatDate,
  listAssessments,
  listResults,
  radarValues,
  getResult,
  type ResultView,
  readApiProblem,
  type AssessmentListItem,
  type ResultSummary,
} from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { getProgress, leaveCompany, termsFor, type Progress } from '@/lib/company';
import { listCompanyAssessments, type CompanyAssessment } from '@/lib/custom-assessments';
import { refreshOrganizations } from '@/lib/auth';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatusPill({ assessment }: { assessment: AssessmentListItem }) {
  const base = 'rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (assessment.status === 'completed') {
    return <span className={cn(base, 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200')}>Completed</span>;
  }
  if (assessment.status === 'in_progress') {
    return (
      <span className={cn(base, 'bg-accent-100 text-accent-600')}>In progress · {assessment.in_progress?.progress_percent ?? 0}%</span>
    );
  }
  return <span className={cn(base, 'bg-paper-soft text-ink-muted')}>Not started</span>;
}

function Step({ index, assessment, isNext, last }: { index: number; assessment: AssessmentListItem; isNext: boolean; last: boolean }) {
  const done = assessment.status === 'completed';
  const route = assessment.type === 'free_snapshot' ? 'snapshot' : 'full';
  const retakeDays = assessment.blocked_reason === 'RETAKE_LOCKED' ? daysUntil(assessment.retake_available_at) : null;

  return (
    <li className="relative flex gap-4 pb-8">
      {!last && <span aria-hidden="true" className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-line-strong" />}
      <span
        aria-hidden="true"
        className={cn(
          'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
          done
            ? 'border-brand-600 bg-brand-600 text-white'
            : isNext
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-line-strong bg-paper text-ink-muted',
        )}
      >
        {done ? (
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 10.5 3.5 3.5 7.5-8" />
          </svg>
        ) : (
          index
        )}
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-medium">{assessment.name}</h3>
          <StatusPill assessment={assessment} />
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {assessment.total_questions} questions · about {assessment.estimated_minutes} minutes
        </p>
        {assessment.description && <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{assessment.description}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {assessment.status === 'in_progress' && <ButtonLink href={`/assessments/${route}`}>Resume</ButtonLink>}
          {assessment.status === 'not_started' && assessment.can_start && (
            <ButtonLink href={`/assessments/${route}`} variant={isNext ? 'primary' : 'secondary'}>
              Begin
            </ButtonLink>
          )}
          {assessment.status === 'completed' && assessment.latest_result && (
            <ButtonLink href={`/results/${assessment.latest_result.id}`} variant="secondary">
              View results
            </ButtonLink>
          )}
          {assessment.status === 'completed' && assessment.can_start && (
            <ButtonLink href={`/assessments/${route}`} variant="ghost">
              Take again
            </ButtonLink>
          )}
          {assessment.blocked_reason === 'RETAKE_LOCKED' && (
            <p className="text-sm text-ink-muted">
              {assessment.retake_available_at
                ? `Retake opens ${formatDate(assessment.retake_available_at)}${retakeDays ? ` (in ${retakeDays} ${retakeDays === 1 ? 'day' : 'days'})` : ''}`
                : 'Can only be taken once'}
            </p>
          )}
          {assessment.blocked_reason === 'PAYMENT_REQUIRED' && <p className="text-sm text-ink-muted">Available with purchase</p>}
          {assessment.status === 'completed' && assessment.company_cover && assessment.company_retake && (
            assessment.company_retake.state === 'needs_approval' ? (
              <ButtonLink href={`/assessments/${route}`} variant="ghost">
                Ask {assessment.company_cover.name} for a retake
              </ButtonLink>
            ) : (
              <p className="text-sm text-ink-muted">
                {assessment.company_retake.state === 'requested' ? `Retake request sent to ${assessment.company_cover.name}` : `${assessment.company_cover.name} approved a retake`}
              </p>
            )
          )}
        </div>
      </div>
    </li>
  );
}

function DashboardContent() {
  const user = useSessionUser();
  const confirm = useConfirm();
  const [hello, setHello] = useState('Welcome');
  const [assessments, setAssessments] = useState<AssessmentListItem[] | null>(null);
  const [results, setResults] = useState<ResultSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [classView, setClassView] = useState<Pick<ResultView, 'profile_class' | 'tier'> | null>(null);
  const [companyAssessments, setCompanyAssessments] = useState<CompanyAssessment[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [orgError, setOrgError] = useState('');

  useEffect(() => setHello(greeting()), []);

  useEffect(() => {
    let cancelled = false;
    setError('');
    Promise.all([listAssessments(), listResults()])
      .then(([a, r]) => {
        if (cancelled) return;
        setAssessments(a);
        setResults(r);
      })
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The class and tier come with the latest result.
  const latestId = results?.find((r) => r.is_current && r.kind === 'ocean' && !r.is_preview)?.id ?? results?.find((r) => r.is_current && r.kind === 'ocean')?.id ?? null;
  useEffect(() => {
    if (!latestId) return;
    let cancelled = false;
    getResult(latestId)
      .then((v) => !cancelled && setClassView({ profile_class: v.profile_class, tier: v.tier }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [latestId]);

  useEffect(() => {
    let cancelled = false;
    getProgress().then((p) => !cancelled && setProgress(p)).catch(() => undefined);
    listCompanyAssessments().then((a) => !cancelled && setCompanyAssessments(a)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const organization = user.organizations?.[0];
  const runsCompany = organization?.role === 'admin' || organization?.role === 'hr';

  const leave = async () => {
    if (!organization) return;
    const ok = await confirm({
      title: `Leave ${organization.name}?`,
      message: 'It will stop seeing the results you took through it. Your results stay yours.',
      confirmLabel: 'Leave',
      tone: 'danger',
    });
    if (!ok) return;
    setLeaving(true);
    setOrgError('');
    try {
      await leaveCompany(organization.id);
      await refreshOrganizations();
      window.location.reload();
    } catch (err) {
      setOrgError(readApiProblem(err).message);
      setLeaving(false);
    }
  };
  const loading = !assessments && !error;
  const nextIndex = assessments ? assessments.findIndex((a) => a.status !== 'completed') : -1;

  // Show the richest current profile: the full assessment if there is one, otherwise the snapshot.
  const current = results?.filter((r) => r.is_current && r.kind === 'ocean') ?? [];
  const profile = current.find((r) => !r.is_preview) ?? current[0] ?? null;
  const fullResult = results?.find((r) => !r.is_preview && r.is_current && r.kind === 'ocean') ?? null;

  return (
    <>
      <div className="animate-fade-up">
        <h1 className="font-display text-4xl font-medium leading-tight sm:text-5xl">
          {hello}, {user.first_name}
        </h1>
        <p className="mt-3 text-lg text-ink-muted">Here’s where you are on your personality journey.</p>
      </div>

      {error && (
        <div className="mt-8 space-y-4">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="journey-heading" className="py-6 sm:py-8 border-t border-line">
          <h2 id="journey-heading" className="font-display text-2xl font-medium">
            Your journey
          </h2>

          {loading ? (
            <div className="mt-6 space-y-6" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-paper-soft" />
              ))}
            </div>
          ) : (
            <ol className="mt-6">
              {assessments?.map((a, i) => (
                <Step key={a.id} index={i + 1} assessment={a} isNext={i === nextIndex} last={false} />
              ))}
              <li className="relative flex gap-4">
                <span
                  aria-hidden="true"
                  className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-sm font-semibold text-ink-muted"
                >
                  {(assessments?.length ?? 0) + 1}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-display text-lg font-medium">Share your badge</h3>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                    Publish a personality badge with only the details you’re happy to share.
                  </p>
                  <div className="mt-4">
                    {fullResult ? (
                      <ButtonLink href={`/results/${fullResult.id}`} variant="secondary">
                        Manage your badge
                      </ButtonLink>
                    ) : (
                      <p className="text-sm text-ink-muted">Available after the full assessment.</p>
                    )}
                  </div>
                </div>
              </li>
            </ol>
          )}
        </section>

        <div className="space-y-6">
          {organization && (
            <section aria-labelledby="org-heading" className="py-6 sm:py-8 border-t border-line">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink-muted">
                    {ORGANIZATION_TYPE_LABELS[organization.type] ?? 'Organisation'}
                  </p>
                  <h2 id="org-heading" className="mt-1 font-display text-2xl font-medium leading-tight">
                    {organization.name}
                  </h2>
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                  {humanize(organization.role)}
                </span>
              </div>
              {runsCompany ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/company" size="sm">
                    Open company dashboard
                  </ButtonLink>
                  {organization.role === 'admin' && (
                    <Link href="/billing" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                      Plan and billing
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                    {organization.name} sees the results you take through its invitation. Your own results, badges and anything you take
                    privately stay private to you.
                  </p>
                  {orgError && <Alert tone="error" className="mt-3">{orgError}</Alert>}
                  {organization.can_leave === false ? (
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                      Your account was created from {organization.name}’s invitation, so it stays with the {termsFor(organization.type).org}. Ask them if you need to be removed.
                    </p>
                  ) : organization.can_leave === true ? (
                    <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={leave} loading={leaving}>
                      Leave company
                    </Button>
                  ) : null}
                </>
              )}
            </section>
          )}

          <section aria-labelledby="profile-heading" className="py-6 sm:py-8 border-t border-line">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="profile-heading" className="font-display text-2xl font-medium">
                {profile && !profile.is_preview ? 'Your profile' : 'Your class'}
              </h2>
              {profile && (
                <Link href={`/results/${profile.id}`} className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                  Details
                </Link>
              )}
            </div>
            {classView?.profile_class && (
              <div className="mt-4 flex items-center gap-4">
                <ClassEmblem name={classView.profile_class.key as ClassKey} className="h-16 w-16 shrink-0" />
                <div>
                  <p className="font-display text-xl font-bold leading-tight tracking-[-0.03em]">{classView.profile_class.name}</p>
                  <p className="text-[15px] text-ink-soft">{classView.profile_class.tagline}</p>
                  {classView.tier && (
                    <div className="mt-2">
                      <TierChip tier={classView.tier} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {profile && !profile.is_preview && (
              <div className="mx-auto mt-4 max-w-[260px]">
                <TraitRadar values={radarValues(profile.traits)} />
              </div>
            )}
            {!profile && (
              <div className="mx-auto mt-2 max-w-[260px]">
                <TraitRadar muted />
              </div>
            )}
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {profile
                ? `From your ${profile.is_preview ? 'free snapshot' : 'full assessment'} on ${formatDate(profile.completed_at)}.${classView?.tier?.next ? ` ${classView.tier.next}` : ''}`
                : 'Your class and profile appear here after your first assessment.'}
            </p>
          </section>

          <dl className="grid grid-cols-2 gap-4">
            <div className="border-l-2 border-line-strong py-1 pl-4">
              <dt className="text-sm text-ink-muted">Assessments taken</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums">{results?.length ?? '–'}</dd>
            </div>
            <div className="border-l-2 border-line-strong py-1 pl-4">
              <dt className="text-sm text-ink-muted">Last assessment</dt>
              <dd className="mt-1 font-display text-xl font-medium leading-9">
                {results && results.length > 0 ? formatDate(results[0].completed_at) : 'Not yet'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {companyAssessments.length > 0 && (
        <section aria-labelledby="company-heading" className="mt-6 py-6 sm:py-8 border-t border-line">
          <h2 id="company-heading" className="font-display text-2xl font-medium">
            From {companyAssessments[0].company.name}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Assessments your company wrote for you. The company can see the results you take through them.</p>
          <ul className="mt-5 divide-y divide-line">
            {companyAssessments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-ink-muted">
                    {a.total_questions} statements · about {a.estimated_minutes} {a.estimated_minutes === 1 ? 'minute' : 'minutes'}
                    {a.status === 'in_progress' && a.in_progress ? ` · ${a.in_progress.progress_percent}% done` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.status === 'completed' && a.latest_result && (
                    <ButtonLink href={`/results/${a.latest_result.id}`} variant="secondary" size="sm">
                      View results
                    </ButtonLink>
                  )}
                  {a.can_start && a.status !== 'completed' && (
                    <ButtonLink href={`/company-assessments/${a.id}`} size="sm">
                      {a.status === 'in_progress' ? 'Resume' : 'Begin'}
                    </ButtonLink>
                  )}
                  {a.status === 'completed' && a.can_start && (
                    <ButtonLink href={`/company-assessments/${a.id}`} variant="ghost" size="sm">
                      Take again
                    </ButtonLink>
                  )}
                  {a.status === 'completed' && !a.can_start && a.company_retake?.state === 'needs_approval' && (
                    <ButtonLink href={`/company-assessments/${a.id}`} variant="ghost" size="sm">
                      Ask for a retake
                    </ButtonLink>
                  )}
                  {a.status === 'completed' && a.company_retake?.state === 'requested' && <span className="text-sm text-ink-muted">Retake request sent</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {progress && progress.summary.full_attempts > 0 && (
        <section aria-labelledby="change-heading" className="mt-6 py-6 sm:py-8 border-t border-line">
          <h2 id="change-heading" className="font-display text-2xl font-medium">
            How you’re changing
          </h2>
          {progress.points.length >= 2 ? (
            <div className="mt-4">
              <EvolutionChart progress={progress} />
            </div>
          ) : (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
              You’ve taken the full assessment once. After your next attempt, this shows how each trait has moved.
            </p>
          )}
        </section>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
