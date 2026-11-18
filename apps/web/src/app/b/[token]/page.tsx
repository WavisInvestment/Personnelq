'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ClassEmblem, type ClassKey } from '@/components/class-emblem';
import { Logo } from '@/components/logo';
import { TierChip } from '@/components/results/class-card';
import { ButtonLink } from '@/components/ui/button';
import { authApi } from '@/lib/auth';
import { formatDate } from '@/lib/assessments';
import type { PublicBadge } from '@/lib/billing';
import { TRAITS } from '@/lib/traits';


export default function PublicBadgePage() {
  const { token } = useParams<{ token: string }>();
  const [badge, setBadge] = useState<PublicBadge | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .get(`/public/badges/${encodeURIComponent(token)}`)
      .then((r) => !cancelled && setBadge(r.data as PublicBadge))
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cls = badge?.profile_class ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header>
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8">
          <Logo href="/" />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
        {!badge && !missing && <div className="mx-auto h-96 max-w-[34rem] animate-pulse rounded-[0.35rem] bg-paper-soft" aria-hidden="true" />}

        {missing && (
          <div className="mx-auto max-w-md py-16 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em]">This badge isn’t available</h1>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-muted">
              The link may have expired, or the person who shared it has turned sharing off.
            </p>
            <ButtonLink href="/" variant="secondary" className="mt-6">
              Go to Personnelq
            </ButtonLink>
          </div>
        )}

        {badge && (
          <>
            {/* The badge: a card hung from a lanyard slot, set slightly off true */}
            <div className="mx-auto w-full max-w-[34rem]">
              <article className="paper animate-fade-up relative w-full rounded-[0.5rem] border border-line-strong pb-9">
                <span className="absolute left-1/2 top-3 h-2.5 w-14 -translate-x-1/2 rounded-full border border-line-strong bg-paper-soft shadow-[inset_0_1px_2px_rgba(27,33,30,0.25)]" aria-hidden="true" />

                <div className="mt-9 flex h-2.5 overflow-hidden" aria-hidden="true">
                  {TRAITS.map((t) => (
                    <span key={t.key} className="flex-1" style={{ backgroundColor: t.color }} />
                  ))}
                </div>

                <div className="px-6 pt-8 sm:px-10">
                  {/* who it belongs to, and which class */}
                  <p className="text-sm font-medium text-ink-muted">{cls ? 'Personality class' : badge.assessment_name}</p>
                  <div className="mt-2 flex items-center gap-5">
                    {cls && <ClassEmblem name={cls.key as ClassKey} className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" />}
                    <div className="min-w-0">
                      {cls && <p className="font-display text-[1.7rem] font-extrabold leading-[1] tracking-[-0.04em] sm:text-4xl">{cls.name}</p>}
                      <h1 className={cls ? 'mt-2 text-lg font-semibold text-ink-soft' : 'font-display text-[2.7rem] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-6xl'}>
                        {cls ? <>{badge.display_name}</> : badge.display_name}
                      </h1>
                      {cls && <p className="mt-1 text-lg leading-snug text-ink-soft">{cls.tagline}</p>}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-muted">
                    {badge.tier && <TierChip tier={badge.tier} />}
                    {badge.completed_at && <span>Completed {formatDate(badge.completed_at)}</span>}
                  </div>

                  {badge.message && (
                    <blockquote className="mt-6 max-w-xl whitespace-pre-line border-l-2 border-accent-500 pl-4 text-lg leading-relaxed text-ink-soft">
                      {badge.message}
                    </blockquote>
                  )}

                  {cls && (
                    <div className="mt-8 border-t border-dashed border-line-strong pt-6">
                      <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Pairs well with</p>
                      <ul className="mt-3 grid grid-cols-3 gap-3">
                        {cls.pairs_with.map((p) => (
                          <li key={p.key} className="flex flex-col items-center text-center">
                            <ClassEmblem name={p.key as ClassKey} className="h-14 w-14" />
                            <span className="mt-1 text-[13px] font-semibold leading-tight">{p.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="mx-auto mt-10 max-w-[34rem] px-1">
              <p className="text-sm leading-relaxed text-ink-muted">
                A self-reported snapshot of personality, shared by its owner. A class describes a style, not a rank, and “pairs well” is a
                tendency, not a rule. It describes tendencies, not abilities, and isn’t a clinical or hiring assessment.
              </p>
              <div className="mt-6 border-t border-line-strong pt-6">
                <p className="text-lg font-medium text-ink-soft">Curious about your own profile?</p>
                <Link href="/auth/signup" className="mt-1 inline-block text-[15px] font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900">
                  Take the free snapshot
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
