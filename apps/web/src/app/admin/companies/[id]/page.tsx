'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAskReason, useConfirm } from '@/components/ui/confirm';
import { getStoredUser } from '@/lib/auth';
import { BackLink, DetailState, Facts, MiniTable, Panel, StaffHistory, Stat, useAdminRecord, useStaffAction } from '@/components/admin/detail';
import { Pill, StatusBadge } from '@/components/admin/status-badge';
import { formatDate, formatDateTime, formatMoney, humanize, reactivateCompany, refundPayment, suspendCompany, type AdminOrganizationDetail } from '@/lib/admin';

const PROGRESS: Record<AdminOrganizationDetail['members'][number]['progress'], string> = { completed: 'completed', in_progress: 'in_progress', not_started: 'inactive' };

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error, reload } = useAdminRecord<AdminOrganizationDetail>(`/admin/organizations/${encodeURIComponent(id)}`);
  const back = { href: '/admin/companies', label: 'Companies' };
  const askReason = useAskReason();
  const confirm = useConfirm();
  const act = useStaffAction(reload);
  const full = getStoredUser()?.platform_role === 'super_admin';

  if (!o) return <DetailState error={error} onRetry={reload} back={back} />;

  const sub = o.subscription;
  const planLive = sub && sub.status === 'active' && new Date(sub.end_date) > new Date();
  const suspended = o.status === 'suspended';

  const suspend = async () => {
    const reason = await askReason({
      title: `Suspend ${o.name}?`,
      message: 'The company cannot invite people, resend or remind, or approve retakes, and its people cannot take assessments through it. Everyone keeps their own results. Its administrators see the reason.',
      reasonLabel: 'Why are you suspending this company?',
      confirmLabel: 'Suspend company',
      tone: 'danger',
    });
    if (reason) await act.run('suspend', () => suspendCompany(o.id, reason), 'Company suspended.');
  };
  const reactivate = async () => {
    if (await confirm({ title: `Restore ${o.name}?`, message: 'The company can invite people and cover assessments again straight away.', confirmLabel: 'Restore company' })) await act.run('reactivate', () => reactivateCompany(o.id), 'Company restored.');
  };
  const refund = async (id: string, label: string) => {
    const reason = await askReason({
      title: 'Refund this payment?',
      message: `${label} is returned in full through Paystack, usually within a few working days. If this payment is paying for the current plan period, the plan ends now.`,
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
          <h1 className="font-display text-3xl font-medium leading-tight sm:text-4xl">{o.name}</h1>
          <Pill>{humanize(o.type)}</Pill>
          <StatusBadge status={o.status} />
        </div>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          {o.slug} · created {formatDate(o.created_at)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="People" value={o.counts.active_members} hint={o.counts.inactive_members ? `${o.counts.inactive_members} left or removed` : undefined} />
        <Stat label="Seats" value={sub ? `${sub.seats_used} / ${sub.seats_limit}` : '—'} hint={sub ? undefined : 'No plan'} />
        <Stat label="Invitations waiting" value={o.invitations.pending} />
        <Stat label="Retakes" value={o.counts.retakes_waiting} hint={`waiting${o.counts.retakes_approved ? `, ${o.counts.retakes_approved} approved` : ''}`} />
      </dl>

      {suspended && (
        <Alert tone="error">
          <span className="font-medium">This company is suspended</span>
          {o.suspended_reason ? `: ${o.suspended_reason}` : '.'} {o.suspended_at ? `Since ${formatDate(o.suspended_at)}.` : ''}
        </Alert>
      )}

      {full && (
        <Panel id="actions" title="Actions" hint="Recorded with your name and the reason, and shown in the company's own audit trail.">
          {act.error && <Alert tone="error" className="mb-4">{act.error}</Alert>}
          {act.done && <Alert tone="success" className="mb-4">{act.done}</Alert>}
          {suspended ? (
            <Button size="sm" loading={act.busy === 'reactivate'} onClick={reactivate}>
              Restore company
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="border-accent-400 text-accent-600 hover:bg-accent-100" loading={act.busy === 'suspend'} onClick={suspend}>
              Suspend company
            </Button>
          )}
        </Panel>
      )}

      <Alert tone="info">
        People appear with whether they have finished, never with their scores.
      </Alert>

      <Panel id="contact" title="Contact and plan">
        <Facts
          items={[
            { label: 'Administrator', value: o.admin_name },
            { label: 'Email', value: o.admin_email },
            { label: 'Phone', value: o.admin_phone },
            { label: 'Plan', value: sub ? sub.plan_name : 'None' },
            { label: 'Plan status', value: sub ? <><StatusBadge status={planLive ? 'active' : sub.status === 'active' ? 'expired' : sub.status} />{sub.last_expiry_notice && <span className="ml-2 text-xs text-ink-muted">last notice: {sub.last_expiry_notice}</span>}</> : '—' },
            { label: 'Billing', value: sub ? `${formatMoney(sub.amount, sub.currency)} ${humanize(sub.billing_cycle).toLowerCase()}${sub.auto_renew ? ', renews automatically' : ', renewed by hand'}` : '—' },
            { label: 'Plan period', value: sub ? `${formatDate(sub.start_date)} to ${formatDate(sub.end_date)}` : '—' },
            { label: 'Company id', value: <span className="font-mono text-xs">{o.id}</span> },
          ]}
        />
      </Panel>

      <Panel id="people" title="People" hint="Whether each has finished, and whether they agreed to share results taken through the company.">
        <MiniTable
          rows={o.members}
          getKey={(m) => m.user_id}
          empty="No one has joined yet."
          columns={[
            { header: 'Person', cell: (m) => <><Link href={`/admin/individuals/${m.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">{m.name}</Link><p className="text-xs text-ink-muted">{m.email}</p></> },
            { header: 'Role', cell: (m) => <Pill>{m.role_name}</Pill> },
            { header: 'Department', cell: (m) => m.department ?? '—' },
            { header: 'Progress', cell: (m) => <StatusBadge status={PROGRESS[m.progress]} /> },
            { header: 'Shares results', cell: (m) => (m.shares_results ? 'Yes' : 'No') },
            { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
            { header: 'Joined', cell: (m) => formatDate(m.joined_at) },
          ]}
        />
      </Panel>

      <Panel id="invitations" title="Invitations">
        <p className="mb-3 text-sm text-ink-soft">
          {o.invitations.pending} waiting · {o.invitations.accepted} accepted · {o.invitations.expired} expired · {o.invitations.revoked} cancelled
        </p>
        <MiniTable
          rows={o.invitations.recent}
          getKey={(i) => i.id}
          empty="No invitations sent."
          columns={[
            { header: 'Sent to', cell: (i) => i.email },
            { header: 'Joins as', cell: (i) => <Pill>{humanize(i.role)}</Pill> },
            { header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
            { header: 'Sent', cell: (i) => formatDate(i.sent_at) },
            { header: 'Expires', cell: (i) => formatDate(i.expires_at) },
          ]}
        />
      </Panel>

      <Panel id="assessments" title="Company assessments" hint="Assessments this company wrote itself.">
        <MiniTable
          rows={o.assessments}
          getKey={(a) => a.id}
          empty="None created."
          columns={[
            { header: 'Name', cell: (a) => <><p className="font-medium">{a.name}</p><p className="text-xs text-ink-muted">Version {a.version}</p></> },
            { header: 'State', cell: (a) => <StatusBadge status={a.status === 'published' ? 'active' : 'pending'} /> },
            { header: 'Attempts', cell: (a) => <span className="tabular-nums">{a.attempts}</span> },
            { header: 'Created', cell: (a) => formatDate(a.created_at) },
          ]}
        />
      </Panel>

      <Panel id="payments" title="Payments">
        <MiniTable
          rows={o.payments}
          getKey={(p) => p.id}
          empty="No payments."
          columns={[
            { header: 'For', cell: (p) => <><p>{p.description ?? humanize(p.payment_type)}</p><p className="font-mono text-xs text-ink-muted">{p.provider_reference}</p></> },
            { header: 'Amount', cell: (p) => <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span> },
            { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            { header: 'Paid by', cell: (p) => p.paid_by ?? '—' },
            { header: 'Date', cell: (p) => formatDateTime(p.created_at) },
            ...(full
              ? [{ header: '', cell: (p: AdminOrganizationDetail['payments'][number]) => p.status === 'success' ? <Button variant="ghost" size="sm" loading={act.busy === `refund-${p.id}`} onClick={() => refund(p.id, formatMoney(p.amount, p.currency))}>Refund</Button> : null }]
              : []),
          ]}
        />
      </Panel>

      <Panel id="activity" title="Recent activity" hint="The company's audit trail, newest first.">
        <MiniTable
          rows={o.activity}
          getKey={(a) => a.id}
          empty="Nothing recorded yet."
          columns={[
            { header: 'What happened', cell: (a) => humanize(a.action) },
            { header: 'By', cell: (a) => a.by },
            { header: 'When', cell: (a) => formatDateTime(a.at) },
          ]}
        />
      </Panel>

      <StaffHistory rows={o.staff_actions} />
    </div>
  );
}
