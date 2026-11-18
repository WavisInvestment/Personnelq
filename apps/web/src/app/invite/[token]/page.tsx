'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { getStoredUser, refreshOrganizations } from '@/lib/auth';
import { acceptInvitation, getInvitationInfo, termsFor, type CompanyRole, type InvitationInfo } from '@/lib/company';

const DEAD: Record<string, string> = {
  expired: 'This invitation has expired. Ask the company to send you a new one.',
  revoked: 'This invitation was cancelled.',
  accepted: 'This invitation has already been used.',
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSignedInAs(getStoredUser()?.email ?? null);
    let cancelled = false;
    getInvitationInfo(token)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [token]);


  const accept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await acceptInvitation(token);
      await refreshOrganizations().catch(() => undefined);
      router.push(res.next.href);
    } catch (err) {
      const p = readApiProblem(err);
      setError(p.code === 'INVITATION_EMAIL_MISMATCH' ? `${p.message} You are signed in as ${signedInAs}.` : p.message);
      setAccepting(false);
    }
  };

  const signOutAndSwitch = () => {
    ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
    router.push(`/auth/login?invite=${token}`);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8">
          <Logo href="/" />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        {!info && !missing && <div className="h-80 animate-pulse border-t border-line" aria-hidden="true" />}

        {missing && (
          <div className="py-10 text-center border-t border-line">
            <h1 className="font-display text-3xl font-medium">This invitation isn’t valid</h1>
            <p className="mx-auto mt-3 max-w-sm text-[15px] text-ink-muted">The link may be mistyped or incomplete. Ask the person who invited you to send it again.</p>
            <ButtonLink href="/" variant="secondary" className="mt-6">
              Go to Personnelq
            </ButtonLink>
          </div>
        )}

        {info && (
          <div className="animate-fade-up py-6 sm:py-10 border-t border-line">
            <p className="text-sm font-medium text-brand-700">Invitation</p>
            <h1 className="mt-2 font-display text-3xl font-medium leading-tight">
              {info.inviter_name} invited you to join {info.organization_name}
            </h1>
            <p className="mt-3 text-[15px] text-ink-soft">
              To take the full personality assessment{info.job_title || info.department ? ` as ${[info.job_title, info.department].filter(Boolean).join(', ')}` : ''}. It was sent to <strong className="font-semibold text-ink">{info.email}</strong>, and you’ll join as <strong className="font-semibold text-ink">{(termsFor(info.organization_type).roles[info.role.key as CompanyRole] ?? info.role.name).toLowerCase()}</strong>.
            </p>

            {info.status !== 'pending' ? (
              <Alert tone="info" className="mt-6">{DEAD[info.status]}</Alert>
            ) : (
              <>
                <div className="mt-6 rounded-2xl bg-paper-soft p-5">
                  <h2 className="text-[15px] font-semibold">What {info.organization_name} will see</h2>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-soft marker:text-brand-500">
                    <li>Your name, email and the results you take through this invitation.</li>
                    <li>Your own results, badges and anything you take privately stay private to you.</li>
                    <li>Your company pays for this attempt, so you don’t need to.</li>
                    {signedInAs ? (
                      <li>You can leave at any time from your dashboard, and the company stops seeing your results.</li>
                    ) : (
                      <li>An account created from this invitation stays with {info.organization_name}, so it can’t leave. It also can’t be deleted or change its email address while you are part of it. If you’d rather keep control, sign in with an account you already have instead: you can leave a company, delete your account or change its email whenever you like.</li>
                    )}
                  </ul>
                </div>

                {error && <Alert tone="error" className="mt-5">{error}</Alert>}

                {signedInAs ? (
                  <div className="mt-6 space-y-3">
                    <Button size="lg" className="w-full" onClick={accept} loading={accepting}>
                      Accept and continue
                    </Button>
                    <p className="text-center text-sm text-ink-muted">
                      Signed in as {signedInAs}.{' '}
                      <button type="button" onClick={signOutAndSwitch} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                        Use a different account
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    <ButtonLink href={`/auth/signup?invite=${token}`} size="lg" className="w-full">
                      Create an account to accept
                    </ButtonLink>
                    <p className="text-center text-sm text-ink-muted">
                      Already have one?{' '}
                      <Link href={`/auth/login?invite=${token}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                        Sign in
                      </Link>
                    </p>
                    <p className="text-center text-xs text-ink-muted">You’ll use {info.email}. It’s set by the invitation and can’t be changed.</p>
                  </div>
                )}
                <p className="mt-6 text-center text-xs text-ink-muted">Expires {formatDate(info.expires_at)}.</p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
