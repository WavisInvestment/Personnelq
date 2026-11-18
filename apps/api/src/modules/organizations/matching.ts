import { ClassKey, compatibility } from '../assessments/scoring/classes';

/*
 * Auto-matching: suggests who could pair up (a buddy, a mentor, a project partner) from the personality classes of the
 * people who have finished. It scores every possible pair by how well their classes tend to work together and builds
 * the set of pairs with the best total. A suggestion only: nothing is saved and nobody is notified.
 */

export type Fit = 'strong' | 'good' | 'same_class' | 'different_style';

const WEIGHT: Record<Fit, number> = { strong: 4, good: 3, same_class: 2, different_style: 1 };

export const fitBetween = (a: ClassKey, b: ClassKey): Fit => (a === b ? 'same_class' : compatibility(a, b));

export interface MatchPerson {
  user_id: string;
  name: string;
  department: string | null;
  class_key: ClassKey;
  class_name: string;
}

export interface MatchGroup {
  members: MatchPerson[];
  /** How the first two members' classes fit. */
  fit: Fit;
  /** Set when an odd number of people left one more: they join the group they fit best, so nobody is left out. */
  joined_by?: { person: MatchPerson; fits: Fit[] };
}

export interface MatchResult {
  groups: MatchGroup[];
  /** Total of the pair scores, only useful for comparing one result with another. */
  score: number;
}

/** A small seeded random generator, so the same seed always gives the same suggestion and a new seed gives another. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function matchPeople(people: MatchPerson[], opts: { crossDepartment: boolean; seed: number }): MatchResult {
  const n = people.length;
  if (n < 2) return { groups: [], score: 0 };

  const weight = (i: number, j: number) => {
    const p = people[i];
    const q = people[j];
    const bonus = opts.crossDepartment && p.department && q.department && p.department.toLowerCase() !== q.department.toLowerCase() ? 0.5 : 0;
    return WEIGHT[fitBetween(p.class_key, q.class_key)] + bonus;
  };

  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j, weight(i, j)]);

  // Greedy matching from the best pair down, repeated a few times with some randomness; keep the best total.
  // A few restarts (not hundreds) keeps the suggestions good but lets a new seed give a genuinely different set.
  // ponytail: randomised greedy, not an exact maximum matching. Upgrade to blossom matching if exactness ever matters.
  const random = rng(opts.seed);
  const restarts = 3;
  let best: { pairs: [number, number][]; score: number } = { pairs: [], score: -1 };
  for (let r = 0; r < restarts; r++) {
    const ranked = edges.map((e) => ({ e, key: e[2] + random() * 0.9 })).sort((x, y) => y.key - x.key);
    const used = new Set<number>();
    const pairs: [number, number][] = [];
    let score = 0;
    for (const { e } of ranked) {
      if (used.has(e[0]) || used.has(e[1])) continue;
      used.add(e[0]);
      used.add(e[1]);
      pairs.push([e[0], e[1]]);
      score += e[2];
      if (used.size >= n - 1) break;
    }
    if (score > best.score) best = { pairs, score };
  }

  const matched = new Set(best.pairs.flat());
  const groups: MatchGroup[] = best.pairs.map(([i, j]) => ({ members: [people[i], people[j]], fit: fitBetween(people[i].class_key, people[j].class_key) }));

  // An odd person out joins the pair they fit best with.
  const leftover = people.findIndex((_, i) => !matched.has(i));
  if (leftover >= 0 && best.pairs.length > 0) {
    let target = 0;
    let top = -1;
    best.pairs.forEach(([i, j], g) => {
      const total = weight(leftover, i) + weight(leftover, j);
      if (total > top) {
        top = total;
        target = g;
      }
    });
    const [i, j] = best.pairs[target];
    groups[target].joined_by = { person: people[leftover], fits: [fitBetween(people[leftover].class_key, people[i].class_key), fitBetween(people[leftover].class_key, people[j].class_key)] };
  }

  // Best fits first, so the list reads from the strongest matches down.
  groups.sort((a, b) => WEIGHT[b.fit] - WEIGHT[a.fit] || a.members[0].name.localeCompare(b.members[0].name));
  return { groups, score: Math.round(best.score * 10) / 10 };
}
