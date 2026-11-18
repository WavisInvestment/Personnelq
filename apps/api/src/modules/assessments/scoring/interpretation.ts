import { Trait } from '../catalog/ocean-items';
import { Level } from './scoring';

/*
 * Fixed interpretation text for the official assessment. It is part of the locked assessment definition:
 * the same score always reads the same way, which keeps results comparable over time.
 * (AI-written deep dives are a separate, later feature.)
 */

type Band = 'low' | 'moderate' | 'high';

const band = (level: Level): Band => (level === 'very_low' || level === 'low' ? 'low' : level === 'moderate' ? 'moderate' : 'high');

const TEXT: Record<Trait, Record<Band, string>> = {
  openness: {
    low: 'You favour the familiar and the proven. You tend to be practical and grounded, preferring concrete facts and tried methods to abstract speculation.',
    moderate:
      'You balance curiosity with practicality. You are open to new ideas when they have a clear use, and comfortable sticking with what works.',
    high: 'You are curious and imaginative, drawn to new ideas, art and unconventional ways of thinking. You likely enjoy variety and exploring possibilities.',
  },
  conscientiousness: {
    low: 'You are spontaneous and flexible, and tend to dislike rigid plans. Structure and follow-through may take deliberate effort.',
    moderate: 'You are reasonably organised and reliable, while staying flexible when plans change.',
    high: 'You are organised, dependable and disciplined. You like to plan ahead and to finish what you start.',
  },
  extraversion: {
    low: 'You are reserved and reflective, and recharge best in quieter settings. You tend to prefer smaller groups or one-to-one conversation.',
    moderate: 'You move comfortably between company and solitude, enjoying people without needing constant social energy.',
    high: 'You are outgoing and energised by people. You likely start conversations easily and enjoy lively, social settings.',
  },
  agreeableness: {
    low: 'You are direct and independent-minded, and tend to put facts or your own view ahead of keeping the peace.',
    moderate: 'You are cooperative while still willing to stand your ground when it matters.',
    high: 'You are warm, considerate and cooperative. You tend to notice how others feel and work to keep relationships harmonious.',
  },
  neuroticism: {
    low: 'You tend to stay calm under pressure and recover quickly from setbacks. Stress rarely knocks you off balance for long.',
    moderate: 'You feel stress and mood shifts at a typical level, neither unusually calm nor unusually sensitive.',
    high: 'You tend to feel stress and worry more strongly than most, and your mood can shift. The same sensitivity can make you perceptive about risks and about other people.',
  },
};

export function describeTrait(trait: Trait, level: Level): string {
  return TEXT[trait][band(level)];
}

export const RESULT_DISCLAIMER =
  'These descriptions are a starting point for reflection, not a diagnosis or a label. Your scores describe tendencies, and people change over time.';
