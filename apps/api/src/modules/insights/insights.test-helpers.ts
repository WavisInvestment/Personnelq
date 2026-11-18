import { INSIGHT_SECTIONS, Insights } from "./insights.schema";

/** A valid set of insights for tests. */
export function validInsights(overrides: Partial<Insights> = {}): Insights {
  const base = Object.fromEntries(
    INSIGHT_SECTIONS.map((key) => [
      key,
      {
        summary: `A thoughtful two sentence summary for ${key}. It reflects the scores that were given.`,
        points: [
          `First practical point about ${key}`,
          `Second practical point about ${key}`,
          `Third practical point about ${key}`,
        ],
      },
    ]),
  ) as Insights;
  return { ...base, ...overrides };
}
