import { ArrowDown, ArrowRight, ArrowUp } from '@phosphor-icons/react/dist/ssr';
import type { Progress } from '@/lib/company';
import { TRAITS } from '@/lib/traits';

const W = 640;
const H = 280;
const M = { top: 16, right: 20, bottom: 36, left: 36 };
const ticks = [0, 25, 50, 75, 100];

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

/** Five trait lines over the person's full-assessment attempts. Needs two or more attempts to say anything. */
export function EvolutionChart({ progress }: { progress: Progress }) {
  const { points, change } = progress;
  if (points.length < 2 || !change) return null;

  const x = (i: number) => M.left + (i / (points.length - 1)) * (W - M.left - M.right);
  const y = (score: number) => M.top + (1 - score / 100) * (H - M.top - M.bottom);
  const summary = TRAITS.map((t) => `${t.name} ${Math.round(change[t.key].from)} to ${Math.round(change[t.key].to)}`).join(', ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Trait scores across ${points.length} full assessments. ${summary}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e7e1d6" strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b665e">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.result_id} x={x(i)} y={H - 12} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#6b665e">
            {day(p.completed_at)}
          </text>
        ))}
        {TRAITS.map((t) => (
          <g key={t.key}>
            <polyline
              fill="none"
              stroke={t.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.scores[t.key])}`).join(' ')}
            />
            {points.map((p, i) => (
              <circle key={p.result_id} cx={x(i)} cy={y(p.scores[t.key])} r="3.5" fill="#fff" stroke={t.color} strokeWidth="2" />
            ))}
          </g>
        ))}
      </svg>

      <table className="sr-only">
        <caption>Trait scores for each full assessment</caption>
        <thead>
          <tr>
            <th>Date</th>
            {TRAITS.map((t) => (
              <th key={t.key}>{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.result_id}>
              <td>{day(p.completed_at)}</td>
              {TRAITS.map((t) => (
                <td key={t.key}>{Math.round(p.scores[t.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {TRAITS.map((t) => {
          const c = change[t.key];
          const Icon = c.trend === 'up' ? ArrowUp : c.trend === 'down' ? ArrowDown : ArrowRight;
          return (
            <li key={t.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                {t.name}
              </span>
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span className="tabular-nums">
                  {Math.round(c.from)} to {Math.round(c.to)}
                </span>
                <Icon className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
                <span className="w-14 text-right">{c.trend === 'steady' ? 'Steady' : c.trend === 'up' ? 'Higher' : 'Lower'}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">Changes under 5 points count as steady. A different day or mood can move a score a little.</p>
    </div>
  );
}
