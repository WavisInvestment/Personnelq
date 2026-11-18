import { CLASSES, CLASS_BY_KEY, classify, compatibility, tierFor } from './classes';

const scores = (o: number, c: number, e: number, a: number, n: number) => ({ openness: o, conscientiousness: c, extraversion: e, agreeableness: a, neuroticism: n });

describe('personality classes', () => {
  it('puts every class’s own typical shape in that class', () => {
    for (const c of CLASSES) expect(classify(scores(...c.shape)).key).toBe(c.key);
  });

  it('places a few recognisable profiles sensibly', () => {
    expect(classify(scores(85, 40, 85, 55, 30)).key).toBe('CL-01');
    expect(classify(scores(40, 85, 50, 75, 20)).key).toBe('CL-03');
    expect(classify(scores(60, 50, 50, 90, 70)).key).toBe('CL-08');
  });

  it('is deterministic and always answers, even for all-zero or all-100 scores', () => {
    expect(classify(scores(0, 0, 0, 0, 0)).key).toBe(classify(scores(0, 0, 0, 0, 0)).key);
    expect(CLASSES.map((c) => c.key)).toContain(classify(scores(100, 100, 100, 100, 100)).key);
  });

  it('has three distinct, real partner classes for each class, never itself', () => {
    for (const c of CLASSES) {
      expect(new Set(c.pairs_with).size).toBe(3);
      expect(c.pairs_with).not.toContain(c.key);
      for (const k of c.pairs_with) expect(CLASS_BY_KEY[k]).toBeDefined();
    }
  });

  it('rates a pair that lists each other as strong, one-way as good, and neither as a different style', () => {
    expect(compatibility('CL-01', 'CL-03')).toBe('strong');
    expect(compatibility('CL-03', 'CL-06')).toBe('good');
    expect(compatibility('CL-07', 'CL-04')).toBe('different_style');
  });
});

describe('tiers', () => {
  it('step up with what a person has taken, and are not a ranking of personality', () => {
    expect(tierFor({ snapshots: 0, fulls: 0 })).toBeNull();
    expect(tierFor({ snapshots: 1, fulls: 0 })).toMatchObject({ key: 'explorer', step: 1 });
    expect(tierFor({ snapshots: 1, fulls: 1 })).toMatchObject({ key: 'insight', step: 2 });
    expect(tierFor({ snapshots: 0, fulls: 2 })).toMatchObject({ key: 'evolving', step: 3, next: null });
  });
});
