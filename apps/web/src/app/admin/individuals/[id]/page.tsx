'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAskReason, useConfirm } from '@/components/ui/confirm';
import { getStoredUser } from '@/lib/auth';
import { BackLink, DetailState, Facts, MiniTable, Panel, StaffHistory, Stat, useAdminRecord, useStaffAction } from '@/components/admin/detail';
import { Pill, StatusBadge } from '@/components/admin/status-badge';
import { formatDate, formatDateTime, formatMoney, humanize, reactivatePerson, refundPayment, sendPersonReset, suspendPerson, unlockPerson, type AdminUserDetail } from '@/lib/admin';

export default function IndividualDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: u, error, reload } = useAdminRecord<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);
  const back = { href: '/admin/individuals', label: 'Individuals' };
  const askReason = useAskReason();
  const confirm = useConfirm();
  const act = useStaffAction(reload);
  // The server decides who may do what; this only avoids showing buttons that would be refused.
  const full = getStoredUser()?.platform_role === 'super_admin';

  if (!u) return <DetailState error={error} onRetry={reload} back={back} />;

  const finished = u.assessments.filter((a) => a.status === 'completed').length;
  const locked = u.locked_until && new Date(u.locked_until) > new Date();

  const suspend = async () => {
    const reason = await askReason({
      title: `Suspend ${u.first_name}?`,
      message: 'They are signed out everywhere and cannot sign in until you restore the account. Their results and company memberships are kept.',
      reasonLabel: 'Why are you suspending this account?',
      confirmLabel: 'Suspend account',
      tone: 'danger',
    });
    if (reason) await act.run('suspend', () => suspendPerson(u.id, reason), 'Account suspended.');
  };
  const reactivate = async () => {
    if (await confirm({ title: `Restore ${u.first_name}'s account?`, message: 'They can sign in again straight away.', confirmLabel: 'Restore account' })) await act.run('reactivate', () => reactivatePerson(u.id), 'Account restored.');
  };
  const refund = async (id: string, label: string) => {
    const reason = await askReason({
      title: 'Refund this payment?',
      message: `${label} is returned in full through Paystack, usually within a few working days, and the payer is emailed. A refunded assessment no longer counts as paid.`,
      reasonLabel: 'Why are you refunding it?',
      confirmLabel: 'Refund payment',
      tone: 'danger',
    });
    if (reason) await act.run(`refund-${id}`, () => refundPayment(id, reason), 'Refund requested. The payment now shows as refunded.');
  };

  return (
    <div className="space-y-6">
      <div>
        <BackLink href={back.href}>{back.label}</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-medium leading-tight sm:text-4xl">
            {u.first_name} {u.last_name}
          </h1>
          <StatusBadge status={u.email_verified ? 'verified' : 'pending'} />
          {locked && <StatusBadge status="locked" />}
          {u.platform_role_name && <Pill>Platform staff · {u.platform_role_name}</Pill>}
          {u.deleted && <Pill>Deleted account</Pill>}
        </div>
        <p className="mt-1.5 text-[15px] text-ink-muted">{u.deleted ? 'This account was deleted by its owner; only an anonymised record and payment history remain.' : u.email}</p>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Joined" value={formatDate(u.created_at)} />
        <Stat label="Last signed in" value={u.sign_in.last_signed_in ? formatDate(u.sign_in.last_signed_in) : '—'} hint={`${u.sign_in.active_sessions} signed-in ${u.sign_in.active_sessions === 1 ? 'device' : 'devices'}`} />
        <Stat label="Assessments" value={u.assessments.length} hint={`${finished} finished`} />
        <Stat label="Companies" value={u.companies.length} />
      </dl>

      <Alert tone="info">
        Support can see <strong className="font-medium text-ink">that</strong> someone took an assessment, not <strong className="font-medium text-ink">what it said</strong>. Scores, answers, written insights and badge links stay private to the person (and to a company only for results taken through it).
      </Alert>

      {u.suspended && (
        <Alert tone="error">
          <span className="font-medium">This account is suspended</span>
          {u.suspended_reason ? `: ${u.suspended_reason}` : '.'} {u.suspended_at ? `Since ${formatDate(u.suspended_at)}.` : ''}
        </Alert>
      )}

      {full && !u.deleted && !u.platform_role && (
        <Panel id="actions" title="Actions" hint="Each one is recorded with your name and the reason.">
          {act.error && <Alert tone="error" className="mb-4">{act.error}</Alert>}
          {act.done && <Alert tone="success" className="mb-4">{act.done}</Alert>}
          <div className="flex flex-wrap gap-3">
            {locked || u.failed_login_attempts > 0 ? (
              <Button variant="secondary" size="sm" loading={act.busy === 'unlock'} onClick={() => act.run('unlock', () => unlockPerson(u.id), 'The sign-in lock is cleared.')}>
                Unlock sign-in
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" loading={act.busy === 'reset'} onClick={() => act.run('reset', () => sendPersonReset(u.id), 'A password reset email is on its way.')}>
              Send password reset email
            </Button>
            {u.suspended ? (
              <Button size="sm" loading={act.busy === 'reactivate'} onClick={reactivate}>
                Restore account
              </Button>
            ) : (
              <Button variant="secondary" size="sm" className="border-accent-400 text-accent-600 hover:bg-accent-100" loading={act.busy === 'suspend'} onClick={suspend}>
                Suspend account
              </Button>
            )}
          </div>
        </Panel>
      )}

      <Panel id="account" title="Account">
        <Facts
          items={[
            { label: 'Email', value: u.email },
            { label: 'Email confirmed', value: u.email_verified ? `Yes, ${formatDate(u.email_verified_at)}` : 'Not yet' },
            { label: 'Account type', value: u.account_role ? humanize(u.account_role) : '—' },
            { label: 'Failed sign-in attempts', value: u.failed_login_attempts },
            { label: 'Locked until', value: locked ? formatDateTime(u.locked_until!) : 'Not locked' },
            { label: 'Person id', value: <span className="font-mono text-xs">{u.id}</span> },
          ]}
        />
      </Panel>

      <Panel id="companies" title="Companies" hint="Where they belong, and whether they agreed to share results taken through it.">
        <MiniTable
          rows={u.companies}
          getKey={(c) => c.id}
          empty="Not part of any company: this is an individual account."
          columns={[
            { header: 'Company', cell: (c) => <Link href={`/admin/companies/${c.id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">{c.name}</Link> },
            { header: 'Role', cell: (c) => <Pill>{c.role_name}</Pill> },
            { header: 'Department', cell: (c) => c.department ?? '—' },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            { header: 'Shares results', cell: (c) => (c.shares_results ? 'Yes' : 'No') },
            { header: 'Joined', cell: (c) => formatDate(c.joined_at) },
          ]}
        />
      </Panel>

      <Panel id="assessments" title="Assessments" hint="Most recent first (up to 100).">
        <MiniTable
          rows={u.assessments}
          getKey={(a) => a.id}
          empty="Nothing started yet."
          columns={[
            { header: 'Assessment', cell: (a) => <><p className="font-medium">{a.name}</p><p className="text-xs text-ink-muted">Version {a.version}, attempt {a.attempt}</p></> },
            { header: 'Status', cell: (a) => <><StatusBadge status={a.status} />{a.status === 'in_progress' && <span className="ml-2 text-xs text-ink-muted">{a.progress_percent}%</span>}</> },
            { header: 'Taken for', cell: (a) => (a.company ? <Link href={`/admin/companies/${a.company.id}`} className="underline-offset-4 hover:underline">{a.company.name}</Link> : <span className="text-ink-muted">Themselves</span>) },
            { header: 'Started', cell: (a) => formatDateTime(a.started_at) },
            { header: 'Finished', cell: (a) => (a.completed_at ? formatDateTime(a.completed_at) : '—') },
          ]}
        />
      </Panel>

      <Panel id="payments" title="Payments" hint="What they paid for, themselves or for a company.">
        <MiniTable
          rows={u.payments}
          getKey={(p) => p.id}
          empty="No payments."
          columns={[
            { header: 'For', cell: (p) => <><p>{p.description ?? humanize(p.payment_type)}</p><p className="font-mono text-xs text-ink-muted">{p.provider_reference}</p></> },
            { header: 'Amount', cell: (p) => <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span> },
            { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            { header: 'Company', cell: (p) => (p.organization ? <Link href={`/admin/companies/${p.organization.id}`} className="underline-offset-4 hover:underline">{p.organization.name}</Link> : '—') },
            { header: 'Date', cell: (p) => formatDateTime(p.created_at) },
            ...(full
              ? [{ header: '', cell: (p: AdminUserDetail['payments'][number]) => p.status === 'success' ? <Button variant="ghost" size="sm" loading={act.busy === `refund-${p.id}`} onClick={() => refund(p.id, formatMoney(p.amount, p.currency))}>Refund</Button> : null }]
              : []),
          ]}
        />
      </Panel>

      <Panel id="badge" title="Shareable badge" hint="Whether a public link exists, and how often it was opened. The link itself is private to the person.">
        <MiniTable
          rows={u.badges}
          getKey={(b) => `${b.published_at}-${b.view_count}`}
          empty="No badge created."
          columns={[
            { header: 'Public', cell: (b) => <StatusBadge status={b.is_public ? 'active' : 'inactive'} /> },
            { header: 'Published', cell: (b) => formatDate(b.published_at) },
            { header: 'Expires', cell: (b) => (b.expires_at ? formatDate(b.expires_at) : 'Never') },
            { header: 'Views', cell: (b) => <span className="tabular-nums">{b.view_count}</span> },
            { header: 'Last viewed', cell: (b) => (b.last_viewed_at ? formatDateTime(b.last_viewed_at) : '—') },
          ]}
        />
      </Panel>

      <StaffHistory rows={u.staff_actions} />
    </div>
  );
}
