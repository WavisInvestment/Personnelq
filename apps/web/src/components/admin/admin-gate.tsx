'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/logo';
import { AdminShell, type AdminProfile } from '@/components/admin/admin-shell';
import { apiClient } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/auth/login');
      return;
    }

    // Confirm the role with the server rather than trusting what's cached in the browser.
    apiClient
      .getProfile()
      .then(({ data }) => {
        if (!data.platform_role) {
          router.replace('/dashboard');
          return;
        }
        setAdmin(data);
      })
      .catch(() => router.replace('/auth/login'));
  }, [router]);

  if (!admin) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <LogoMark className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-ink-muted">Checking access…</p>
      </div>
    );
  }

  return <AdminShell user={admin}>{children}</AdminShell>;
}
