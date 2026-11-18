'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ClassEmblem, type ClassKey } from '@/components/class-emblem';
import { Alert } from '@/components/ui/alert';
import { readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { getClasses, getMatches, termsFor, type ClassGroup, type ClassesOverview, type MatchFit, type MatchResult } from '@/lib/company';

type Fit = 'strong' | 'good' | 'different_style';

const MATCH_LABEL: Record<MatchFit, string> = { strong: 'Strong match', good: 'Good match', same_class: 'Same class', different_style: 'Different styles' };
const MATCH_STYLE: Record<MatchFit, string> = {
  strong: 'bg-brand-50 text-brand-800 ring-brand-200',
  good: 'bg-brand-50 text-brand-700 ring-brand-200',
  same_class: 'bg-paper-soft text-ink-soft ring-line-strong',
  different_style: 'bg-paper-soft text-ink-muted ring-line-strong',
};

const FIT: Record<Fit, { label: string; style: string; text: (a: string, b: string) => string }> = {
  strong: {
    label: 'Strong match',
    style: 'bg-brand-50 text-brand-800 ring-brand-200',
    text: (a, b) => `${a} and ${b} each list the other as a class they tend to work well with. They usually balance each other.`,
  },
  good: {
    label: 'Good match',
    style: 'bg-brand-50 text-brand-700 ring-brand-200',
    text: (a, b) => `One of ${a} and ${b} lists the other as a class that tends to work well with it, so there is a natural way in.`,
  },
  different_style: {
    label: 'Different styles',
    style: 'bg-paper-soft text-ink-soft ring-line-strong',
    text: (a, b) => `${a} and ${b} work in different ways. That is not a bad match, but it tends to need more explaining and patience on both sides.`,
  },
};

function fitOf(a: ClassGroup, b: ClassGroup): Fit {
  const ab = a.pairs_with.some((p) => p.key === b.key);
  const ba = b.pairs_with.some((p) => p.key === a.key);
  return ab && ba ? 'strong' : ab || ba ? 'good' : 'different_style';
}

function Person({ name, group, department }: { name: string; group: ClassGroup; department: string | null }) {
  return (
    <div className="flex items-start gap-4">
      <ClassEmblem name={group.key as ClassKey} className="h-20 w-20 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">{department ?? 'No department'}</p>
        <p className="font-display text-xl font-bold leading-tight tracking-[-0.03em]">{name}</p>
        <p className="mt-1 text-[15px] font-semibold text-ink-soft">{group.name}</p>
        <p className="text-[15px] leading-snug text-ink-soft">{group.tagline}</p>
      </div>
    </div>
  );
}

export function ClassesTab({ organizationId, orgType }: { organizationId: string; orgType: string }) {
  const terms = termsFor(orgType);
  const [data, setData] = useState<ClassesOverview | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [cross, setCross] = useState(true);
  const [matches, setMatches] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [copied, setCopied] = useState(false);

  const runMatch = async () => {
    setMatching(true);
    setMatchError('');
    setCopied(false);
    try {
      setMatches(await getMatches(organizationId, { crossDepartment: cross }));
    } catch (err) {
      setMatchError(readApiProblem(err).message);
    } finally {
      setMatching(false);
    }
  };

  const copyMatches = async () => {
    if (!matches) return;
    const lines = matches.groups.map((g) => {
      const names = [...g.members, ...(g.joined_by ? [g.joined_by.person] : [])].map((m) => `${m.name} (${m.class_name})`).join(' + ');
      return `${names}: ${MATCH_LABEL[g.fit]}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      setMatchError('Your browser would not let us copy. Select the list and copy it instead.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    getClasses(organizationId)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // everyone with a class, with the class they are in
  const people = useMemo(
    () => (data ? data.classes.flatMap((c) => c.members.map((m) => ({ ...m, group: c }))).sort((x, y) => x.name.localeCompare(y.name)) : []),
    [data],
  );

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <div className="h-72 animate-pulse border-t border-line" aria-hidden="true" />;

  const total = data.classified + data.not_classified.length;
  const max = Math.max(1, ...data.classes.map((c) => c.count));
  const opened = data.classes.find((c) => c.key === open) ?? null;
  const a = people.find((p) => p.user_id === aId);
  const b = people.find((p) => p.user_id === bId);

  if (total === 0) {
    return <p className="border-t border-line py-8 text-[15px] text-ink-muted">No one has joined yet. Classes appear here once people finish the assessment through your {terms.org}.</p>;
  }

  return (
    <div className="space-y-12">
      {/* ----------------------------------------------------------------------------------------- who is in which class */}
      <section aria-labelledby="by-class-heading" className="border-t border-line pt-6">
        <h2 id="by-class-heading" className="font-display text-2xl font-bold tracking-[-0.03em]">
          Your team by class
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {data.classified} of {total} {total === 1 ? 'person has' : 'people have'} a class. A class describes a style, not a rank. It comes from the assessment people took through your {terms.org}.
        </p>

        <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {data.classes.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setOpen(open === c.key ? null : c.key)}
                aria-expanded={open === c.key}
                disabled={c.count === 0}
                className={cn('flex w-full items-center gap-4 border-b border-dashed border-line-strong py-3 text-left transition', c.count === 0 ? 'opacity-50' : 'hover:border-ink-muted')}
              >
                <ClassEmblem name={c.key as ClassKey} className="h-14 w-14 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-lg font-bold tracking-[-0.02em]">{c.name}</span>
                    <span className="font-display text-2xl font-semibold tabular-nums">{c.count}</span>
                  </span>
                  <span className="mt-1.5 block h-[3px] bg-line-strong" aria-hidden="true">
                    <span className="block h-[3px] bg-accent-500" style={{ width: `${(c.count / max) * 100}%` }} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {opened && (
          <div className="mt-6 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{opened.name}</h3>
              <p className="mt-1 text-[16px] text-ink-soft">{opened.tagline}</p>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {opened.members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/company/members/${m.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                      {m.name}
                    </Link>
                    <span className="text-sm text-ink-muted">{m.department ?? m.job_title ?? ''}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold tracking-[-0.02em]">Pairs well with</h3>
              <p className="mt-1 text-sm text-ink-muted">{opened.pairs_note}</p>
              <ul className="mt-3 space-y-3">
                {opened.pairs_with.map((p) => {
                  const there = data.classes.find((c) => c.key === p.key);
                  return (
                    <li key={p.key} className="flex items-center gap-3">
                      <ClassEmblem name={p.key as ClassKey} className="h-11 w-11 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-tight">{p.name}</p>
                        <p className="text-sm text-ink-muted">
                          {there && there.count > 0 ? `${there.members.map((m) => m.name).join(', ')}` : `No one in your ${terms.org} yet`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {data.not_classified.length > 0 && (
          <p className="mt-6 text-sm text-ink-muted">
            <span className="font-medium text-ink-soft">No class yet ({data.not_classified.length}): </span>
            {data.not_classified.map((m) => m.name).join(', ')}. They appear once they finish the assessment.
          </p>
        )}
      </section>

      {/* ----------------------------------------------------------------------------------------------------- balance */}
      {data.balance.most_common && (
        <section aria-labelledby="balance-heading" className="border-t border-line pt-6">
          <h2 id="balance-heading" className="font-display text-2xl font-bold tracking-[-0.03em]">
            The shape of your team
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            The most common class is <strong className="font-semibold">{data.balance.most_common.name}</strong> ({data.balance.most_common.count} of {data.classified}).
            {data.balance.missing.length > 0 ? ` No one is ${data.balance.missing.map((c) => c.name).join(', ')} yet.` : ' Every class is represented.'} A mix of classes is not
            better or worse than a team that shares a style; it simply changes what the team is naturally good at and where it may need to work harder.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------------------------------------------ auto-match */}
      <section aria-labelledby="match-heading" className="border-t border-line pt-6">
        <h2 id="match-heading" className="font-display text-2xl font-bold tracking-[-0.03em]">
          Auto-match staff
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Suggests pairs from people’s classes, for a buddy, a mentor or a project partner. It is only a suggestion: nothing is saved and nobody is told.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand-700" />
            Prefer people from different {terms.unit.toLowerCase()}s
          </label>
          <Button onClick={runMatch} loading={matching} disabled={people.length < 2}>
            {matches ? 'Shuffle matches' : 'Match staff'}
          </Button>
          {matches && matches.groups.length > 0 && (
            <Button variant="secondary" onClick={copyMatches}>
              {copied ? 'Copied' : 'Copy list'}
            </Button>
          )}
        </div>
        {people.length < 2 && <p className="mt-3 text-sm text-ink-muted">Matching needs at least two people who have finished the assessment.</p>}
        {matchError && <Alert tone="error" className="mt-4">{matchError}</Alert>}

        {matches && (
          <div className="mt-6" aria-live="polite">
            <p className="text-sm text-ink-muted">
              {matches.groups.length} {matches.groups.length === 1 ? 'group' : 'groups'} for {matches.people} people
              {matches.not_classified > 0 ? `. ${matches.not_classified} more will be matched once they finish.` : '.'} Shuffle for another set.
            </p>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {matches.groups.map((g) => (
                <li key={g.members[0].user_id} className="grid gap-4 py-4 md:grid-cols-[1fr_auto]">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[...g.members, ...(g.joined_by ? [g.joined_by.person] : [])].map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3">
                        <ClassEmblem name={m.class_key as ClassKey} className="h-12 w-12 shrink-0" />
                        <div className="min-w-0">
                          <Link href={`/company/members/${m.user_id}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                            {m.name}
                          </Link>
                          <p className="text-sm text-ink-muted">
                            {m.class_name}
                            {m.department ? ` · ${m.department}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="md:text-right">
                    <span className={cn('inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset', MATCH_STYLE[g.fit])}>{MATCH_LABEL[g.fit]}</span>
                    {g.joined_by && <p className="mt-1 text-xs text-ink-muted">A group of three: {g.joined_by.person.name} joins this pair.</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------------------------------------- compare */}
      <section aria-labelledby="compare-heading" className="border-t border-line pt-6">
        <h2 id="compare-heading" className="font-display text-2xl font-bold tracking-[-0.03em]">
          Compare two people
        </h2>
        <p className="mt-1 text-sm text-ink-muted">See how two people’s classes tend to fit together. It is a starting point for a conversation, not a verdict.</p>

        {people.length < 2 ? (
          <p className="mt-4 text-[15px] text-ink-muted">Comparing needs at least two people who have finished the assessment.</p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([['First person', aId, setAId, bId], ['Second person', bId, setBId, aId]] as const).map(([label, value, set, other]) => (
                <label key={label} className="block text-sm font-medium">
                  {label}
                  <select value={value} onChange={(e) => set(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal">
                    <option value="">Choose a person</option>
                    {people
                      .filter((p) => p.user_id !== other)
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.name} ({p.group.name})
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>

            {a && b && (
              <div className="mt-8 border-t border-line pt-6" aria-live="polite">
                <div className="grid gap-8 md:grid-cols-2">
                  <Person name={a.name} group={a.group} department={a.department} />
                  <Person name={b.name} group={b.group} department={b.department} />
                </div>

                {(() => {
                  const fit = fitOf(a.group, b.group);
                  const same = a.group.key === b.group.key;
                  return (
                    <div className="mt-8">
                      <span className={cn('inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset', FIT[same ? 'good' : fit].style)}>{same ? 'Same class' : FIT[fit].label}</span>
                      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                        {same
                          ? `${a.name} and ${b.name} share a style, so they tend to understand each other quickly. They may also share the same blind spots, so it can help to bring in someone who works differently.`
                          : FIT[fit].text(a.name, b.name)}
                      </p>
                    </div>
                  );
                })()}

                <div className="mt-8 grid gap-8 md:grid-cols-2">
                  {[a, b].map((x) => (
                    <div key={x.user_id}>
                      <h3 className="font-display text-lg font-bold tracking-[-0.02em]">Working with {x.name.split(' ')[0]}</h3>
                      <ul className="mt-2 space-y-2 text-[15px] leading-snug text-ink-soft">
                        <li className="flex gap-3">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[45%] bg-accent-500" />
                          Does best next to people who: {x.group.pairs_note.replace(/^Does best next to people who /, '').replace(/\.$/, '')}.
                        </li>
                        <li className="flex gap-3">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[45%] bg-accent-500" />
                          Strengths to lean on: {x.group.strengths.join('; ').toLowerCase()}.
                        </li>
                        <li className="flex gap-3">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[45%] bg-accent-500" />
                          Worth knowing: {x.group.watch}
                        </li>
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <p className="max-w-3xl text-xs leading-relaxed text-ink-muted">
        Classes describe tendencies from a self-reported assessment. They are not a clinical or hiring assessment and should not be the only basis for decisions about a person.
      </p>
    </div>
  );
}
