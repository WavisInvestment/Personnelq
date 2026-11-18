export const TRAITS = [
  {
    key: 'openness',
    letter: 'C',
    name: 'Curiosity',
    color: '#8b7cf6',
    blurb: 'Imagination and your appetite for new ideas.',
  },
  {
    key: 'conscientiousness',
    letter: 'D',
    name: 'Discipline',
    color: '#3b8fd9',
    blurb: 'Organisation, discipline and how reliably you follow through.',
  },
  {
    key: 'extraversion',
    letter: 'E',
    name: 'Energy',
    color: '#f5a623',
    blurb: 'Where your energy comes from and how you engage with people.',
  },
  {
    key: 'agreeableness',
    letter: 'W',
    name: 'Warmth',
    color: '#ec5f87',
    blurb: 'Empathy, cooperation and how much you trust others.',
  },
  {
    key: 'neuroticism',
    letter: 'S',
    name: 'Sensitivity',
    color: '#2fb59a',
    blurb: 'How strongly you feel stress and shifts in mood.',
  },
] as const;

export type Trait = (typeof TRAITS)[number];
