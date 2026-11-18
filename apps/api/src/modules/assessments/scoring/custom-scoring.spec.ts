import { buildCustomScores, CustomQuestion, CustomSection, interpretSection, parseCustomScores, scoreCustom } from './custom-scoring';

const sections: CustomSection[] = [
  { key: 's1', name: 'Teamwork', description: null, weight: 1, interpretation: { low: 'Prefers to work alone.', medium: 'Works well with others.', high: 'Thrives in teams.' } },
  { key: 's2', name: 'Initiative', description: 'Taking the first step', weight: 3, interpretation: { low: '', medium: '', high: '' } },
];
const q = (id: string, section: string, over: Partial<CustomQuestion> = {}): CustomQuestion => ({ id, section, reverse: false, weight: 1, min: 1, max: 5, ...over });
const questions = [q('a', 's1'), q('b', 's1', { reverse: true }), q('c', 's2'), q('d', 's2', { weight: 2 })];

describe('scoreCustom', () => {
  it('gives 0 for all-minimum and 100 for all-maximum answers (reverse questions flipped)', () => {
    const low = scoreCustom(sections, questions, new Map([['a', 1], ['b', 5], ['c', 1], ['d', 1]]));
    expect(low.sections.map((s) => s.score)).toEqual([0, 0]);
    expect(low.overall).toBe(0);
    const high = scoreCustom(sections, questions, new Map([['a', 5], ['b', 1], ['c', 5], ['d', 5]]));
    expect(high.sections.map((s) => s.score)).toEqual([100, 100]);
    expect(high.overall).toBe(100);
  });

  it('weights questions inside a section', () => {
    // s2: c (weight 1) = 5 -> 4 earned of 4; d (weight 2) = 1 -> 0 earned of 8. 4 / 12 = 33.3
    const r = scoreCustom(sections, questions, new Map([['a', 3], ['b', 3], ['c', 5], ['d', 1]]));
    expect(r.sections[1].score).toBe(33.3);
    expect(r.sections[0].score).toBe(50);
  });

  it('weights sections in the overall score', () => {
    // s1 = 100 (weight 1), s2 = 0 (weight 3): (100*1 + 0*3) / 4 = 25
    const r = scoreCustom(sections, questions, new Map([['a', 5], ['b', 1], ['c', 1], ['d', 1]]));
    expect(r.overall).toBe(25);
  });

  it('refuses partial or impossible input instead of guessing', () => {
    expect(() => scoreCustom(sections, questions, new Map([['a', 3]]))).toThrow(/Missing answer/);
    expect(() => scoreCustom(sections, questions, new Map([['a', 9], ['b', 3], ['c', 3], ['d', 3]]))).toThrow(/out of range/);
    expect(() => scoreCustom(sections, questions, new Map([['a', 2.5], ['b', 3], ['c', 3], ['d', 3]]))).toThrow(/out of range/);
    expect(() => scoreCustom(sections, [q('a', 's1')], new Map([['a', 3]]))).toThrow(/No scorable questions/);
    expect(() => scoreCustom(sections, [q('x', 'nope')], new Map([['x', 3]]))).toThrow(/unknown section/);
  });
});

describe('interpretation', () => {
  it('uses the administrator’s wording for the matching band', () => {
    expect(interpretSection(sections[0], 10)).toMatchObject({ band: 'low', level_label: 'Very low', text: 'Prefers to work alone.' });
    expect(interpretSection(sections[0], 50)).toMatchObject({ band: 'medium', text: 'Works well with others.' });
    expect(interpretSection(sections[0], 90)).toMatchObject({ band: 'high', text: 'Thrives in teams.' });
  });

  it('falls back to a plain sentence when no wording was written', () => {
    expect(interpretSection(sections[1], 90).text).toBe('Your score in Initiative is high.');
    expect(interpretSection(sections[1], 50).text).toBe('Your score in Initiative is in the middle range.');
  });

  it('builds the stored result with an overall level, and reads it back safely', () => {
    const stored = buildCustomScores(sections, questions, new Map([['a', 5], ['b', 1], ['c', 5], ['d', 5]]));
    expect(stored.overall).toEqual({ score: 100, level: 'very_high', level_label: 'Very high' });
    expect(stored.sections[0].text).toBe('Thrives in teams.');
    expect(parseCustomScores(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(parseCustomScores(null)).toBeNull();
    expect(parseCustomScores({ sections: 'x' })).toBeNull();
  });
});
