'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { TraitBreakdown } from '@/components/assessments/trait-breakdown';
import { TraitRadar } from '@/components/trait-radar';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { useAskReason, useConfirm } from '@/components/ui/confirm';
import { formatDate, radarValues, readApiProblem } from '@/lib/assessments';
import { getMemberDetail, getMemberResult, reactivateMember, suspendMember, termsFor, type CompanyRole, type MemberDetail, type MemberResult } from '@/lib/company';
import { allowRetake } from '@/lib/retakes';

const pill = 'inline-flex items-center rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line-strong';

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="py-6 sm:py-8 border-t border-line">
      <h2 id={id} className="font-display text-2xl font-medium">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MemberFlow({ userId }: { userId: string }) {
  const user = useSessionUser();
  const org = user.organizations?.find((o) => o.role === 'admin' || o.role === 'hr');
  const terms = termsFor(org?.type);
  const confirm = useConfirm();
  const askReason = useAskReason();
  const [data, setData] = useState<MemberDetail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<MemberResult | null>(null);
  const [resultError, setResultError] = useState('');

  const load = useCallback(() => {
    if (!org) return;
    getMemberDetail(org.id, userId)
      .then(setData)
      .catch((err) => {
        const p = readApiProblem(err);
        setError(p.status === 404 ? 'That person isn’t part of this company.' : p.status === 403 ? 'You don’t have access to this.' : p.message);
      });
  }, [org, userId]);
  useEffect(load, [load]);

  if (!org || error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone={error ? 'error' : 'info'}>{error || 'This page is for company administrators and HR.'}</Alert>
        <ButtonLink href="/company?tab=people" variant="secondary">
          Back to people
        </ButtonLink>
      </div>
    );
  }
  if (!data) return <div className="h-[28rem] animate-pulse border-t border-line" aria-hidden="true" />;

  const { person, can } = data;
  const first = person.name.split(' ')[0];

  const run = async (key: string, task: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNote('');
    setError('');
    try {
      await task();
      setNote(done);
      load();
    } catch (err) {
      setNote('');
      setResultError('');
      setError(readApiProblem(err).message);
    } finally {
      setBusy(null);
    }
  };

  const pause = async () => {
    const reason = await askReason({
      title: `Pause ${first}'s access?`,
      message: `${first} leaves the team: they can’t take assessments through the ${terms.org}, their results are hidden from it, and a seat frees up. Nothing is deleted, and you can restore them later.`,
      reasonLabel: 'A note for your own records',
      optional: true,
      confirmLabel: 'Pause access',
      tone: 'danger',
    });
    if (reason !== null) await run('pause', () => suspendMember(org.id, userId, reason), `${person.name}'s access is paused.`);
  };
  const restore = async () => {
    if (await confirm({ title: `Restore ${first}?`, message: 'They rejoin the team and can take assessments through the company again. A seat is used.', confirmLabel: 'Restore access' })) {
      await run('restore', () => reactivateMember(org.id, userId), `${person.name} is back in the team.`);
    }
  };
  const showResult = async () => {
    setBusy('result');
    setResultError('');
    try {
      setResult(await getMemberResult(org.id, userId));
    } catch (err) {
      const p = readApiProblem(err);
      setResultError(p.status === 404 ? 'There’s no company result for this person yet.' : p.message);
    } finally {
      setBusy(null);
    }
  };

  const traits = result?.result.traits.map((t) => ({ ...t })) ?? [];
  const hasResult = data.assessments.some((a) => a.result_id);

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <Link href="/company?tab=people" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          Back to people
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-medium leading-tight">{person.name}</h1>
          <span className={pill}>{terms.roles[person.role as CompanyRole] ?? person.role_name}</span>
          {person.status === 'suspended' && <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">Access paused</span>}
        </div>
        <p className="mt-2 text-[15px] text-ink-muted">{[person.job_title, person.department].filter(Boolean).join(' · ') || person.email}</p>
      </div>

      {person.status === 'suspended' && (
        <Alert tone="error">
          {first}’s access is paused{person.suspended_reason ? ` (${person.suspended_reason})` : ''}. They are out of the team and can’t take assessments through the {terms.org}.
        </Alert>
      )}
      {note && <Alert tone="success">{note}</Alert>}

      {(can.suspend || can.reactivate) && (
        <Section id="actions" title="Actions">
          <div className="flex flex-wrap gap-3">
            {can.suspend && (
              <Button variant="secondary" size="sm" className="border-accent-400 text-accent-600 hover:bg-accent-100" loading={busy === 'pause'} onClick={pause}>
                Pause access
              </Button>
            )}
            {can.reactivate && (
              <Button size="sm" loading={busy === 'restore'} onClick={restore}>
                Restore access
              </Button>
            )}
          </div>
        </Section>
      )}

      <Section id="about" title="About">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Email', person.email],
            ['Role', terms.roles[person.role as CompanyRole] ?? person.role_name],
            [terms.unit, person.department],
            ['Job title', person.job_title],
            ['Joined', formatDate(person.joined_at)],
            ['Shares results with the ' + terms.org, person.shares_results ? 'Yes, they agreed when they accepted' : 'No'],
            ['Invited by', data.invitation ? `${data.invitation.invited_by}, ${formatDate(data.invitation.sent_at)}` : '—'],
            ['Accepted', data.invitation?.accepted_at ? formatDate(data.invitation.accepted_at) : '—'],
          ].map(([name, value]) => (
            <div key={name as string}>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{name}</dt>
              <dd className="mt-1 break-words text-[15px]">{(value as string) || '—'}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="assessments" title="Assessments taken through the company" hint="Most recent first.">
        {data.assessments.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing started yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="px-2 py-2 font-medium">Assessment</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Started</th>
                  <th className="px-2 py-2 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.assessments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-2 py-2.5">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-ink-muted">Attempt {a.attempt}</p>
                    </td>
                    <td className="px-2 py-2.5">{a.status === 'completed' ? 'Finished' : a.status === 'in_progress' ? `In progress, ${a.progress_percent}%` : a.status}</td>
                    <td className="px-2 py-2.5">{formatDate(a.started_at)}</td>
                    <td className="px-2 py-2.5">{a.completed_at ? formatDate(a.completed_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {can.view_result && hasResult && !result && (
          <div className="mt-5 border-t border-line pt-5">
            <Button variant="secondary" size="sm" loading={busy === 'result'} onClick={showResult}>
              Show {first}’s result
            </Button>
            <p className="mt-2 text-xs text-ink-muted">{first} accepted that your {terms.org} sees results taken through it.</p>
            {resultError && <Alert tone="error" className="mt-3">{resultError}</Alert>}
          </div>
        )}
      </Section>

      {result && (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section className="py-6 sm:py-8 border-t border-line">
            <h2 className="font-display text-2xl font-medium">Profile</h2>
            <div className="mx-auto mt-2 max-w-[340px]">
              <TraitRadar values={radarValues(traits)} />
            </div>
            <p className="mt-2 text-center text-sm text-ink-muted">
              {result.result.assessment}, finished {formatDate(result.result.completed_at)}. Scores run from 0 to 100; there is no good or bad score.
            </p>
          </section>
          <section>
            <TraitBreakdown traits={traits} />
          </section>
        </div>
      )}

      <Section id="retakes" title="Retakes" hint="Repeating a finished assessment through the company needs your approval.">
        {data.retakes.length === 0 ? (
          <p className="text-sm text-ink-muted">No retake requests or approvals.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.retakes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  {r.assessment} · {r.requested_by === 'hr' ? 'allowed by you' : 'asked by ' + first}, {formatDate(r.requested_at)}
                </span>
                <span className={pill}>{r.status === 'requested' ? 'Waiting' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
              </li>
            ))}
          </ul>
        )}
        {person.status === 'active' && hasResult && (
          <Button className="mt-4" variant="secondary" size="sm" loading={busy === 'allow'} onClick={() => run('allow', () => allowRetake(org.id, userId), `A retake is approved for ${person.name}, and they have been emailed.`)}>
            Allow a retake
          </Button>
        )}
      </Section>

      <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
        Results are a self-reported snapshot of personality tendencies. They are not a clinical or hiring assessment and shouldn’t be the sole basis for decisions about a person.
      </p>
    </div>
  );
}

export default function MemberPage() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <AppShell>
      <MemberFlow userId={userId} />
    </AppShell>
  );
}
