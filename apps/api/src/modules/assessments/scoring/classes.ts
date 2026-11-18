import { Trait } from '../catalog/ocean-items';

/*
 * Personality classes: eight profiles, each with a code (CL-01 to CL-08). A person is placed in the class whose typical shape is closest to their
 * five scores. Classes describe a style, never a rank: none is "higher" than another, and each has other classes it
 * tends to work well with. Tiers are a separate thing: a progress step for how much of the product someone has used.
 */

/** A class is known by its code, CL-01 to CL-08: the same code is used in the API, the data and what people see. */
export type ClassKey = 'CL-01' | 'CL-02' | 'CL-03' | 'CL-04' | 'CL-05' | 'CL-06' | 'CL-07' | 'CL-08';

export interface PersonalityClass {
  key: ClassKey;
  name: string;
  tagline: string;
  description: string;
  strengths: [string, string, string];
  /** What to keep an eye on, framed kindly. */
  watch: string;
  /** What a good match looks like for this class, and which classes tend to be one. */
  pairs_note: string;
  pairs_with: [ClassKey, ClassKey, ClassKey];
  /** Typical scores, 0 to 100, in order: openness, conscientiousness, extraversion, agreeableness, neuroticism. */
  shape: [number, number, number, number, number];
}

export const CLASSES: PersonalityClass[] = [
  {
    key: 'CL-01',
    name: 'CL-01',
    tagline: 'Curious, energetic, first through the door.',
    description: 'You go looking for new ground and bring people with you. Ideas, travel and change feed you more than routine does.',
    strengths: ['Spots possibilities early', 'Brings energy to a new start', 'Comfortable with uncertainty'],
    watch: 'Follow-through on the small, repeating work can slip once the novelty fades.',
    pairs_note: 'Does best next to people who turn big ideas into steady progress.',
    pairs_with: ['CL-03', 'CL-02', 'CL-08'],
    shape: [80, 45, 80, 60, 30],
  },
  {
    key: 'CL-02',
    name: 'CL-02',
    tagline: 'Plans the system, then builds it well.',
    description: 'You like understanding how things fit together and doing them properly. You think before you commit, and you finish what you design.',
    strengths: ['Thinks problems through end to end', 'Reliable standards of quality', 'Calm focus on hard problems'],
    watch: 'Quiet work can go unseen. Saying what you are thinking early helps others keep up.',
    pairs_note: 'Does best next to people who bring energy and take the work to an audience.',
    pairs_with: ['CL-04', 'CL-01', 'CL-05'],
    shape: [78, 82, 32, 45, 32],
  },
  {
    key: 'CL-03',
    name: 'CL-03',
    tagline: 'Steady hands, warm heart, a team’s centre.',
    description: 'You are dependable and kind, the person others lean on when things get hard. You keep promises and keep your head.',
    strengths: ['Consistent under pressure', 'Builds trust quickly', 'Keeps a group organised and calm'],
    watch: 'You may carry more than your share. It is fine to say when you are full.',
    pairs_note: 'Does best next to people who stretch the group toward new things.',
    pairs_with: ['CL-01', 'CL-04', 'CL-06'],
    shape: [45, 82, 50, 75, 25],
  },
  {
    key: 'CL-04',
    name: 'CL-04',
    tagline: 'Lights up a room and a project.',
    description: 'You are lively, generous and quick to connect. You turn a quiet room into a conversation and an idea into a plan people want to join.',
    strengths: ['Easy, warm communication', 'Raises the mood of a team', 'Moves fast from idea to action'],
    watch: 'Structure and the last ten per cent of a task may need a deliberate system.',
    pairs_note: 'Does best next to people who bring depth, order and follow-through.',
    pairs_with: ['CL-02', 'CL-03', 'CL-06'],
    shape: [72, 32, 88, 72, 48],
  },
  {
    key: 'CL-05',
    name: 'CL-05',
    tagline: 'Looks after people and the way things are done.',
    description: 'You care about doing right by others and keep things running with quiet consistency. Fairness and good habits matter to you.',
    strengths: ['Thoughtful about other people’s needs', 'Dependable routines', 'Patient with detail and process'],
    watch: 'Change can feel unsettling. Small trial steps often help more than big leaps.',
    pairs_note: 'Does best next to people who push for momentum and fresh ideas.',
    pairs_with: ['CL-07', 'CL-01', 'CL-06'],
    shape: [40, 72, 38, 82, 52],
  },
  {
    key: 'CL-06',
    name: 'CL-06',
    tagline: 'Sees what others miss.',
    description: 'You watch, listen and think before you speak. Your insight is deep and your judgement considered, and you prefer substance to noise.',
    strengths: ['Notices detail and patterns', 'Independent, thoughtful judgement', 'Listens well one to one'],
    watch: 'Good ideas can stay in your head. Sharing a rough version early often pays off.',
    pairs_note: 'Does best next to people who draw you out and give you space to think.',
    pairs_with: ['CL-04', 'CL-05', 'CL-08'],
    shape: [68, 58, 18, 48, 50],
  },
  {
    key: 'CL-07',
    name: 'CL-07',
    tagline: 'Drives results and gets things moving.',
    description: 'You are direct, focused and at your best when there is a target. You make decisions, set the pace and hold yourself to a high bar.',
    strengths: ['Decisive under pressure', 'Clear about goals and standards', 'Energises action'],
    watch: 'Pace and directness can leave others behind. A moment to check in goes a long way.',
    pairs_note: 'Does best next to people who bring care, patience and a view of the people side.',
    pairs_with: ['CL-05', 'CL-08', 'CL-06'],
    shape: [55, 70, 82, 32, 28],
  },
  {
    key: 'CL-08',
    name: 'CL-08',
    tagline: 'Reads the room and cares how it feels.',
    description: 'You pick up on how people are really doing and respond with real care. You feel things deeply, which makes you perceptive and trusted.',
    strengths: ['Understands people quickly', 'Creates safety for honest talk', 'Imaginative and perceptive'],
    watch: 'Strong feelings can be tiring. Rest and clear boundaries protect your energy.',
    pairs_note: 'Does best next to people who are steady and who help you act on what you notice.',
    pairs_with: ['CL-01', 'CL-07', 'CL-06'],
    shape: [62, 48, 52, 88, 68],
  },
];

export const CLASS_BY_KEY: Record<ClassKey, PersonalityClass> = Object.fromEntries(CLASSES.map((c) => [c.key, c])) as Record<ClassKey, PersonalityClass>;

const ORDER: Trait[] = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

/** The class whose typical shape is nearest to these five scores (straight-line distance). */
export function classify(scores: Record<Trait, number>): PersonalityClass {
  let best = CLASSES[0];
  let bestDistance = Infinity;
  for (const c of CLASSES) {
    const d = ORDER.reduce((sum, trait, i) => sum + (scores[trait] - c.shape[i]) ** 2, 0);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

/** What a viewer needs to show a class: the text, and who it tends to work well with. */
export function classView(c: PersonalityClass) {
  return {
    key: c.key,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    strengths: c.strengths,
    watch: c.watch,
    pairs_note: c.pairs_note,
    pairs_with: c.pairs_with.map((k) => ({ key: k, name: CLASS_BY_KEY[k].name, tagline: CLASS_BY_KEY[k].tagline })),
  };
}

export type ClassView = ReturnType<typeof classView>;

/** How well two classes tend to work together: a pair that lists each other, a pair that lists one way, or neither. */
export function compatibility(a: ClassKey, b: ClassKey): 'strong' | 'good' | 'different_style' {
  const ab = CLASS_BY_KEY[a].pairs_with.includes(b);
  const ba = CLASS_BY_KEY[b].pairs_with.includes(a);
  return ab && ba ? 'strong' : ab || ba ? 'good' : 'different_style';
}

/* ------------------------------------------------------------------------------------------------- tiers */

export interface Tier {
  key: 'explorer' | 'insight' | 'evolving';
  name: string;
  step: 1 | 2 | 3;
  of: 3;
  description: string;
  next: string | null;
}

/** A progress step, not a ranking: how far someone has taken their profile. */
export function tierFor(counts: { snapshots: number; fulls: number }): Tier | null {
  if (counts.fulls >= 2) {
    return { key: 'evolving', name: 'Evolving', step: 3, of: 3, description: 'You have measured yourself more than once, so you can see how you change.', next: null };
  }
  if (counts.fulls === 1) {
    return { key: 'insight', name: 'Insight', step: 2, of: 3, description: 'You have a full profile with a detailed reading.', next: 'Take the full assessment again after a few months to see how you have changed.' };
  }
  if (counts.snapshots >= 1) {
    return { key: 'explorer', name: 'Explorer', step: 1, of: 3, description: 'You have taken your first look.', next: 'Take the full assessment for a detailed reading and your full class profile.' };
  }
  return null;
}
