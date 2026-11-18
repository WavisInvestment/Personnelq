'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { DepartmentSelect } from '@/components/company/department-select';
import { resendInvitation, revokeInvitation, sendInvitations, termsFor, type CompanyRole, type InvitationRow, type InviteOutcome } from '@/lib/company';

const STATUS_STYLE: Record<InvitationRow['status'], string> = {
  pending: 'bg-accent-100 text-accent-600 ring-accent-400/40',
  accepted: 'bg-brand-50 text-brand-700 ring-brand-200',
  expired: 'bg-paper-soft text-ink-muted ring-line-strong',
  revoked: 'bg-paper-soft text-ink-muted ring-line-strong',
};
const STATUS_LABEL: Record<InvitationRow['status'], string> = { pending: 'Waiting', accepted: 'Accepted', expired: 'Expired', revoked: 'Cancelled' };

const parseEmails = (text: string) => [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function problemText(err: unknown) {
  const p = readApiProblem(err);
  if (p.code === 'SUBSCRIPTION_REQUIRED') return 'Your plan has ended. Renew it before inviting people.';
  return p.message;
}

export function InvitationsTab({ organizationId, orgType, invitations, isAdmin, onChanged }: { organizationId: string; orgType: string; invitations: InvitationRow[]; isAdmin: boolean; onChanged: () => void }) {
  const terms = termsFor(orgType);
  const [emails, setEmails] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<CompanyRole>('employee');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<InviteOutcome[] | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = parseEmails(emails);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setOutcome(null);
    try {
      const result = await sendInvitations(organizationId, { emails: list, department: department || null, job_title: jobTitle.trim() || null, role });
      setOutcome(result);
      if (result.some((r) => r.status === 'invited')) setEmails('');
      onChanged();
    } catch (err) {
      const p = readApiProblem(err);
      setError(p.status === 400 ? 'Check the email addresses. Each one needs to be valid, and you can send up to 50 at a time.' : problemText(err));
    } finally {
      setSending(false);
    }
  };

  const act = async (id: string, what: 'resend' | 'revoke') => {
    setBusyId(id);
    setNote('');
    setError('');
    try {
      if (what === 'resend') {
        const r = await resendInvitation(organizationId, id);
        setNote(r.email_status === 'sent' ? 'Invitation sent again.' : 'The link is renewed for two weeks. Email isn’t available, so copy the link and share it yourself.');
      } else {
        await revokeInvitation(organizationId, id);
        setNote('Invitation cancelled. Its link no longer works.');
      }
      onChanged();
    } catch (err) {
      setError(problemText(err));
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (link: string) => setNote((await copy(link)) ? 'Link copied.' : 'Copy didn’t work here. Select the link and copy it by hand.');

  return (
    <div className="space-y-8">
      <form onSubmit={send} className="py-6 sm:py-8 border-t border-line">
        <h2 className="font-display text-xl font-medium">Invite people</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Each person gets an email with a personal link. It only works for their own address and lasts two weeks. The invitation tells them that your {terms.org} will see the results they take through it.
        </p>

        <label className="mt-5 block text-sm font-medium">
          Email addresses
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={3}
            placeholder="ada@example.com, tunde@example.com"
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px] font-normal placeholder:text-ink-muted/70"
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">Separate with commas, spaces or new lines. {list.length > 0 ? `${list.length} address${list.length === 1 ? '' : 'es'}.` : ''}</span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DepartmentSelect orgType={orgType} value={department} onChange={setDepartment} label={`${terms.unit} (optional)`} />
          <label className="block text-sm font-medium">
            Job title (optional)
            <input value={jobTitle} maxLength={80} onChange={(e) => setJobTitle(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal" />
          </label>
        </div>

        {isAdmin && (
          <label className="mt-4 block max-w-xs text-sm font-medium">
            Joins as
            <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal">
              {(['employee', 'hr', 'admin'] as const).map((r) => (
                <option key={r} value={r}>
                  {terms.roles[r]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink-muted">
              {role === 'employee' ? 'Takes assessments. Sees only their own results.' : role === 'hr' ? 'Invites people and sees everyone’s results.' : `Everything a ${terms.roles.hr.toLowerCase()} can do, plus billing, roles and settings.`}
            </span>
          </label>
        )}

        {error && <Alert tone="error" className="mt-5">{error}</Alert>}

        <Button type="submit" className="mt-6" loading={sending} disabled={list.length === 0}>
          {list.length > 1 ? `Send ${list.length} invitations` : 'Send invitation'}
        </Button>

        {outcome && (
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line">
            {outcome.map((o) => (
              <li key={o.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{o.email}</span>
                <span className="flex items-center gap-3 text-ink-muted">
                  {o.status === 'already_member' && 'Already in the company'}
                  {o.status === 'already_invited' && 'Already has a waiting invitation'}
                  {o.status === 'invited' && o.email_status === 'sent' && 'Emailed'}
                  {o.status === 'invited' && o.email_status !== 'sent' && 'Not emailed. Share the link yourself'}
                  {o.link && (
                    <button type="button" className="font-medium text-brand-700 underline-offset-4 hover:underline" onClick={() => copyLink(o.link!)}>
                      Copy link
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      <section aria-labelledby="inv-heading">
        <h2 id="inv-heading" className="font-display text-xl font-medium">
          Sent invitations
        </h2>
        {note && <Alert tone="success" className="mt-4">{note}</Alert>}
        {invitations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nothing sent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden border-t border-line">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-xs text-ink-muted">
                    Sent {formatDate(i.sent_at)}
                    {i.status === 'pending' ? `, expires ${formatDate(i.expires_at)}` : ''}
                    {i.department ? ` · ${i.department}` : ''}
                    {i.role !== 'employee' ? ` · ${terms.roles[i.role]}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[i.status])}>{STATUS_LABEL[i.status]}</span>
                  {i.link && (
                    <button type="button" className="font-medium text-brand-700 underline-offset-4 hover:underline" onClick={() => copyLink(i.link!)}>
                      Copy link
                    </button>
                  )}
                  {(i.status === 'pending' || i.status === 'expired') && (
                    <button type="button" disabled={busyId === i.id} className="text-ink-soft underline-offset-4 hover:underline disabled:opacity-50" onClick={() => act(i.id, 'resend')}>
                      Resend
                    </button>
                  )}
                  {i.status === 'pending' && (
                    <button type="button" disabled={busyId === i.id} className="text-ink-muted underline-offset-4 hover:text-accent-600 hover:underline disabled:opacity-50" onClick={() => act(i.id, 'revoke')}>
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
