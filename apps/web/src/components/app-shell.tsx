'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo, LogoMark } from '@/components/logo';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { getAccount, resendVerification } from '@/lib/account';
import { emailRecentlyConfirmed, getStoredUser, isCompanyStaff, isPersonalPath, noteEmailConfirmed, peekSessionUser, refreshOrganizations, rememberSessionUser, type SessionUser } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { termsFor } from '@/lib/company';
import { logout } from '@/lib/logout';

const SessionContext = React.createContext<SessionUser | null>(null);

/** The signed-in person. Only available inside <AppShell>, which guarantees there is one. */
export function useSessionUser() {
  const user = React.useContext(SessionContext);
  if (!user) throw new Error('useSessionUser must be used inside <AppShell>');
  return user;
}

const baseLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/results', label: 'My results' },
  { href: '/payments', label: 'Payments' },
];

/** Asks people to confirm their email address. It reads the live state, so confirming in another tab clears it. */
function VerifyBanner() {
  const [pending, setPending] = React.useState<string | null>(null);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  React.useEffect(() => {
    // Already confirmed a moment ago on another page: nothing to ask.
    if (emailRecentlyConfirmed()) return;
    let cancelled = false;
    getAccount()
      .then((a) => {
        if (a.email_verified && !a.pending_email) noteEmailConfirmed();
        if (!cancelled) setPending(a.email_verified ? null : (a.pending_email ?? a.email));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;
  const send = async () => {
    setState('sending');
    try {
      const r = await resendVerification();
      setState(r.email_status === 'sent' || r.already_verified ? 'sent' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8">
      <Alert tone="info">
        <span className="font-medium text-ink">Confirm your email address.</span> We sent a link to {pending}. Until you confirm it you can take the snapshot and the assessment, but you can’t pay, invite people or join a company.{' '}
        {state === 'sent' ? (
          <span className="font-medium text-brand-700">A new link is on its way.</span>
        ) : state === 'failed' ? (
          <span className="font-medium text-accent-600">We couldn’t send it right now. Please try again later.</span>
        ) : (
          <button type="button" onClick={send} disabled={state === 'sending'} className="font-medium text-brand-700 underline-offset-4 hover:underline disabled:opacity-60">
            {state === 'sending' ? 'Sending…' : 'Send it again'}
          </button>
        )}
      </Alert>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // On a click from another page the person is already known, so the page shows at once instead of flashing "Loading…".
  const [user, setUser] = React.useState<SessionUser | null>(() => peekSessionUser());
  const [signingOut, setSigningOut] = React.useState(false);

  React.useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/auth/login');
      return;
    }
    // Platform staff run the platform; they do not use it. Everything outside the admin console is closed to them.
    if (stored.platform_role) {
      router.replace('/admin');
      return;
    }
    setUser(stored);
    rememberSessionUser(stored);
    // Joining or leaving a company happens outside this tab; pick up the current list, but not on every click.
    refreshOrganizations(30_000).then((fresh) => fresh && setUser(fresh)).catch(() => undefined);
  }, [router]);

  const companyStaff = isCompanyStaff(user);
  const onPersonalPage = companyStaff && isPersonalPath(pathname);
  React.useEffect(() => {
    if (onPersonalPage) router.replace('/company');
  }, [onPersonalPage, router]);

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    router.replace('/');
  };

  if (!user || onPersonalPage) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <LogoMark className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  // Company administrators and HR get the team dashboard.
  const runs = user.organizations?.find((o) => o.role === 'admin' || o.role === 'hr');
  // Company leaders get their company (and the payments page for the plan); everyone else gets the personal pages.
  const links = runs ? [{ href: '/company', label: termsFor(runs.type).nav }, { href: '/payments', label: 'Payments' }] : baseLinks;
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  return (
    <SessionContext.Provider value={user}>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Logo href={runs ? '/company' : '/dashboard'} />
            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              {links.map((link) => {
                const active = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[15px] font-medium transition-colors',
                      active ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-paper-soft hover:text-ink',
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 sm:flex"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="hidden text-sm font-medium text-ink lg:inline">
              {user.first_name} {user.last_name}
            </span>
            <ButtonLink href="/account" variant="ghost" size="sm">
              Account
            </ButtonLink>
            <Button variant="secondary" size="sm" onClick={handleLogout} loading={signingOut}>
              Sign out
            </Button>
          </div>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto whitespace-nowrap border-t border-line/60 px-5 py-1.5 sm:hidden">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium',
                  active ? 'bg-brand-50 text-brand-800' : 'text-ink-soft',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <VerifyBanner />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-6 text-[13px] text-ink-muted sm:px-8">
          <p>&copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span> Personnelq</p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms of use
            </Link>
          </nav>
        </div>
      </footer>
    </SessionContext.Provider>
  );
}
