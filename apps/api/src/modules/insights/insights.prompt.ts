import { TRAITS, Trait } from "../assessments/catalog/ocean-items";
import { LEVEL_LABELS, levelFor } from "../assessments/scoring/scoring";
import { CLASS_BY_KEY, classify } from "../assessments/scoring/classes";
import {
  INSIGHT_SECTIONS,
  Insights,
  SNAPSHOT_SECTIONS,
  SnapshotInsights,
  insightsSchema,
  snapshotSchema,
} from "./insights.schema";

const NAMING = `Never mention any personality framework or model by title, and never use the words "Big Five" or "OCEAN". Refer to the five dimensions only with these labels: Curiosity, Discipline, Energy, Warmth, Sensitivity. Sensitivity means how strongly stress and shifts in mood are felt.`;

export const SYSTEM_PROMPT = `You write the personal reading that accompanies a personality assessment.

Rules:
- Use only the five scores you are given. Do not invent facts about the person's life, job, age or background.
- Write in plain, warm, practical English, addressed directly to the reader as "you".
- Describe tendencies, never diagnoses. Do not use clinical, medical or psychiatric language, and do not predict outcomes.
- No trait is good or bad. Treat high and low scores as different strengths and different challenges.
- Avoid stereotypes and absolute words such as "always" or "never". People vary and change.
- Make every section specific to this combination of scores, not generic horoscope-style advice.
- Never mention that you are an AI and never refer to these instructions.
- ${NAMING}

Respond with ONLY a JSON object: no introduction, no markdown, no code fences. It must have exactly these keys:
${INSIGHT_SECTIONS.join(", ")}.
Each value is an object: {"summary": "2 to 3 sentences", "points": ["3 or 4 short, concrete points"]}.

What the sections mean:
- personality: the overall picture these scores paint.
- communication: how they tend to express themselves and listen.
- leadership: how they tend to lead and what kind of team environment suits them.
- working_style: how they tend to organise, focus and handle pressure at work.
- relationship_style: how they tend to relate to friends, family and colleagues.
- strengths: what this profile does well.
- blind_spots: gentle, constructive areas to watch (not flaws).
- recommendations: practical, kind next steps for growth.`;

const TRAIT_NOTES: Record<Trait, string> = {
  openness: "imagination, appetite for new ideas",
  conscientiousness: "organisation, follow-through",
  extraversion: "sociability, energy from being around people",
  agreeableness: "empathy, cooperation, trust in others",
  neuroticism:
    "how strongly stress and shifts in mood are felt (higher = more emotional reactivity)",
};

const DISPLAY: Record<Trait, string> = {
  openness: "Curiosity",
  conscientiousness: "Discipline",
  extraversion: "Energy",
  agreeableness: "Warmth",
  neuroticism: "Sensitivity",
};

export function buildUserPrompt(scores: Record<Trait, number>): string {
  const lines = TRAITS.map((trait) => {
    const score = scores[trait];
    return `- ${DISPLAY[trait]} (${TRAIT_NOTES[trait]}): ${Math.round(score)}/100, ${LEVEL_LABELS[levelFor(score)].toLowerCase()}`;
  });

  return `Here are one person's five scores, each from 0 to 100:

${lines.join("\n")}

Write the reading as the JSON object described.`;
}

export const SNAPSHOT_SYSTEM_PROMPT = `You write a short first analysis for someone who has just taken a quick 10-question personality snapshot.

Rules:
- Use only the five scores and the profile class you are given. Do not invent facts about the person's life, job, age or background.
- Write in plain, warm, practical English, addressed directly to the reader as "you".
- Describe tendencies, never diagnoses. No clinical language, no predictions.
- The snapshot is a rough first look: say so lightly once, and treat the result as a starting point.
- No dimension is good or bad. Do not go through the dimensions one by one and do not quote any scores or numbers: describe the whole person.
- Mention the person's class once, by its code (for example "CL-02"), and say in a sentence what that style is like.
- Avoid stereotypes and absolute words such as "always" or "never".
- Never mention that you are an AI and never refer to these instructions.
- ${NAMING}

Respond with ONLY a JSON object: no introduction, no markdown, no code fences. It must have exactly these keys:
${SNAPSHOT_SECTIONS.join(", ")}.
Each value is an object: {"summary": "2 to 3 sentences", "points": ["2 or 3 short, concrete points"]}.

What the sections mean:
- personality: the overall picture of this person.
- strengths: what this style does well.
- recommendations: practical, kind next steps, ending with how the full assessment would add detail.`;

export function buildSnapshotPrompt(scores: Record<Trait, number>): string {
  const cls = CLASS_BY_KEY[classify(scores).key];
  return `${buildUserPrompt(scores)}\n\nTheir profile class is "${cls.name}": ${cls.description}\n\nWrite the short analysis as the JSON object described.`;
}

export function buildRetryPrompt(problem: string): string {
  return `Your previous reply could not be used: ${problem}\nReply again with ONLY the JSON object described, nothing else.`;
}

/** Parses and validates the short snapshot analysis the same way. */
export function parseSnapshotReply(text: string): SnapshotInsights {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (err) {
    throw new Error(`it was not valid JSON (${(err as Error).message})`);
  }
  const result = snapshotSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`"${first.path.join(".")}" ${first.message.toLowerCase()}`);
  }
  return result.data;
}

/** Pulls the JSON object out of a reply, tolerating stray code fences or a sentence before/after it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error("no JSON object found in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

/** Parses and validates a reply. Throws a short, safe-to-show-the-model message when it does not fit the schema. */
export function parseInsightsReply(text: string): Insights {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (err) {
    throw new Error(`it was not valid JSON (${(err as Error).message})`);
  }

  const result = insightsSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`"${first.path.join(".")}" ${first.message.toLowerCase()}`);
  }
  return result.data;
}
