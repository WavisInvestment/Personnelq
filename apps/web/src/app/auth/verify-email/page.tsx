'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { verifyEmail } from '@/lib/account';
import { getErrorMessage, getStoredUser } from '@/lib/auth';

type State = { kind: 'working' } | { kind: 'done'; email: string } | { kind: 'failed'; message: string };

function Confirm() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>(token ? { kind: 'working' } : { kind: 'failed', message: 'This confirmation link is incomplete.' });
  // A link works once. In development React runs effects twice, and the second call would wrongly report it as used.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(({ email }) => {
        const stored = getStoredUser();
        if (stored) localStorage.setItem('user', JSON.stringify({ ...stored, email, email_verified: true }));
        setState({ kind: 'done', email });
      })
      .catch((err) => setState({ kind: 'failed', message: getErrorMessage(err, 'We couldn’t confirm your email address. Please try again.') }));
  }, [token]);

  if (state.kind === 'working') {
    return (
      <p role="status" className="text-ink-muted">
        Confirming your address…
      </p>
    );
  }

  if (state.kind === 'done') {
    return (
      <div className="space-y-5">
        <Alert tone="success">{state.email} is confirmed.</Alert>
        <ButtonLink href={getStoredUser() ? '/dashboard' : '/auth/login'} size="lg" className="w-full">
          {getStoredUser() ? 'Go to your dashboard' : 'Sign in'}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Alert tone="error">{state.message}</Alert>
      <p className="text-sm text-ink-muted">Confirmation links work once and last a day. Sign in and open Account to be sent a new one.</p>
      <ButtonLink href={getStoredUser() ? '/account' : '/auth/login'} variant="secondary" size="lg" className="w-full">
        {getStoredUser() ? 'Open account' : 'Sign in'}
      </ButtonLink>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Confirm your email" subtitle="One quick step so we know this address is yours.">
      <Suspense fallback={null}>
        <Confirm />
      </Suspense>
    </AuthShell>
  );
}
