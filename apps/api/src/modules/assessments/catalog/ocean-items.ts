/*
 * The official Big Five (OCEAN) item set.
 *
 * Items are the IPIP Big-Five factor markers (International Personality Item Pool, ipip.ori.org),
 * which are in the public domain. Ten items per trait; "reverse" items are scored 6 - answer.
 * Changing any of this means publishing a new assessment version, never editing the old one.
 */

export type Trait = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';

export const TRAITS: Trait[] = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

export interface OceanItem {
  /** Stable id such as E1, A4: first letter is the trait, number is the item within that trait. */
  id: string;
  trait: Trait;
  text: string;
  reverse: boolean;
}

const item = (id: string, trait: Trait, text: string, reverse = false): OceanItem => ({ id, trait, text, reverse });

const E: OceanItem[] = [
  item('E1', 'extraversion', 'I am the life of the party.'),
  item('E2', 'extraversion', 'I don’t talk a lot.', true),
  item('E3', 'extraversion', 'I feel comfortable around people.'),
  item('E4', 'extraversion', 'I keep in the background.', true),
  item('E5', 'extraversion', 'I start conversations.'),
  item('E6', 'extraversion', 'I have little to say.', true),
  item('E7', 'extraversion', 'I talk to a lot of different people at parties.'),
  item('E8', 'extraversion', 'I don’t like to draw attention to myself.', true),
  item('E9', 'extraversion', 'I don’t mind being the center of attention.'),
  item('E10', 'extraversion', 'I am quiet around strangers.', true),
];

const A: OceanItem[] = [
  item('A1', 'agreeableness', 'I feel little concern for others.', true),
  item('A2', 'agreeableness', 'I am interested in people.'),
  item('A3', 'agreeableness', 'I insult people.', true),
  item('A4', 'agreeableness', 'I sympathize with others’ feelings.'),
  item('A5', 'agreeableness', 'I am not interested in other people’s problems.', true),
  item('A6', 'agreeableness', 'I have a soft heart.'),
  item('A7', 'agreeableness', 'I am not really interested in others.', true),
  item('A8', 'agreeableness', 'I take time out for others.'),
  item('A9', 'agreeableness', 'I feel others’ emotions.'),
  item('A10', 'agreeableness', 'I make people feel at ease.'),
];

const C: OceanItem[] = [
  item('C1', 'conscientiousness', 'I am always prepared.'),
  item('C2', 'conscientiousness', 'I leave my belongings around.', true),
  item('C3', 'conscientiousness', 'I pay attention to details.'),
  item('C4', 'conscientiousness', 'I make a mess of things.', true),
  item('C5', 'conscientiousness', 'I get chores done right away.'),
  item('C6', 'conscientiousness', 'I often forget to put things back in their proper place.', true),
  item('C7', 'conscientiousness', 'I like order.'),
  item('C8', 'conscientiousness', 'I shirk my duties.', true),
  item('C9', 'conscientiousness', 'I follow a schedule.'),
  item('C10', 'conscientiousness', 'I am exacting in my work.'),
];

const N: OceanItem[] = [
  item('N1', 'neuroticism', 'I get stressed out easily.'),
  item('N2', 'neuroticism', 'I am relaxed most of the time.', true),
  item('N3', 'neuroticism', 'I worry about things.'),
  item('N4', 'neuroticism', 'I seldom feel blue.', true),
  item('N5', 'neuroticism', 'I am easily disturbed.'),
  item('N6', 'neuroticism', 'I get upset easily.'),
  item('N7', 'neuroticism', 'I change my mood a lot.'),
  item('N8', 'neuroticism', 'I have frequent mood swings.'),
  item('N9', 'neuroticism', 'I get irritated easily.'),
  item('N10', 'neuroticism', 'I often feel blue.'),
];

const O: OceanItem[] = [
  item('O1', 'openness', 'I have a rich vocabulary.'),
  item('O2', 'openness', 'I have difficulty understanding abstract ideas.', true),
  item('O3', 'openness', 'I have a vivid imagination.'),
  item('O4', 'openness', 'I am not interested in abstract ideas.', true),
  item('O5', 'openness', 'I have excellent ideas.'),
  item('O6', 'openness', 'I do not have a good imagination.', true),
  item('O7', 'openness', 'I am quick to understand things.'),
  item('O8', 'openness', 'I use difficult words.'),
  item('O9', 'openness', 'I spend time reflecting on things.'),
  item('O10', 'openness', 'I am full of ideas.'),
];

/** Interleave the traits (E, A, C, N, O, E, A, ...) so a page of questions never repeats one trait. */
const interleave = (...groups: OceanItem[][]): OceanItem[] =>
  Array.from({ length: groups[0].length }, (_, i) => groups.map((g) => g[i])).flat();

/** The 50-item full assessment, in presentation order. */
export const FULL_ITEMS: OceanItem[] = interleave(E, A, C, N, O);

const byId = new Map(FULL_ITEMS.map((i) => [i.id, i]));
const pick = (...ids: string[]) => ids.map((id) => byId.get(id) as OceanItem);

/** The 10-item snapshot: two items per trait, one worded each way, drawn from the full set. */
export const SNAPSHOT_ITEMS: OceanItem[] = [
  ...pick('E1', 'A2', 'C7', 'N1', 'O3'),
  ...pick('E2', 'A1', 'C4', 'N2', 'O4'),
];

export const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
export const LIKERT_VALUES = [1, 2, 3, 4, 5];
