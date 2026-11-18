import { CORE_ASSESSMENTS, seedCoreAssessments } from './core-assessments';
import { FULL_ITEMS, LIKERT_LABELS, LIKERT_VALUES, SNAPSHOT_ITEMS, TRAITS } from './ocean-items';

describe('official question set', () => {
  it('has 50 items: ten for each of the five traits', () => {
    expect(FULL_ITEMS).toHaveLength(50);
    for (const t of TRAITS) expect(FULL_ITEMS.filter((i) => i.trait === t)).toHaveLength(10);
  });

  it('has unique ids and unique wording', () => {
    expect(new Set(FULL_ITEMS.map((i) => i.id)).size).toBe(50);
    expect(new Set(FULL_ITEMS.map((i) => i.text)).size).toBe(50);
  });

  it('uses each trait’s own prefix in the item id', () => {
    const prefix = { openness: 'O', conscientiousness: 'C', extraversion: 'E', agreeableness: 'A', neuroticism: 'N' };
    for (const i of FULL_ITEMS) expect(i.id.startsWith(prefix[i.trait])).toBe(true);
  });

  it('mixes traits so no two neighbouring questions share a trait', () => {
    for (let n = 1; n < FULL_ITEMS.length; n++) expect(FULL_ITEMS[n].trait).not.toBe(FULL_ITEMS[n - 1].trait);
  });

  it('includes reverse-worded items for every trait', () => {
    for (const t of TRAITS) expect(FULL_ITEMS.some((i) => i.trait === t && i.reverse)).toBe(true);
  });

  it('has a 10-item snapshot with two items per trait, one worded each way', () => {
    expect(SNAPSHOT_ITEMS).toHaveLength(10);
    for (const t of TRAITS) {
      const items = SNAPSHOT_ITEMS.filter((i) => i.trait === t);
      expect(items).toHaveLength(2);
      expect(items.filter((i) => i.reverse)).toHaveLength(1);
    }
  });

  it('draws every snapshot item from the full set, unchanged', () => {
    for (const item of SNAPSHOT_ITEMS) expect(FULL_ITEMS).toContain(item);
  });

  it('uses a five-point scale with matching labels', () => {
    expect(LIKERT_VALUES).toEqual([1, 2, 3, 4, 5]);
    expect(LIKERT_LABELS).toHaveLength(5);
  });
});

describe('core assessment definitions', () => {
  it('defines the snapshot and the full assessment with distinct slugs', () => {
    expect(CORE_ASSESSMENTS.map((a) => a.slug)).toEqual(['ocean-snapshot', 'ocean-full']);
    expect(CORE_ASSESSMENTS.map((a) => a.type)).toEqual(['free_snapshot', 'full_assessment']);
    expect(CORE_ASSESSMENTS.map((a) => a.items.length)).toEqual([10, 50]);
  });
});

describe('seedCoreAssessments', () => {
  const makePrisma = (existing: Record<string, { total_questions: number; _count: { questions: number } } | null>) => ({
    assessment: {
      findUnique: jest.fn(async ({ where }: any) => existing[where.slug_version.slug] ?? null),
      create: jest.fn(async () => ({})),
    },
  });

  it('creates both assessments, locked, with every question when none exist', async () => {
    const prisma: any = makePrisma({});

    const result = await seedCoreAssessments(prisma);

    expect(result.created).toEqual(['ocean-snapshot', 'ocean-full']);
    const calls = prisma.assessment.create.mock.calls.map(([arg]: any) => arg.data);
    expect(calls.every((d: any) => d.is_locked === true && d.published_at instanceof Date)).toBe(true);
    expect(calls.map((d: any) => d.questions.create.length)).toEqual([10, 50]);
    expect(calls[1].questions.create[0]).toMatchObject({ question_number: 1, ocean_trait: 'extraversion', ocean_direction: 'positive' });
    expect(calls[1].questions.create[1]).toMatchObject({ question_number: 2, ocean_trait: 'agreeableness', ocean_direction: 'reverse' });
  });

  it('never touches an assessment that already exists', async () => {
    const prisma: any = makePrisma({
      'ocean-snapshot': { total_questions: 10, _count: { questions: 10 } },
      'ocean-full': { total_questions: 50, _count: { questions: 50 } },
    });

    const result = await seedCoreAssessments(prisma);

    expect(result).toEqual({ created: [], existing: ['ocean-snapshot', 'ocean-full'], mismatched: [] });
    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });

  it('flags, but does not alter, an existing assessment whose questions differ from the catalogue', async () => {
    const prisma: any = makePrisma({
      'ocean-snapshot': { total_questions: 10, _count: { questions: 10 } },
      'ocean-full': { total_questions: 50, _count: { questions: 48 } },
    });

    const result = await seedCoreAssessments(prisma);

    expect(result.mismatched).toEqual(['ocean-full']);
    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });
});
