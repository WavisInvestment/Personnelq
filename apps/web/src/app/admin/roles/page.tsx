'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/admin/toolbar';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import type { PermissionRow, RoleRow, RoleScope, RolesResponse } from '@/lib/admin';

function Matrix({
  title,
  description,
  roles,
  permissions,
}: {
  title: string;
  description: string;
  roles: RoleRow[];
  permissions: PermissionRow[];
}) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-2xl font-medium">{title}</h2>
      <p className="mt-1 text-[15px] text-ink-muted">{description}</p>

      <div className="mt-4 overflow-hidden border-t border-line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/60">
                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.id} scope="col" className="px-4 py-3 text-center align-bottom">
                    <span className="block text-sm font-semibold normal-case tracking-normal text-ink">{role.name}</span>
                    <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-ink-muted">
                      {role.user_count} {role.user_count === 1 ? 'person' : 'people'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {permissions.map((permission) => (
                <tr key={permission.key} className="hover:bg-paper/50">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <code className="text-xs text-ink">{permission.key}</code>
                    {permission.description && <p className="mt-0.5 text-xs text-ink-muted">{permission.description}</p>}
                  </th>
                  {roles.map((role) => {
                    const granted = role.permissions.includes(permission.key);
                    return (
                      <td key={role.id} className="px-4 py-3 text-center">
                        {granted ? (
                          <>
                            <svg viewBox="0 0 20 20" className="mx-auto h-5 w-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                            </svg>
                            <span className="sr-only">Granted</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-line-strong">
                              –
                            </span>
                            <span className="sr-only">Not granted</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function RolesPage() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    apiClient
      .get('/admin/roles')
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load roles.')));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Company roles also hold the personal baseline, so those permissions appear in their matrix too.
  const section = (scope: RoleScope) => ({
    roles: (data?.roles.filter((r) => r.scope === scope) ?? []).sort(
      (a, b) => b.permissions.length - a.permissions.length || a.name.localeCompare(b.name),
    ),
    permissions:
      data?.permissions.filter((p) => p.scope === scope || (scope === 'organization' && p.scope === 'account')) ?? [],
  });

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role is allowed to do. Permissions belong to roles, and people get them through their role."
      />

      {error && (
        <div className="space-y-4">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {!data && !error && <div className="h-72 animate-pulse rounded-xl bg-paper-soft" aria-hidden="true" />}

      {data && (
        <>
          <Matrix
            title="Personal role"
            description="Held by every account the moment it’s created. It’s the baseline for using the product for yourself."
            {...section('account')}
          />
          <Matrix
            title="Platform roles"
            description="For the people who run the product. Assigned directly to a person, on top of their personal role."
            {...section('platform')}
          />
          <Matrix
            title="Company roles"
            description="A person’s standing inside one company. The same person can hold a different role in each company."
            {...section('organization')}
          />
        </>
      )}
    </>
  );
}
