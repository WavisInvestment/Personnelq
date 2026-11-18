import { PrismaClient } from '@prisma/client';
import { FULL_ITEMS, LIKERT_LABELS, LIKERT_VALUES, OceanItem, SNAPSHOT_ITEMS } from './ocean-items';

export interface CoreAssessmentDefinition {
  slug: string;
  name: string;
  description: string;
  type: 'free_snapshot' | 'full_assessment';
  version: string;
  estimatedMinutes: number;
  retakeIntervalDays: number;
  items: OceanItem[];
}

export const CORE_ASSESSMENTS: CoreAssessmentDefinition[] = [
  {
    slug: 'ocean-snapshot',
    name: 'Free personality snapshot',
    description: 'A quick first look at your personality, with a short written analysis.',
    type: 'free_snapshot',
    version: '1.0.0',
    estimatedMinutes: 5,
    retakeIntervalDays: 7,
    items: SNAPSHOT_ITEMS,
  },
  {
    slug: 'ocean-full',
    name: 'Full personality assessment',
    description: 'The complete 50-question profile, with your personality class and a detailed reading of every dimension.',
    type: 'full_assessment',
    version: '1.0.0',
    estimatedMinutes: 20,
    retakeIntervalDays: 180,
    items: FULL_ITEMS,
  },
];

export interface CoreSeedResult {
  created: string[];
  existing: string[];
  mismatched: string[];
}

/**
 * Creates the official assessments if they are missing. It never modifies an existing one: published
 * assessments are locked, so a change to the questions must ship as a new version, not an edit.
 */
export async function seedCoreAssessments(prisma: PrismaClient): Promise<CoreSeedResult> {
  const result: CoreSeedResult = { created: [], existing: [], mismatched: [] };

  for (const def of CORE_ASSESSMENTS) {
    const found = await prisma.assessment.findUnique({
      where: { slug_version: { slug: def.slug, version: def.version } },
      select: { id: true, total_questions: true, _count: { select: { questions: true } } },
    });

    if (found) {
      result.existing.push(def.slug);
      if (found._count.questions !== def.items.length || found.total_questions !== def.items.length) {
        result.mismatched.push(def.slug);
      }
      continue;
    }

    await prisma.assessment.create({
      data: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        type: def.type,
        framework: 'ocean',
        version: def.version,
        is_locked: true,
        allow_retake: true,
        retake_interval_days: def.retakeIntervalDays,
        total_questions: def.items.length,
        scoring_method: 'ocean',
        published_at: new Date(),
        questions: {
          create: def.items.map((it, index) => ({
            question_number: index + 1,
            question_text: it.text,
            question_type: 'likert',
            ocean_trait: it.trait,
            ocean_direction: it.reverse ? 'reverse' : 'positive',
            weight: 1,
            min_score: 1,
            max_score: 5,
            options: LIKERT_LABELS,
            option_values: LIKERT_VALUES,
          })),
        },
      },
    });
    result.created.push(def.slug);
  }

  return result;
}

export const ESTIMATED_MINUTES: Record<string, number> = Object.fromEntries(
  CORE_ASSESSMENTS.map((a) => [a.slug, a.estimatedMinutes]),
);
