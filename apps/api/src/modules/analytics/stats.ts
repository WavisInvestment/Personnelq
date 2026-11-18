import { TRAITS, Trait } from '../assessments/catalog/ocean-items';
import { levelFor } from '../assessments/scoring/scoring';

export type Scores = Record<Trait, number>;

export interface ScoredRow {
  department: string | null;
  scores: Scores;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null);

/** The five levels collapse to three for team charts: low (very low + low), medium, high (high + very high). */
function band(score: number): 'low' | 'medium' | 'high' {
  const level = levelFor(score);
  if (level === 'very_low' || level === 'low') return 'low';
  if (level === 'moderate') return 'medium';
  return 'high';
}

export function distribution(rows: ScoredRow[]) {
  return TRAITS.map((trait) => {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const r of rows) counts[band(r.scores[trait])]++;
    const n = rows.length;
    return {
      trait,
      average: mean(rows.map((r) => r.scores[trait])),
      ...counts,
      high_pct: n ? Math.round((counts.high / n) * 100) : 0,
    };
  });
}

export const NO_DEPARTMENT = 'No department';

/** One row per department, biggest first, with each trait's average over the people who finished. */
export function byDepartment(members: { department: string | null; completed: boolean; scores: Scores | null }[]) {
  // "Sales", "sales" and " SALES " are one department; the first spelling seen is the one shown.
  const groups = new Map<string, { label: string; members: number; scored: Scores[] }>();
  for (const m of members) {
    const label = m.department?.trim().replace(/\s+/g, ' ') || NO_DEPARTMENT;
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { label, members: 0, scored: [] };
    g.members++;
    if (m.completed && m.scores) g.scored.push(m.scores);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      department: g.label,
      members: g.members,
      completed: g.scored.length,
      averages: Object.fromEntries(TRAITS.map((t) => [t, mean(g.scored.map((s) => s[t]))])) as Record<Trait, number | null>,
    }))
    .sort((a, b) => b.members - a.members || a.department.localeCompare(b.department));
}

export type Trend = 'up' | 'down' | 'steady';

/** Moves smaller than this many points (on the 0-100 scale) are noise, not change. */
export const STEADY_BAND = 5;

export function trendOf(delta: number): Trend {
  return delta >= STEADY_BAND ? 'up' : delta <= -STEADY_BAND ? 'down' : 'steady';
}

/** First versus latest attempt, per trait. Needs two or more points; returns null otherwise. */
export function evolution(points: { scores: Scores }[]) {
  if (points.length < 2) return null;
  const first = points[0].scores;
  const last = points[points.length - 1].scores;
  return Object.fromEntries(
    TRAITS.map((t) => {
      const delta = round1(last[t] - first[t]);
      return [t, { from: first[t], to: last[t], delta, trend: trendOf(delta) }];
    }),
  ) as Record<Trait, { from: number; to: number; delta: number; trend: Trend }>;
}
