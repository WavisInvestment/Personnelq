import { NO_DEPARTMENT, byDepartment, distribution, evolution, trendOf } from './stats';

const s = (o: number, c = 50, e = 50, a = 50, n = 50) => ({ openness: o, conscientiousness: c, extraversion: e, agreeableness: a, neuroticism: n });

describe('distribution', () => {
  it('counts low / medium / high per trait and averages', () => {
    const d = distribution([
      { department: null, scores: s(90) },
      { department: null, scores: s(50) },
      { department: null, scores: s(10) },
      { department: null, scores: s(70) },
    ]);
    const o = d.find((x) => x.trait === 'openness')!;
    expect(o).toMatchObject({ low: 1, medium: 1, high: 2, high_pct: 50, average: 55 });
  });

  it('is calm about an empty team', () => {
    const d = distribution([]);
    expect(d).toHaveLength(5);
    expect(d[0]).toMatchObject({ average: null, low: 0, medium: 0, high: 0, high_pct: 0 });
  });
});

describe('byDepartment', () => {
  it('groups, counts finishers only in averages, and names the unset department', () => {
    const rows = byDepartment([
      { department: 'Sales', completed: true, scores: s(80) },
      { department: ' Sales ', completed: true, scores: s(60) },
      { department: 'Sales', completed: false, scores: null },
      { department: null, completed: true, scores: s(30) },
    ]);
    expect(rows[0]).toMatchObject({ department: 'Sales', members: 3, completed: 2 });
    expect(rows[0].averages.openness).toBe(70);
    expect(rows[1]).toMatchObject({ department: NO_DEPARTMENT, members: 1, completed: 1 });
  });

  it('treats different capitals and spacing as one department, showing the first spelling seen', () => {
    const rows = byDepartment([
      { department: 'Marketing', completed: true, scores: s(80) },
      { department: 'MARKETING', completed: true, scores: s(60) },
      { department: '  marketing  ', completed: false, scores: null },
      { department: 'Customer   Care', completed: false, scores: null },
      { department: 'customer care', completed: false, scores: null },
    ]);
    expect(rows.map((r) => [r.department, r.members, r.completed])).toEqual([['Marketing', 3, 2], ['Customer Care', 2, 0]]);
    expect(rows[0].averages.openness).toBe(70);
  });

  it('leaves an average null when nobody in the group finished', () => {
    expect(byDepartment([{ department: 'Ops', completed: false, scores: null }])[0].averages.openness).toBeNull();
  });
});

describe('evolution', () => {
  it('needs two attempts', () => {
    expect(evolution([])).toBeNull();
    expect(evolution([{ scores: s(50) }])).toBeNull();
  });

  it('compares first and latest and labels the direction', () => {
    const e = evolution([{ scores: s(40, 50, 50, 50, 70) }, { scores: s(55) }, { scores: s(60, 52, 50, 50, 55) }])!;
    expect(e.openness).toEqual({ from: 40, to: 60, delta: 20, trend: 'up' });
    expect(e.neuroticism).toMatchObject({ delta: -15, trend: 'down' });
    expect(e.conscientiousness).toMatchObject({ delta: 2, trend: 'steady' });
  });

  it('treats exactly 5 points as a real move and 4.9 as noise', () => {
    expect(trendOf(5)).toBe('up');
    expect(trendOf(-5)).toBe('down');
    expect(trendOf(4.9)).toBe('steady');
  });
});
