'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Alert } from '@/components/ui/alert';
import { ButtonLink, Spinner } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { formatMoney, verifyPayment, type VerifyResponse } from '@/lib/billing';

const MAX_CHECKS = 8;
const WAIT_MS = 2500;

type Phase = { kind: 'checking' } | { kind: 'done'; result: VerifyResponse } | { kind: 'slow' } | { kind: 'error'; message: string };

function CallbackFlow() {
  const params = useSearchParams();
  // Paystack sends both; they are the same value.
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    if (!reference) {
      setPhase({ kind: 'error', message: 'We couldn’t tell which payment this is. Check your payment history.' });
      return;
    }
    let cancelled = false;

    (async () => {
      for (let i = 0; i < MAX_CHECKS; i++) {
        try {
          const result = await verifyPayment(reference);
          if (cancelled) return;
          if (result.status !== 'pending') {
            setPhase({ kind: 'done', result });
            return;
          }
        } catch (err) {
          if (cancelled) return;
          const problem = readApiProblem(err);
          if (problem.status === 404 || problem.status === 400) {
            setPhase({ kind: 'error', message: 'We couldn’t find that payment on your account.' });
            return;
          }
          // A hiccup (network, rate limit): keep trying a few more times.
        }
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
      if (!cancelled) setPhase({ kind: 'slow' });
    })();

    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      {phase.kind === 'checking' && (
        <div className="py-8 text-center border-t border-line" role="status" aria-live="polite">
          <Spinner className="mx-auto h-7 w-7 text-brand-600" />
          <h1 className="mt-5 font-display text-3xl font-medium">Confirming your payment</h1>
          <p className="mt-2 text-[15px] text-ink-muted">This usually takes a few seconds. Please don’t close this page.</p>
        </div>
      )}

      {phase.kind === 'done' && phase.result.status === 'success' && <Success result={phase.result} />}

      {phase.kind === 'done' && phase.result.status === 'failed' && (
        <div className="space-y-5">
          <h1 className="font-display text-3xl font-medium">The payment didn’t go through</h1>
          <Alert tone="error">You haven’t been charged for this attempt. You can try again whenever you’re ready.</Alert>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={phase.result.next.href}>Try again</ButtonLink>
            <ButtonLink href="/payments" variant="secondary">
              Payment history
            </ButtonLink>
          </div>
        </div>
      )}

      {phase.kind === 'done' && phase.result.status === 'unknown' && (
        <div className="space-y-5">
          <Alert tone="error">We couldn’t find that payment.</Alert>
          <ButtonLink href="/payments" variant="secondary">
            Payment history
          </ButtonLink>
        </div>
      )}

      {phase.kind === 'slow' && (
        <div className="space-y-5">
          <h1 className="font-display text-3xl font-medium">Still waiting for your bank</h1>
          <Alert tone="info">
            Your payment hasn’t been confirmed yet. If you were charged, it will show up on your payment history shortly and we’ll
            email your receipt. You don’t need to pay again.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/payments">Payment history</ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">
              Back to dashboard
            </ButtonLink>
          </div>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="space-y-5">
          <Alert tone="error">{phase.message}</Alert>
          <ButtonLink href="/payments" variant="secondary">
            Payment history
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

function Success({ result }: { result: VerifyResponse }) {
  const p = result.payment;
  const isAssessment = p?.type === 'assessment';
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-700">Payment received</p>
        <h1 className="mt-2 font-display text-4xl font-medium leading-tight">Payment received</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {isAssessment ? 'Your full assessment is unlocked. A receipt is on its way to your email.' : 'Your plan is active. A receipt is on its way to your email.'}
        </p>
      </div>
      {p && (
        <dl className="grid grid-cols-2 gap-4 p-5 text-sm rounded-xl bg-paper-soft">
          <div>
            <dt className="text-ink-muted">For</dt>
            <dd className="mt-0.5 font-medium">{p.description ?? 'Personnelq'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Amount</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Date</dt>
            <dd className="mt-0.5 font-medium">{formatDate(p.paid_at)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-muted">Reference</dt>
            <dd className="mt-0.5 truncate font-mono text-xs">{p.reference}</dd>
          </div>
        </dl>
      )}
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={result.next.href} size="lg">
          {isAssessment ? 'Begin the assessment' : 'Go to dashboard'}
        </ButtonLink>
        <ButtonLink href="/payments" variant="secondary" size="lg">
          Payment history
        </ButtonLink>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="mx-auto h-64 max-w-xl animate-pulse border-t border-line" aria-hidden="true" />}>
        <CallbackFlow />
      </Suspense>
    </AppShell>
  );
}
