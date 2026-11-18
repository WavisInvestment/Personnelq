import { Level, LEVEL_LABELS, levelFor } from './scoring';

/** A section of a company-made assessment, as stored in Assessment.definition. */
export interface CustomSection {
  key: string;
  name: string;
  description: string | null;
  /** How much this section counts towards the overall score (1 to 5). */
  weight: number;
  /** What a low, medium or high score means. Shown to the person; blank falls back to a plain sentence. */
  interpretation: { low: string; medium: string; high: string };
}

export interface CustomQuestion {
  id: string;
  section: string;
  reverse: boolean;
  weight: number;
  min: number;
  max: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Band = 'low' | 'medium' | 'high';

/** The five score levels collapse to three wordings an administrator writes. */
export function bandFor(level: Level): Band {
  if (level === 'very_low' || level === 'low') return 'low';
  if (level === 'moderate') return 'medium';
  return 'high';
}

/**
 * Same rules as the official assessment, per section: a weighted percentage where all-minimum answers give 0 and
 * all-maximum give 100, reverse questions flipped. The overall score is the section scores averaged by section weight.
 * Throws on a missing or out-of-range answer or an empty section, because a partial score would be silently wrong.
 */
export function scoreCustom(sections: Pick<CustomSection, 'key' | 'weight'>[], questions: CustomQuestion[], answers: Map<string, number>) {
  const earned = new Map<string, number>(sections.map((s) => [s.key, 0]));
  const possible = new Map<string, number>(sections.map((s) => [s.key, 0]));

  for (const q of questions) {
    if (!earned.has(q.section)) throw new Error(`Question ${q.id} belongs to an unknown section`);
    const value = answers.get(q.id);
    if (value === undefined) throw new Error(`Missing answer for question ${q.id}`);
    if (!Number.isInteger(value) || value < q.min || value > q.max) throw new Error(`Answer ${value} is out of range for question ${q.id}`);

    const effective = q.reverse ? q.min + q.max - value : value;
    earned.set(q.section, (earned.get(q.section) as number) + q.weight * (effective - q.min));
    possible.set(q.section, (possible.get(q.section) as number) + q.weight * (q.max - q.min));
  }

  const scored = sections.map((s) => {
    const max = possible.get(s.key) as number;
    if (max <= 0) throw new Error(`No scorable questions in section ${s.key}`);
    return { key: s.key, score: round1(((earned.get(s.key) as number) / max) * 100), weight: s.weight };
  });
  const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0);
  const overall = round1(scored.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight);
  return { sections: scored.map(({ key, score }) => ({ key, score })), overall };
}

export interface InterpretedSection {
  key: string;
  name: string;
  description: string | null;
  score: number;
  level: Level;
  level_label: string;
  band: Band;
  text: string;
}

/** Attaches the wording to a score. Stored with the result, so editing the assessment later never rewrites history. */
export function interpretSection(section: CustomSection, score: number): InterpretedSection {
  const level = levelFor(score);
  const band = bandFor(level);
  const written = section.interpretation[band]?.trim();
  return {
    key: section.key,
    name: section.name,
    description: section.description,
    score,
    level,
    level_label: LEVEL_LABELS[level],
    band,
    text: written || `Your score in ${section.name} is ${band === 'medium' ? 'in the middle range' : band}.`,
  };
}

export interface StoredCustomScores {
  sections: InterpretedSection[];
  overall: { score: number; level: Level; level_label: string };
}

export function buildCustomScores(sections: CustomSection[], questions: CustomQuestion[], answers: Map<string, number>): StoredCustomScores {
  const { sections: scored, overall } = scoreCustom(sections, questions, answers);
  const level = levelFor(overall);
  return {
    sections: sections.map((s) => interpretSection(s, scored.find((x) => x.key === s.key)!.score)),
    overall: { score: overall, level, level_label: LEVEL_LABELS[level] },
  };
}

/** Reads stored custom scores defensively: bad or missing data gives null instead of an error. */
export function parseCustomScores(value: unknown): StoredCustomScores | null {
  const v = value as Partial<StoredCustomScores> | null;
  if (!v || !Array.isArray(v.sections) || typeof v.overall?.score !== 'number') return null;
  return v as StoredCustomScores;
}
