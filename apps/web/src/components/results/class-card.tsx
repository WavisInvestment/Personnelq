import { ClassEmblem, type ClassKey } from '@/components/class-emblem';
import type { ProfileClass, Tier } from '@/lib/assessments';

/** Where a person's progress sits: three steps, not a ranking. */
export function TierChip({ tier }: { tier: Tier }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-paper-soft px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line-strong" title={tier.description}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 w-3 rounded-full ${n <= tier.step ? 'bg-accent-500' : 'bg-line-strong'}`} />
        ))}
      </span>
      Tier {tier.step} of {tier.of}: {tier.name}
    </span>
  );
}

/** The personality class: who this person is like, what they do well, and the classes they tend to work well with. */
export function ClassCard({ profile, tier, early = false }: { profile: ProfileClass; tier?: Tier | null; early?: boolean }) {
  return (
    <section aria-labelledby="class-heading" className="grid gap-8 lg:grid-cols-[auto_1fr] lg:gap-12">
      <ClassEmblem name={profile.key as ClassKey} className="h-28 w-28 sm:h-36 sm:w-36" />
      <div>
        <p className="text-sm font-medium text-ink-muted">{early ? 'Your class, from a first look' : 'Your personality class'}</p>
        <h2 id="class-heading" className="mt-1 font-display text-[2.4rem] font-extrabold leading-[1] tracking-[-0.045em] sm:text-5xl">
          {profile.name}
        </h2>
        <p className="mt-3 text-xl text-ink-soft">{profile.tagline}</p>
        {tier && (
          <div className="mt-4">
            <TierChip tier={tier} />
          </div>
        )}
        <p className="mt-5 max-w-2xl text-[1.02rem] leading-[1.75] text-ink-soft">{profile.description}</p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="font-display text-lg font-bold tracking-[-0.02em]">What you do well</h3>
            <ul className="mt-3 space-y-2 text-[15px] leading-snug text-ink-soft">
              {profile.strengths.map((s) => (
                <li key={s} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[45%] bg-accent-500" />
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              <span className="font-medium text-ink-soft">Worth watching: </span>
              {profile.watch}
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold tracking-[-0.02em]">Pairs well with</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{profile.pairs_note}</p>
            <ul className="mt-3 space-y-3">
              {profile.pairs_with.map((p) => (
                <li key={p.key} className="flex items-center gap-3">
                  <ClassEmblem name={p.key as ClassKey} className="h-11 w-11 shrink-0" />
                  <div>
                    <p className="text-[15px] font-semibold leading-tight">{p.name}</p>
                    <p className="text-sm leading-snug text-ink-muted">{p.tagline}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-muted">
          Classes describe a style, not a rank: none is better than another. “Pairs well” is a tendency, not a rule.
          {early ? ' This is a first read from ten questions; the full assessment gives a more reliable class.' : ''}
        </p>
      </div>
    </section>
  );
}
