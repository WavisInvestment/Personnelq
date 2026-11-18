import { z } from "zod";

/** The eight areas the written insights cover, in the order they are shown. */
export const INSIGHT_SECTIONS = [
  "personality",
  "communication",
  "leadership",
  "working_style",
  "relationship_style",
  "strengths",
  "blind_spots",
  "recommendations",
] as const;

export type InsightSectionKey = (typeof INSIGHT_SECTIONS)[number];

export const INSIGHT_TITLES: Record<InsightSectionKey, string> = {
  personality: "Your personality",
  communication: "How you communicate",
  leadership: "How you lead",
  working_style: "How you work",
  relationship_style: "How you relate to others",
  strengths: "Your strengths",
  blind_spots: "Possible blind spots",
  recommendations: "Where to go from here",
};

const sectionSchema = z.object({
  summary: z.string().trim().min(20).max(900),
  points: z.array(z.string().trim().min(5).max(300)).min(2).max(5),
});

export const insightsSchema = z.object(
  Object.fromEntries(
    INSIGHT_SECTIONS.map((key) => [key, sectionSchema]),
  ) as Record<InsightSectionKey, typeof sectionSchema>,
);

export type Insights = z.infer<typeof insightsSchema>;

/** The free snapshot gets a short, whole-person analysis: no dimension-by-dimension breakdown. */
export const SNAPSHOT_SECTIONS = [
  "personality",
  "strengths",
  "recommendations",
] as const;

export const SNAPSHOT_TITLES: Record<
  (typeof SNAPSHOT_SECTIONS)[number],
  string
> = {
  personality: "Your first read",
  strengths: "What you do well",
  recommendations: "Where to go from here",
};

export const snapshotSchema = z.object(
  Object.fromEntries(
    SNAPSHOT_SECTIONS.map((key) => [key, sectionSchema]),
  ) as Record<(typeof SNAPSHOT_SECTIONS)[number], typeof sectionSchema>,
);

export type SnapshotInsights = z.infer<typeof snapshotSchema>;

/** Reads the short analysis saved on a free snapshot result. Null for missing or malformed data. */
export function parseStoredSnapshot(
  stored: string | null | undefined,
): SnapshotInsights | null {
  if (!stored) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Reads insights saved on a result. Returns null for missing or malformed data instead of throwing. */
export function parseStoredInsights(
  stored: string | null | undefined,
): Insights | null {
  if (!stored) return null;
  try {
    const parsed = insightsSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
