'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { authApi, getErrorMessage } from '@/lib/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authApi.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={submitted ? 'Check your inbox' : 'Forgot your password?'}
      subtitle={
        submitted
          ? undefined
          : 'Enter the email you signed up with and we’ll send you a link to choose a new one.'
      }
      footer={
        <Link href="/auth/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <div className="space-y-5">
          <Alert tone="success">
            If an account exists for <strong className="font-semibold">{email}</strong>, a reset link is on its
            way. It expires in 1 hour.
          </Alert>
          <p className="text-sm text-ink-muted">
            Nothing yet? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              try a different email
            </button>
            .
          </p>
          <ButtonLink href="/auth/login" variant="secondary" size="lg" className="w-full">
            Back to sign in
          </ButtonLink>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && <Alert tone="error">{error}</Alert>}

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

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {loading ? 'Sending' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
