import { TRAITS } from '@/lib/traits';
import { cn } from '@/lib/cn';
import type { TraitResult } from '@/lib/assessments';

const traitMeta = Object.fromEntries(TRAITS.map((t) => [t.key, t]));

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="text-xs text-ink-muted">No change</span>;
  const up = value > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-brand-700' : 'text-accent-600')}>
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={up ? 'M6 10V2m0 0L2.5 5.5M6 2l3.5 3.5' : 'M6 2v8m0 0L2.5 6.5M6 10l3.5-3.5'} />
      </svg>
      {Math.abs(Math.round(value))} since last time
      <span className="sr-only">{up ? ' (higher)' : ' (lower)'}</span>
    </span>
  );
}

export function TraitBreakdown({
  traits,
  previous,
}: {
  traits: TraitResult[];
  previous?: { trait: string; score: number }[] | null;
}) {
  return (
    <ul>
      {traits.map((t, i) => {
        const meta = traitMeta[t.trait];
        const before = previous?.find((p) => p.trait === t.trait)?.score;
        return (
          <li key={t.trait} className="border-t border-line-strong py-6" style={{ marginLeft: [0, 18, 6, 24, 10][i % 5] }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: meta.color, borderRadius: ['48% 52% 45% 55%', '55% 45% 52% 48%', '46% 54% 50% 50%', '52% 48% 55% 45%', '50% 50% 46% 54%'][i % 5] }}
                  aria-hidden="true"
                >
                  {meta.letter}
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold leading-tight tracking-[-0.02em]">{meta.name}</h3>
                  {before !== undefined && <Delta value={t.score - before} />}
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-[2.4rem] font-bold leading-none tabular-nums">{Math.round(t.score)}</p>
                <p className="mt-1 text-xs font-medium text-ink-muted">{t.level_label}</p>
              </div>
            </div>

            <div
              className="relative mt-4 h-[3px] bg-line-strong"
              role="meter"
              aria-label={`${meta.name} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(t.score)}
              aria-valuetext={`${Math.round(t.score)} out of 100, ${t.level_label}`}
            >
              <div className="relative h-[3px]" style={{ width: `${t.score}%`, backgroundColor: meta.color }}>
                <span className="absolute -right-1.5 -top-[5px] h-[13px] w-[13px] rounded-[45%]" style={{ backgroundColor: meta.color }} />
              </div>
            </div>

            {t.description && <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{t.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}
