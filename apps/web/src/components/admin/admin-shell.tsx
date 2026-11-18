'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Buildings, CreditCard, CurrencyCircleDollar, ListBullets, ShieldCheck, SquaresFour, User } from '@phosphor-icons/react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/logout';
import { cn } from '@/lib/cn';

export interface AdminProfile {
  first_name: string;
  last_name: string;
  email: string;
  platform_role: string;
  platform_role_name: string | null;
  permissions: string[];
}

const nav = [
  {
    href: '/admin',
    label: 'Overview',
    permission: 'view:platform_overview',
  },
  {
    href: '/admin/companies',
    label: 'Companies',
    permission: 'view:all_organizations',
  },
  {
    href: '/admin/individuals',
    label: 'Individuals',
    permission: 'view:all_users',
  },
  {
    href: '/admin/subscriptions',
    label: 'Subscriptions',
    permission: 'view:subscriptions',
  },
  {
    href: '/admin/payments',
    label: 'Payments',
    permission: 'view:payments',
  },
  {
    href: '/admin/audit-log',
    label: 'Audit log',
    permission: 'view:audit_logs',
  },
  {
    href: '/admin/roles',
    label: 'Roles & permissions',
    permission: 'view:roles',
  },
];

const NAV_ICONS = {
  '/admin': SquaresFour,
  '/admin/companies': Buildings,
  '/admin/individuals': User,
  '/admin/subscriptions': CreditCard,
  '/admin/payments': CurrencyCircleDollar,
  '/admin/audit-log': ListBullets,
  '/admin/roles': ShieldCheck,
} as const;

function NavIcon({ href }: { href: string }) {
  const Icon = NAV_ICONS[href as keyof typeof NAV_ICONS] ?? SquaresFour;
  return <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />;
}

function NavLinks({
  pathname,
  orientation,
  permissions,
}: {
  pathname: string;
  orientation: 'vertical' | 'horizontal';
  permissions: string[];
}) {
  const visible = nav.filter((item) => permissions.includes(item.permission));

  return (
    <ul className={cn(orientation === 'vertical' ? 'space-y-1' : 'flex gap-1 overflow-x-auto px-5 pb-3 sm:px-8')}>
      {visible.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition-colors',
                active ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-paper-soft hover:text-ink',
              )}
            >
              <NavIcon href={item.href} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminShell({ user, children }: { user: AdminProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await logout();
    router.replace('/');
  };

  const roleLabel = user.platform_role_name ?? user.platform_role;
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-white p-5 lg:flex">
        <div className="flex items-center justify-between">
          <Logo href="/admin" />
        </div>
        <span className="mt-3 inline-flex w-fit rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-600">
          Admin console
        </span>

        <nav aria-label="Admin" className="mt-6 flex-1">
          <NavLinks pathname={pathname} orientation="vertical" permissions={user.permissions} />
        </nav>

        <div className="border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" aria-hidden="true">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-ink-muted">{roleLabel}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="ghost" size="sm" onClick={handleSignOut} loading={signingOut}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between px-5 sm:px-8">
            <Logo href="/admin" />
            <Button variant="secondary" size="sm" onClick={handleSignOut} loading={signingOut}>
              Sign out
            </Button>
          </div>
          <nav aria-label="Admin">
            <NavLinks pathname={pathname} orientation="horizontal" permissions={user.permissions} />
          </nav>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
