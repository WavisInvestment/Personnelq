'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AccountTypePicker } from '@/components/account-type-picker';
import { AuthShell } from '@/components/auth-shell';
import { InvitationSummary } from '@/components/invitation-summary';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, PasswordChecklist, PasswordField, isPasswordValid } from '@/components/ui/field';
import { ACCOUNT_TYPE_OPTIONS, type AccountType } from '@/lib/account-types';
import { authApi, getErrorMessage, safeNext, saveSession, homeFor } from '@/lib/auth';
import { INVALID_INVITATION_TEXT, useInvitation } from '@/lib/use-invitation';

export default function SignupPage() {
  const router = useRouter();
  const invitation = useInvitation();
  const invited = invitation.kind === 'ready' ? invitation : null;
  const [next, setNext] = useState('');
  useEffect(() => setNext(safeNext(new URLSearchParams(window.location.search).get('next'), '')), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alreadyHasAccount, setAlreadyHasAccount] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [form, setForm] = useState({
    organization_name: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirm: '',
  });

  const selected = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountType)!;
  // From an invitation the person always joins as an individual: no choice of account type.
  const isOrganization = !invited && accountType !== 'individual';
  // Where to go afterwards: the invitation page, to accept it.
  const destination = invited ? `/invite/${invited.token}` : safeNext(next, '/dashboard');
  const authQuery = invited ? `?invite=${invited.token}` : next ? `?next=${encodeURIComponent(next)}` : '';

  const update = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (e.target.name === 'password_confirm' || e.target.name === 'password') setConfirmError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAlreadyHasAccount(false);

    if (!isPasswordValid(form.password)) {
      setError('Your password doesn’t meet all the requirements yet.');
      return;
    }
    if (form.password !== form.password_confirm) {
      setConfirmError('Passwords don’t match');
      return;
    }

    setLoading(true);
    try {
      const { organization_name, ...person } = form;
      const { data } = await authApi.post('/auth/signup', {
        ...person,
        // The address and account type come from the invitation, never from what was typed.
        ...(invited ? { email: invited.info.email, account_type: 'individual', invitation_token: invited.token } : { account_type: accountType }),
        ...(isOrganization && { organization_name: organization_name.trim() }),
      });
      saveSession(data);
      // someone who signed up a company lands on it; an invitation or a ?next= address wins over that
      router.push(invited || next ? destination : homeFor(data.user));
    } catch (err) {
      const message = getErrorMessage(err, 'We couldn’t create your account. Please try again.');
      setAlreadyHasAccount(/already registered/i.test(message));
      setError(/already registered/i.test(message) ? 'There is already an account with this email address.' : message);
      setLoading(false);
    }
  };

  if (invitation.kind === 'invalid') {
    return (
      <AuthShell title="This invitation can’t be used">
        <div className="space-y-5">
          <Alert tone="info">{INVALID_INVITATION_TEXT[invitation.reason]}</Alert>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auth/login">Sign in</ButtonLink>
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
      <AuthShell title="Join your team">
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
      title={invited ? `Join ${invited.info.organization_name}` : 'Create your account'}
      subtitle={
        invited
          ? 'Create your account to accept the invitation.'
          : isOrganization
            ? `Set up ${selected.label.toLowerCase().replace(/^a /, 'your ')} and start with a free snapshot of your own personality.`
            : 'Start with a free snapshot of your personality. It takes about five minutes.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href={`/auth/login${authQuery}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <Alert tone="error">
            {error}
            {alreadyHasAccount && (
              <>
                {' '}
                <Link href={`/auth/login${authQuery}`} className="font-medium underline underline-offset-4">
                  Sign in instead
                </Link>
                {invited ? ' to accept the invitation.' : '.'}
              </>
            )}
          </Alert>
        )}

        {invited ? <InvitationSummary info={invited.info} /> : <AccountTypePicker value={accountType} onChange={setAccountType} />}

        {isOrganization && (
          <Field
            label={selected.organizationLabel ?? 'Organisation name'}
            name="organization_name"
            autoComplete="organization"
            required
            minLength={2}
            maxLength={100}
            value={form.organization_name}
            onChange={update}
            placeholder={selected.organizationPlaceholder}
            hint="You’ll be its administrator."
          />
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="First name"
            name="first_name"
            autoComplete="given-name"
            required
            minLength={2}
            maxLength={50}
            value={form.first_name}
            onChange={update}
          />
          <Field
            label="Last name"
            name="last_name"
            autoComplete="family-name"
            required
            minLength={2}
            maxLength={50}
            value={form.last_name}
            onChange={update}
          />
        </div>

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
            label={isOrganization ? 'Work email' : 'Email'}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update}
            placeholder="you@example.com"
          />
        )}

        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={update}
          />
          <PasswordChecklist value={form.password} />
        </div>

        <PasswordField
          label="Confirm password"
          name="password_confirm"
          autoComplete="new-password"
          required
          value={form.password_confirm}
          onChange={update}
          error={confirmError}
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Creating account' : invited ? 'Create account and continue' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
