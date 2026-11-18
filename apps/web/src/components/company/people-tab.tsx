'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { DepartmentSelect } from '@/components/company/department-select';
import { reactivateMember, removeMember, setMemberDepartment, setMemberRole, termsFor, type CompanyRole, type MemberStatus, type PausedMember, type StaffRow, type TeamMember } from '@/lib/company';
import { allowRetake, approveRetake, cancelRetake, declineRetake, type RetakeRow } from '@/lib/retakes';
import { ClassEmblem, type ClassKey } from '@/components/class-emblem';
import { TRAITS } from '@/lib/traits';

const STATUS: Record<MemberStatus, { label: string; style: string }> = {
  completed: { label: 'Finished', style: 'bg-brand-50 text-brand-700 ring-brand-200' },
  in_progress: { label: 'In progress', style: 'bg-accent-100 text-accent-600 ring-accent-400/40' },
  not_started: { label: 'Not started', style: 'bg-paper-soft text-ink-muted ring-line-strong' },
};

interface PeopleProps {
  organizationId: string;
  orgType: string;
  members: TeamMember[];
  paused: PausedMember[];
  staff: StaffRow[];
  retakes: RetakeRow[];
  isAdmin: boolean;
  meId: string;
  canRemove: boolean;
  onChanged: () => void;
  onInvite: () => void;
}

export function PeopleTab({ organizationId, orgType, members, paused, staff, retakes, isAdmin, meId, canRemove, onChanged, onInvite }: PeopleProps) {
  const terms = termsFor(orgType);
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const classesHere = Array.from(new Map(members.filter((m) => m.profile_class).map((m) => [m.profile_class!.key, m.profile_class!.name])));
  const shown = classFilter ? members.filter((m) => m.profile_class?.key === classFilter) : members;

  /** Runs one change, then reloads. Errors show above the list. */
  const run = async (key: string, task: () => Promise<unknown>, done?: string) => {
    setMoving(key);
    setError('');
    setNote('');
    try {
      await task();
      if (done) setNote(done);
      onChanged();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setMoving(null);
    }
  };

  const changeRole = async (userId: string, name: string, role: CompanyRole, from: CompanyRole) => {
    if (role === from) return;
    const ok = await confirm({
      title: `Make ${name} ${terms.roles[role]}?`,
      message:
        role === 'admin'
          ? `Administrators can invite and remove people, change roles, see every result and manage billing for the ${terms.org}.`
          : role === 'hr'
            ? `A ${terms.roles.hr.toLowerCase()} can invite people, see everyone’s results and approve retakes, but can’t manage billing or roles.`
            : `${name} will lose access to the team’s results and can only see their own.`,
      confirmLabel: 'Change role',
      tone: role === 'employee' ? 'danger' : 'default',
    });
    if (ok) await run(userId, () => setMemberRole(organizationId, userId, role), `${name} is now ${terms.roles[role]}.`);
  };

  const roleSelect = (userId: string, name: string, role: CompanyRole) => (
    <select
      aria-label={`Role for ${name}`}
      value={role}
      disabled={moving === userId}
      onChange={(e) => changeRole(userId, name, e.target.value as CompanyRole, role)}
      className="h-8 rounded-lg border border-line-strong bg-white px-2 text-sm"
    >
      {(['employee', 'hr', 'admin'] as const).map((r) => (
        <option key={r} value={r}>
          {terms.roles[r]}
        </option>
      ))}
    </select>
  );

  const otherStaff = staff.filter((p) => !members.some((m) => m.user_id === p.user_id));

  const move = async (m: TeamMember, department: string) => {
    setMoving(m.user_id);
    setError('');
    try {
      await setMemberDepartment(organizationId, m.user_id, department || null);
      onChanged();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setMoving(null);
    }
  };

  const remove = async (m: TeamMember) => {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      message: `They keep their own results, but the ${terms.org} will no longer see them, and a seat frees up.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoving(m.user_id);
    setError('');
    try {
      await removeMember(organizationId, m.user_id);
      onChanged();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setRemoving(null);
    }
  };

  const panels = (
    <>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {note && <Alert tone="success" className="mb-4">{note}</Alert>}
      {retakes.length > 0 && (
        <section aria-labelledby="retakes-heading" className="mb-6 py-6 border-t border-line">
          <h2 id="retakes-heading" className="font-display text-xl font-medium">
            Retakes
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Repeating a finished assessment through the {terms.org} needs your approval. An approval lasts two weeks and is used up when the person starts.</p>
          <ul className="mt-4 divide-y divide-line">
            {retakes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.person.name}</p>
                  <p className="text-xs text-ink-muted">
                    {r.assessment.name} ·{' '}
                    {r.status === 'requested' ? `asked ${formatDate(r.requested_at)}` : `approved, start by ${formatDate(r.expires_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {r.status === 'requested' ? (
                    <>
                      <Button size="sm" loading={moving === r.id} onClick={() => run(r.id, () => approveRetake(organizationId, r.id), `Approved. ${r.person.name} has been emailed.`)}>
                        Approve
                      </Button>
                      <button type="button" disabled={moving === r.id} onClick={() => run(r.id, () => declineRetake(organizationId, r.id), 'Request declined.')} className="text-ink-muted underline-offset-4 hover:text-accent-600 hover:underline disabled:opacity-50">
                        Decline
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={moving === r.id} onClick={() => run(r.id, () => cancelRetake(organizationId, r.id), 'Approval withdrawn.')} className="text-ink-muted underline-offset-4 hover:text-accent-600 hover:underline disabled:opacity-50">
                      Withdraw
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {paused.length > 0 && (
        <section aria-labelledby="paused-heading" className="mb-6 py-6 border-t border-line">
          <h2 id="paused-heading" className="font-display text-xl font-medium">
            Access paused
          </h2>
          <p className="mt-1 text-sm text-ink-muted">These people are out of the team: they can’t take assessments through the {terms.org} and their results are hidden from it. Nothing is deleted, and a seat is free.</p>
          <ul className="mt-4 divide-y divide-line">
            {paused.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                <div className="min-w-0">
                  <Link href={`/company/members/${p.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {p.email}
                    {p.reason ? ` · ${p.reason}` : ''} · since {formatDate(p.since)}
                  </p>
                </div>
                <Button size="sm" loading={moving === `restore-${p.user_id}`} onClick={() => run(`restore-${p.user_id}`, () => reactivateMember(organizationId, p.user_id), `${p.name} is back in the team.`)}>
                  Restore access
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isAdmin && otherStaff.length > 0 && (
        <section aria-labelledby="staff-heading" className="mb-6 py-6 border-t border-line">
          <h2 id="staff-heading" className="font-display text-xl font-medium">
            Administrators and HR
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {otherStaff.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.name}
                    {p.user_id === meId ? <span className="ml-2 text-xs font-normal text-ink-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-ink-muted">{p.email}</p>
                </div>
                {roleSelect(p.user_id, p.name, p.role)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  if (members.length === 0) {
    return (
      <div>
        {panels}
        <div className="border-dashed border-line-strong py-10 text-center border-t border-line">
          <p className="font-display text-2xl font-medium">{terms.empty}</p>
          <p className="mt-2 text-[15px] text-ink-muted">People appear here after they accept your invitation.</p>
          <Button className="mt-6" onClick={onInvite}>
            Invite people
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div>
      {panels}
      {classesHere.length > 0 && (
        <label className="mb-4 flex flex-wrap items-center gap-3 text-sm font-medium">
          Show
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="h-9 rounded-lg border border-line-strong bg-white px-2 text-sm font-normal">
            <option value="">Everyone</option>
            {classesHere.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          {classFilter && <span className="font-normal text-ink-muted">{shown.length} of {members.length}</span>}
        </label>
      )}
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="px-5 py-3 font-medium">Person</th>
              <th className="px-3 py-3 font-medium">{terms.unit}</th>
              {isAdmin && <th className="px-3 py-3 font-medium">Role</th>}
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">
                <span className="sr-only">Scores</span>
                <span className="flex gap-2.5" aria-hidden="true">
                  {TRAITS.map((t) => (
                    <span key={t.key} className="w-6 text-center" title={t.name}>
                      {t.letter}
                    </span>
                  ))}
                </span>
              </th>
              <th className="px-5 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.user_id} className="border-b border-line last:border-0">
                <td className="px-5 py-3">
                  <Link href={`/company/members/${m.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                    {m.name}
                  </Link>
                  <p className="text-xs text-ink-muted">{m.email}</p>
                  {m.profile_class && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                      <ClassEmblem name={m.profile_class.key as ClassKey} className="h-5 w-5 shrink-0" />
                      {m.profile_class.name}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-soft">
                  {canRemove ? (
                    <DepartmentSelect compact orgType={orgType} value={m.department} disabled={moving === m.user_id} ariaLabel={`${terms.unit} for ${m.name}`} onChange={(name) => move(m, name)} />
                  ) : (
                    (m.department ?? '–')
                  )}
                  {m.job_title ? <span className="mt-1 block text-xs text-ink-muted">{m.job_title}</span> : null}
                </td>
                {isAdmin && <td className="px-3 py-3">{roleSelect(m.user_id, m.name, m.role as CompanyRole)}</td>}
                <td className="px-3 py-3">
                  <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS[m.status].style)}>
                    {STATUS[m.status].label}
                    {m.status === 'in_progress' && m.progress_percent !== null ? ` ${m.progress_percent}%` : ''}
                  </span>
                  {m.result && <p className="mt-1 text-xs text-ink-muted">{formatDate(m.result.completed_at)}</p>}
                </td>
                <td className="px-3 py-3">
                  {m.result ? (
                    <span className="flex gap-2.5 tabular-nums">
                      {TRAITS.map((t) => (
                        <span key={t.key} className="w-6 text-center text-ink-soft" title={`${t.name}: ${Math.round(m.result!.scores[t.key])}`}>
                          {Math.round(m.result!.scores[t.key])}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-muted">–</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="inline-flex items-center gap-3">
                    {m.result && (
                      <Link href={`/company/members/${m.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                        View
                      </Link>
                    )}
                    {m.status === 'completed' && (
                      <button
                        type="button"
                        disabled={moving === `retake-${m.user_id}`}
                        onClick={() => run(`retake-${m.user_id}`, () => allowRetake(organizationId, m.user_id), `A retake is approved for ${m.name}, and they have been emailed.`)}
                        className="text-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Allow retake
                      </button>
                    )}
                    {canRemove && m.role !== 'admin' && (
                      <button type="button" onClick={() => remove(m)} disabled={removing === m.user_id} className="text-ink-muted underline-offset-4 hover:text-accent-600 hover:underline disabled:opacity-50">
                        Remove
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Scores are only the ones people took through your {terms.org}.</p>
    </div>
  );
}
