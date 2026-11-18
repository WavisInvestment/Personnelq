import { ClassKey } from '../assessments/scoring/classes';
import { MatchPerson, fitBetween, matchPeople } from './matching';

const person = (id: string, class_key: ClassKey, department: string | null = 'Sales'): MatchPerson => ({ user_id: id, name: id, department, class_key, class_name: `The ${class_key}` });

describe('auto-matching staff by class', () => {
  it('rates a pair of classes the same way the compare tool does', () => {
    expect(fitBetween('CL-01', 'CL-03')).toBe('strong');
    expect(fitBetween('CL-03', 'CL-06')).toBe('good');
    expect(fitBetween('CL-07', 'CL-04')).toBe('different_style');
    expect(fitBetween('CL-04', 'CL-04')).toBe('same_class');
  });

  it('pairs everyone once, and prefers strong matches over weaker ones', () => {
    // two strong pairs are available: CL-01+CL-03 and CL-02+CL-04
    const out = matchPeople([person('p', 'CL-01'), person('a', 'CL-03'), person('r', 'CL-02'), person('s', 'CL-04')], { crossDepartment: false, seed: 1 });
    expect(out.groups).toHaveLength(2);
    expect(out.groups.every((g) => g.fit === 'strong')).toBe(true);
    expect(out.groups.flatMap((g) => g.members.map((m) => m.user_id)).sort()).toEqual(['a', 'p', 'r', 's']);
  });

  it('uses each person at most once and leaves nobody out when the number is odd (the extra person joins the best pair)', () => {
    const people = [person('p', 'CL-01'), person('a', 'CL-03'), person('r', 'CL-02'), person('s', 'CL-04'), person('o', 'CL-06')];
    const out = matchPeople(people, { crossDepartment: false, seed: 3 });
    expect(out.groups).toHaveLength(2);
    const ids = out.groups.flatMap((g) => [...g.members, ...(g.joined_by ? [g.joined_by.person] : [])]).map((m) => m.user_id);
    expect(ids.sort()).toEqual(['a', 'o', 'p', 'r', 's']);
    expect(out.groups.filter((g) => g.joined_by)).toHaveLength(1);
  });

  it('gives the same answer for the same seed, and can give another for a different seed', () => {
    // many equally good pairings are possible here, so a new seed can suggest another set
    const people = Array.from({ length: 12 }, (_, i) => person(`u${i}`, (['CL-04', 'CL-03', 'CL-02'] as ClassKey[])[i % 3], i % 4 < 2 ? 'Ops' : 'Sales'));
    const a = matchPeople(people, { crossDepartment: true, seed: 5 });
    expect(matchPeople(people, { crossDepartment: true, seed: 5 })).toEqual(a);
    const others = [6, 7, 8, 9, 10].map((seed) => JSON.stringify(matchPeople(people, { crossDepartment: true, seed }).groups.map((g) => g.members.map((m) => m.user_id))));
    expect(new Set([JSON.stringify(a.groups.map((g) => g.members.map((m) => m.user_id))), ...others]).size).toBeGreaterThan(1);
  });

  it('can prefer people from different departments when asked', () => {
    // identical classes everywhere, so only the department bonus can decide
    const people = [person('s1', 'CL-04', 'Sales'), person('s2', 'CL-04', 'Sales'), person('o1', 'CL-04', 'Ops'), person('o2', 'CL-04', 'Ops')];
    const mixed = matchPeople(people, { crossDepartment: true, seed: 2 });
    for (const g of mixed.groups) expect(new Set(g.members.map((m) => m.department)).size).toBe(2);
  });

  it('returns nothing for fewer than two people, and copes with a large team quickly', () => {
    expect(matchPeople([person('only', 'CL-04')], { crossDepartment: false, seed: 1 }).groups).toEqual([]);
    expect(matchPeople([], { crossDepartment: false, seed: 1 }).groups).toEqual([]);
    const keys: ClassKey[] = ['CL-01', 'CL-02', 'CL-03', 'CL-04', 'CL-05', 'CL-06', 'CL-07', 'CL-08'];
    const big = Array.from({ length: 300 }, (_, i) => person(`b${i}`, keys[i % 8], `D${i % 5}`));
    const t = Date.now();
    const out = matchPeople(big, { crossDepartment: true, seed: 1 });
    expect(out.groups).toHaveLength(150);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});
