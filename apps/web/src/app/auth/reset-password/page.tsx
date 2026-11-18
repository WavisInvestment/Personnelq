'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { PasswordChecklist, PasswordField, isPasswordValid } from '@/components/ui/field';
import { authApi, getErrorMessage } from '@/lib/auth';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.push('/auth/login'), 3000);
    return () => clearTimeout(timer);
  }, [done, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConfirmError('');

    if (!isPasswordValid(password)) {
      setError('Your password doesn’t meet all the requirements yet.');
      return;
    }
    if (password !== passwordConfirm) {
      setConfirmError('Passwords don’t match');
      return;
    }

    setLoading(true);
    try {
      await authApi.post('/auth/reset-password', {
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, 'We couldn’t reset your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token || (error && error.toLowerCase().includes('expired'))) {
    return (
      <div className="space-y-5">
        <Alert tone="error">
          {token ? error : 'This reset link is incomplete.'} Reset links expire after an hour and work once.
        </Alert>
        <ButtonLink href="/auth/forgot-password" size="lg" className="w-full">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5">
        <Alert tone="success">Your password has been updated. Taking you to sign in…</Alert>
        <ButtonLink href="/auth/login" variant="secondary" size="lg" className="w-full">
          Sign in now
        </ButtonLink>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordChecklist value={password} />
      </div>

      <PasswordField
        label="Confirm new password"
        name="password_confirm"
        autoComplete="new-password"
        required
        value={passwordConfirm}
        onChange={(e) => {
          setPasswordConfirm(e.target.value);
          setConfirmError('');
        }}
        error={confirmError}
      />

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {loading ? 'Updating' : 'Update password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something strong. You’ll be signed out of any other devices."
      footer={
        <Link href="/auth/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
