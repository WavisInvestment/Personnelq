'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { InvitationSummary } from '@/components/invitation-summary';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, PasswordField } from '@/components/ui/field';
import { authApi, getErrorMessage, safeNext, saveSession, homeFor } from '@/lib/auth';
import { INVALID_INVITATION_TEXT, useInvitation } from '@/lib/use-invitation';

export default function LoginPage() {
  const router = useRouter();
  const invitation = useInvitation();
  const invited = invitation.kind === 'ready' ? invitation : null;
  // An invitation link sends people here with ?invite=..., so they come back to it after signing in.
  const [next, setNext] = useState('');
  useEffect(() => setNext(safeNext(new URLSearchParams(window.location.search).get('next'), '')), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const authQuery = invited ? `?invite=${invited.token}` : next ? `?next=${encodeURIComponent(next)}` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // From an invitation the address is the invited one, whatever the form held.
      const { data } = await authApi.post('/auth/login', { email: invited ? invited.info.email : email, password });
      saveSession(data);
      router.push(invited ? `/invite/${invited.token}` : safeNext(next, homeFor(data.user)));
    } catch (err) {
      setError(getErrorMessage(err, 'Sign in failed. Please check your details and try again.'));
      setLoading(false);
    }
  };

  if (invitation.kind === 'invalid') {
    return (
      <AuthShell title="This invitation can’t be used">
        <div className="space-y-5">
          <Alert tone="info">{INVALID_INVITATION_TEXT[invitation.reason]}</Alert>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auth/login">Sign in without it</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go to Personnelq
            </ButtonLink>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (invitation.kind === 'loading') {
    return (
      <AuthShell title="Sign in">
        <div className="space-y-4" aria-hidden="true">
          <div className="h-28 animate-pulse rounded-2xl bg-paper-soft" />
          <div className="h-11 animate-pulse rounded-xl bg-paper-soft" />
          <div className="h-11 animate-pulse rounded-xl bg-paper-soft" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={invited ? `Sign in to join ${invited.info.organization_name}` : 'Welcome back'}
      subtitle={invited ? 'Use the account for the email address your invitation was sent to.' : 'Sign in to pick up where you left off.'}
      footer={
        <>
          New here?{' '}
          <Link href={`/auth/signup${authQuery}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
            {invited ? 'Create your account' : 'Create an account'}
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && <Alert tone="error">{error}</Alert>}

        {invited && <InvitationSummary info={invited.info} />}

        {invited ? (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            readOnly
            value={invited.info.email}
            className="cursor-not-allowed bg-paper-soft text-ink-soft"
            hint="From your invitation. It can’t be changed."
          />
        ) : (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        )}

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          autoFocus={!!invited}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          labelAction={
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          }
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Signing in' : invited ? 'Sign in and continue' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
