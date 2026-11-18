import { TRAITS, Trait } from '../catalog/ocean-items';

export interface ScorableQuestion {
  id: string;
  trait: Trait;
  reverse: boolean;
  weight: number;
  min: number;
  max: number;
}

export type TraitScores = Record<Trait, number>;

export interface ScoreResult {
  traits: TraitScores;
  /** Plain mean of the five traits (each weighted 20%), as in the assessment spec. */
  overall: number;
}

export type Level = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

export const LEVEL_LABELS: Record<Level, string> = {
  very_low: 'Very low',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scores answers on the server. For each trait:
 *   - a reverse item counts as (min + max - answer), so agreeing with "I keep in the background" lowers Extraversion;
 *   - each item contributes weight * (value - min), out of a possible weight * (max - min);
 *   - the trait score is that total as a percentage, so all-minimum answers give 0 and all-maximum give 100.
 * Throws if an answer is missing or out of range, because a partial score would be silently wrong.
 */
export function scoreAnswers(questions: ScorableQuestion[], answers: Map<string, number>): ScoreResult {
  const earned = new Map<Trait, number>(TRAITS.map((t) => [t, 0]));
  const possible = new Map<Trait, number>(TRAITS.map((t) => [t, 0]));

  for (const q of questions) {
    const value = answers.get(q.id);
    if (value === undefined) throw new Error(`Missing answer for question ${q.id}`);
    if (!Number.isInteger(value) || value < q.min || value > q.max) {
      throw new Error(`Answer ${value} is out of range for question ${q.id}`);
    }

    const effective = q.reverse ? q.min + q.max - value : value;
    earned.set(q.trait, (earned.get(q.trait) as number) + q.weight * (effective - q.min));
    possible.set(q.trait, (possible.get(q.trait) as number) + q.weight * (q.max - q.min));
  }

  const traits = {} as TraitScores;
  for (const trait of TRAITS) {
    const max = possible.get(trait) as number;
    if (max <= 0) throw new Error(`No scorable questions for ${trait}`);
    traits[trait] = round1(((earned.get(trait) as number) / max) * 100);
  }

  const overall = round1(TRAITS.reduce((sum, t) => sum + traits[t], 0) / TRAITS.length);
  return { traits, overall };
}

/** 0-20 very low, 21-40 low, 41-60 moderate, 61-80 high, 81-100 very high. */
export function levelFor(score: number): Level {
  if (score <= 20) return 'very_low';
  if (score <= 40) return 'low';
  if (score <= 60) return 'moderate';
  if (score <= 80) return 'high';
  return 'very_high';
}
