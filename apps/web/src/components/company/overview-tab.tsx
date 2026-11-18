'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { downloadCsv, downloadTeamPdf, sendReminders, termsFor, type DashboardData } from '@/lib/company';
import { TRAITS } from '@/lib/traits';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-l-2 border-line-strong py-1 pl-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-medium tabular-nums">{value}</dd>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function OverviewTab({ data, isAdmin, onInvite }: { data: DashboardData; isAdmin: boolean; onInvite: () => void }) {
  const [busy, setBusy] = useState<'csv' | 'pdf' | 'remind' | null>(null);
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { team, plan } = data;
  const terms = termsFor(data.organization.type);
  const unfinished = team.in_progress + team.not_started;
  const activity: Record<DashboardData['recent'][number]['type'], string> = {
    completed: 'finished the assessment',
    joined: terms.joined,
    invited: 'was invited',
  };

  const remind = async () => {
    const ok = await confirm({
      title: `Remind ${unfinished} ${unfinished === 1 ? 'person' : 'people'}?`,
      message: 'Everyone who hasn’t finished gets a short email with a link. Anyone reminded in the last 3 days is skipped.',
      confirmLabel: 'Send reminders',
    });
    if (!ok) return;
    setBusy('remind');
    setError('');
    setNotice('');
    try {
      const r = await sendReminders(data.organization.id);
      setNotice(
        r.sent > 0
          ? `Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.${r.skipped_recent ? ` ${r.skipped_recent} skipped because they were reminded recently.` : ''}`
          : r.skipped_recent > 0
            ? 'Everyone waiting was reminded in the last 3 days, so no new emails were sent.'
            : r.not_emailed > 0
              ? 'Email isn’t set up on this site yet, so nothing was sent.'
              : 'Nobody is waiting.',
      );
    } catch (err) {
      const p = readApiProblem(err);
      setError(p.code === 'SUBSCRIPTION_REQUIRED' ? 'Renew your plan to send reminders.' : p.status === 429 ? 'You’ve sent a lot of reminders. Please try again later.' : p.message);
    } finally {
      setBusy(null);
    }
  };
  const pct = (n: number) => (team.members ? (n / team.members) * 100 : 0);

  const run = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    setError('');
    try {
      await (kind === 'csv' ? downloadCsv(data.organization.id) : downloadTeamPdf(data.organization.id));
    } catch (err) {
      const p = readApiProblem(err);
      setError(
        p.status === 403
          ? 'You don’t have permission to export results.'
          : p.status === 503
            ? 'PDF reports aren’t available right now. The CSV still works.'
            : p.status === 429
              ? 'You’ve exported a lot recently. Please try again later.'
              : 'We couldn’t create the export. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  // Shown first, even before anyone has joined: an ended plan blocks inviting, which is exactly what an empty company needs.
  const planAlerts = (
    <>
      {plan && !plan.active && plan.end_date && (
        <Alert tone="error">
          <span className="font-medium">Your plan ended on {formatDate(plan.end_date)}.</span> People can’t be invited and company-covered assessments are paused until it is renewed. Everything
          already taken is kept.{' '}
          {isAdmin && (
            <Link href="/billing" className="font-medium underline underline-offset-4">
              Renew the plan
            </Link>
          )}
        </Alert>
      )}
      {plan && plan.active && plan.end_date && new Date(plan.end_date).getTime() - Date.now() < 7 * 86400000 && (
        <Alert tone="info">
          <span className="font-medium text-ink">Your plan ends on {formatDate(plan.end_date)}.</span> Renew before then so nothing is interrupted; the time left is added to the new period.{' '}
          {isAdmin && (
            <Link href="/billing" className="font-medium text-brand-700 underline underline-offset-4">
              Renew the plan
            </Link>
          )}
        </Alert>
      )}
    </>
  );

  if (team.members === 0) {
    return (
      <div className="space-y-8">
        {planAlerts}
        <div className="border-dashed border-line-strong py-10 text-center border-t border-line">
          <p className="font-display text-2xl font-medium">{terms.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-muted">Invite people by email. Once they accept and take the assessment, their results and team charts appear here.</p>
          <Button className="mt-6" onClick={onInvite}>
            Invite people
          </Button>
          {team.pending_invitations > 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              {team.pending_invitations} invitation
              {team.pending_invitations === 1 ? '' : 's'} waiting to be accepted.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {planAlerts}
      {plan && (
        <p className="text-sm text-ink-muted">
          <strong className="font-medium text-ink">{plan.name}</strong> plan
          {plan.end_date ? `, ${plan.active ? 'active until' : 'ended on'} ${formatDate(plan.end_date)}` : ', no charge'}. {plan.seats_used} of {plan.seats_limit} seats used.{' '}
          {isAdmin && plan.end_date && (
            <Link href="/billing" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              {plan.active ? 'Manage plan' : 'Renew plan'}
            </Link>
          )}
        </p>
      )}

      <dl className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={terms.people} value={team.members} hint={team.pending_invitations ? `${team.pending_invitations} invited, not yet joined` : undefined} />
        <Stat label="Finished" value={`${team.completion_pct}%`} hint={`${team.completed} of ${team.members}`} />
        <Stat label="In progress" value={team.in_progress} />
        <Stat label="Not started" value={team.not_started} />
      </dl>

      <section aria-labelledby="completion-heading" className="py-6 border-t border-line">
        <h2 id="completion-heading" className="font-display text-xl font-medium">
          Completion
        </h2>
        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full bg-paper-soft"
          role="img"
          aria-label={`${team.completed} finished, ${team.in_progress} in progress, ${team.not_started} not started`}
        >
          <span className="bg-brand-600" style={{ width: `${pct(team.completed)}%` }} />
          <span className="bg-brand-300" style={{ width: `${pct(team.in_progress)}%` }} />
        </div>
        {unfinished > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={remind} loading={busy === 'remind'}>
              Remind {unfinished} {unfinished === 1 ? 'person' : 'people'} by email
            </Button>
            {notice && (
              <span className="text-sm text-brand-700" role="status">
                {notice}
              </span>
            )}
          </div>
        )}
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-brand-600" />
            Finished {team.completed}
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-brand-300" />
            In progress {team.in_progress}
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-paper-soft ring-1 ring-line-strong" />
            Not started {team.not_started}
          </span>
        </p>
      </section>

      <section aria-labelledby="dist-heading" className="py-6 sm:py-8 border-t border-line">
        <h2 id="dist-heading" className="font-display text-xl font-medium">
          Personality distribution
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Of the {team.completed} {team.completed === 1 ? 'person' : 'people'} who finished: how many sit low, medium or high on each trait. Averages are out of 100.
        </p>
        {team.completed === 0 ? (
          <p className="mt-6 text-sm text-ink-muted">Charts appear once someone finishes.</p>
        ) : (
          <ul className="mt-6 space-y-5">
            {TRAITS.map((t) => {
              const row = data.distribution.find((d) => d.trait === t.key);
              if (!row) return null;
              const total = row.low + row.medium + row.high || 1;
              return (
                <li key={t.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2.5 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                      {t.name}
                    </span>
                    <span className="text-ink-muted">
                      Average <span className="tabular-nums text-ink">{row.average === null ? 'n/a' : Math.round(row.average)}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-paper-soft" role="img" aria-label={`${t.name}: ${row.low} low, ${row.medium} medium, ${row.high} high`}>
                    <span
                      style={{
                        width: `${(row.low / total) * 100}%`,
                        backgroundColor: '#d6cebf',
                      }}
                    />
                    <span
                      style={{
                        width: `${(row.medium / total) * 100}%`,
                        backgroundColor: '#9bb8b1',
                      }}
                    />
                    <span
                      style={{
                        width: `${(row.high / total) * 100}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
                    {row.low} low · {row.medium} medium · {row.high} high
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="dept-heading" className="py-6 sm:py-8 border-t border-line">
        <h2 id="dept-heading" className="font-display text-xl font-medium">
          {terms.units}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th className="py-2 pr-4 font-medium">{terms.unit}</th>
                <th className="py-2 pr-4 text-right font-medium">{terms.people}</th>
                <th className="py-2 pr-4 text-right font-medium">Done</th>
                {TRAITS.map((t) => (
                  <th key={t.key} className="py-2 pr-3 text-right font-medium" title={t.name}>
                    {t.letter}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.departments.map((g) => (
                <tr key={g.department} className="border-t border-line">
                  <td className="py-2.5 pr-4 font-medium">{g.department}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{g.members}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{g.completed}</td>
                  {TRAITS.map((t) => (
                    <td key={t.key} className="py-2.5 pr-3 text-right tabular-nums text-ink-soft">
                      {g.averages[t.key] === null ? '–' : Math.round(g.averages[t.key] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">C Curiosity, D Discipline, E Energy, W Warmth, S Sensitivity. Averages use people who finished.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-heading" className="py-6 sm:py-8 border-t border-line">
          <h2 id="recent-heading" className="font-display text-xl font-medium">
            Recent activity
          </h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            {data.recent.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate">
                  <strong className="font-medium">{r.who}</strong> <span className="text-ink-muted">{activity[r.type]}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{formatDate(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="export-heading" className="py-6 sm:py-8 border-t border-line">
          <h2 id="export-heading" className="font-display text-xl font-medium">
            Export
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            The CSV has one row per person with their company results. The PDF is a team summary with no individual scores.          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => run('csv')} loading={busy === 'csv'}>
              Download CSV
            </Button>
            <Button variant="secondary" onClick={() => run('pdf')} loading={busy === 'pdf'}>
              Download team PDF
            </Button>
          </div>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
