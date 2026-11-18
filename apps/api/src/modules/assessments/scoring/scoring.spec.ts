import { FULL_ITEMS, OceanItem, SNAPSHOT_ITEMS, TRAITS } from '../catalog/ocean-items';
import { LEVEL_LABELS, ScorableQuestion, levelFor, scoreAnswers } from './scoring';

const toQuestions = (items: OceanItem[]): ScorableQuestion[] =>
  items.map((i) => ({ id: i.id, trait: i.trait, reverse: i.reverse, weight: 1, min: 1, max: 5 }));

/** Answers that express "as much of the trait as possible" (or as little), respecting reverse items. */
const answersFor = (items: OceanItem[], high: boolean) =>
  new Map(items.map((i) => [i.id, high !== i.reverse ? 5 : 1]));

const allSame = (items: OceanItem[], value: number) => new Map(items.map((i) => [i.id, value]));

describe('scoreAnswers', () => {
  it('gives 100 on every trait for the most trait-high answers', () => {
    const { traits, overall } = scoreAnswers(toQuestions(FULL_ITEMS), answersFor(FULL_ITEMS, true));
    for (const t of TRAITS) expect(traits[t]).toBe(100);
    expect(overall).toBe(100);
  });

  it('gives 0 on every trait for the most trait-low answers', () => {
    const { traits, overall } = scoreAnswers(toQuestions(FULL_ITEMS), answersFor(FULL_ITEMS, false));
    for (const t of TRAITS) expect(traits[t]).toBe(0);
    expect(overall).toBe(0);
  });

  it('gives 50 everywhere when every answer is neutral, reverse items included', () => {
    const { traits } = scoreAnswers(toQuestions(FULL_ITEMS), allSame(FULL_ITEMS, 3));
    for (const t of TRAITS) expect(traits[t]).toBe(50);
  });

  it('flips reverse items: agreeing with a reversed item lowers the trait', () => {
    // Snapshot extraversion has one forward item (E1) and one reverse item (E2).
    const q = toQuestions(SNAPSHOT_ITEMS);
    const base = allSame(SNAPSHOT_ITEMS, 3);

    const agreeWithReverse = new Map(base).set('E2', 5); // "I don't talk a lot": strongly agree
    const disagreeWithReverse = new Map(base).set('E2', 1);

    expect(scoreAnswers(q, agreeWithReverse).traits.extraversion).toBeLessThan(50);
    expect(scoreAnswers(q, disagreeWithReverse).traits.extraversion).toBeGreaterThan(50);
    // other traits are unaffected
    expect(scoreAnswers(q, agreeWithReverse).traits.openness).toBe(50);
  });

  it('is symmetric: a forward 5 and a reverse 1 contribute the same', () => {
    const q = toQuestions(SNAPSHOT_ITEMS);
    const a = scoreAnswers(q, new Map(allSame(SNAPSHOT_ITEMS, 3)).set('E1', 5));
    const b = scoreAnswers(q, new Map(allSame(SNAPSHOT_ITEMS, 3)).set('E2', 1));
    expect(a.traits.extraversion).toBe(b.traits.extraversion);
  });

  it('scores the snapshot on the same 0-100 scale', () => {
    const { traits } = scoreAnswers(toQuestions(SNAPSHOT_ITEMS), answersFor(SNAPSHOT_ITEMS, true));
    for (const t of TRAITS) expect(traits[t]).toBe(100);
  });

  it('averages the five traits equally for the overall score', () => {
    const items = FULL_ITEMS;
    const answers = answersFor(items, false);
    for (const i of items.filter((x) => x.trait === 'openness')) answers.set(i.id, i.reverse ? 1 : 5); // openness 100, rest 0
    const { traits, overall } = scoreAnswers(toQuestions(items), answers);
    expect(traits.openness).toBe(100);
    expect(overall).toBe(20);
  });

  it('respects question weights', () => {
    const questions: ScorableQuestion[] = TRAITS.flatMap((t) => [
      { id: `${t}-a`, trait: t, reverse: false, weight: 3, min: 1, max: 5 },
      { id: `${t}-b`, trait: t, reverse: false, weight: 1, min: 1, max: 5 },
    ]);
    const answers = new Map(questions.map((q) => [q.id, q.id.endsWith('-a') ? 5 : 1]));
    // heavy item at max, light item at min: (3*4 + 0) / (3*4 + 1*4) = 75%
    expect(scoreAnswers(questions, answers).traits.openness).toBe(75);
  });

  it('rounds to one decimal place', () => {
    const questions: ScorableQuestion[] = TRAITS.flatMap((t) =>
      [1, 2, 3].map((n) => ({ id: `${t}-${n}`, trait: t, reverse: false, weight: 1, min: 1, max: 5 })),
    );
    const answers = new Map(questions.map((q) => [q.id, q.id.endsWith('-1') ? 5 : 1]));
    // 4 / 12 = 33.333...
    expect(scoreAnswers(questions, answers).traits.openness).toBe(33.3);
  });

  it('refuses to score with a missing answer', () => {
    const answers = answersFor(FULL_ITEMS, true);
    answers.delete('E1');
    expect(() => scoreAnswers(toQuestions(FULL_ITEMS), answers)).toThrow(/Missing answer/);
  });

  it('refuses out-of-range and non-integer answers', () => {
    const q = toQuestions(SNAPSHOT_ITEMS);
    expect(() => scoreAnswers(q, new Map(allSame(SNAPSHOT_ITEMS, 3)).set('E1', 6))).toThrow(/out of range/);
    expect(() => scoreAnswers(q, new Map(allSame(SNAPSHOT_ITEMS, 3)).set('E1', 0))).toThrow(/out of range/);
    expect(() => scoreAnswers(q, new Map(allSame(SNAPSHOT_ITEMS, 3)).set('E1', 2.5))).toThrow(/out of range/);
  });

  it('refuses to score when a trait has no questions', () => {
    const noOpenness = toQuestions(FULL_ITEMS.filter((i) => i.trait !== 'openness'));
    const answers = allSame(FULL_ITEMS, 3);
    expect(() => scoreAnswers(noOpenness, answers)).toThrow(/No scorable questions for openness/);
  });
});

describe('levelFor', () => {
  it.each([
    [0, 'very_low'],
    [20, 'very_low'],
    [20.1, 'low'],
    [40, 'low'],
    [40.1, 'moderate'],
    [60, 'moderate'],
    [60.1, 'high'],
    [80, 'high'],
    [80.1, 'very_high'],
    [100, 'very_high'],
  ])('%s -> %s', (score, level) => {
    expect(levelFor(score)).toBe(level);
  });

  it('has a human label for every level', () => {
    expect(Object.values(LEVEL_LABELS)).toEqual(['Very low', 'Low', 'Moderate', 'High', 'Very high']);
  });
});
