import {
  SNAPSHOT_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildSnapshotPrompt,
  buildRetryPrompt,
  buildUserPrompt,
  extractJson,
  parseInsightsReply,
} from "./insights.prompt";
import {
  INSIGHT_SECTIONS,
  INSIGHT_TITLES,
  parseStoredInsights,
} from "./insights.schema";
import { validInsights } from "./insights.test-helpers";

describe("insight prompts", () => {
  const scores = {
    openness: 82,
    conscientiousness: 45,
    extraversion: 12,
    agreeableness: 70.4,
    neuroticism: 66,
  };

  it("puts only the five scores and their levels in the user prompt", () => {
    const prompt = buildUserPrompt(scores);
    expect(prompt).toContain("Curiosity");
    expect(prompt).toContain("82/100, very high");
    expect(prompt).toContain("Energy");
    expect(prompt).toContain("12/100, very low");
    expect(prompt).toContain("70/100"); // rounded
    expect(prompt).toContain("Sensitivity");
    expect(prompt).not.toMatch(/Openness|Extraversion|Neuroticism|Big Five|OCEAN/);
  });

  it("carries no personal details: nothing a person could be identified by", () => {
    const prompt = buildUserPrompt(scores) + SYSTEM_PROMPT;
    expect(prompt).not.toMatch(/@|https?:|\bname\b.*:|user[_ ]?id/i);
  });

  it("tells Claude never to name the framework, in both prompts", () => {
    for (const p of [SYSTEM_PROMPT, SNAPSHOT_SYSTEM_PROMPT]) expect(p).toMatch(/never use the words "Big Five" or "OCEAN"/);
  });

  it("asks the snapshot analysis for a whole-person read, with the class, and no scores or breakdown", () => {
    expect(SNAPSHOT_SYSTEM_PROMPT).toMatch(/do not quote any scores/i);
    expect(buildSnapshotPrompt(scores)).toMatch(/profile class is "CL-0[1-8]"/);
  });

  it("tells Claude to stay non-clinical and to reply with JSON only", () => {
    expect(SYSTEM_PROMPT).toMatch(/never diagnoses|not use clinical/i);
    expect(SYSTEM_PROMPT).toMatch(/ONLY a JSON object/);
    expect(SYSTEM_PROMPT).toMatch(/no trait is good or bad/i);
    for (const key of INSIGHT_SECTIONS) expect(SYSTEM_PROMPT).toContain(key);
  });

  it("builds a retry prompt that names the problem", () => {
    expect(buildRetryPrompt('"strengths.points" too small')).toContain(
      '"strengths.points" too small',
    );
  });

  it("has a title for every section", () => {
    for (const key of INSIGHT_SECTIONS)
      expect(INSIGHT_TITLES[key]).toEqual(expect.any(String));
  });
});

describe("extractJson", () => {
  it("reads a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("tolerates a code fence or a sentence around the object", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} Hope that helps!')).toEqual({
      a: { b: 2 },
    });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(
      /no JSON object/,
    );
    expect(() => extractJson("")).toThrow();
  });
});

describe("parseInsightsReply", () => {
  it("accepts a complete, well-formed reply, including inside a code fence", () => {
    const json = JSON.stringify(validInsights());
    expect(Object.keys(parseInsightsReply(json))).toEqual([
      ...INSIGHT_SECTIONS,
    ]);
    expect(
      Object.keys(parseInsightsReply("```json\n" + json + "\n```")),
    ).toHaveLength(8);
  });

  it("rejects a reply that is not JSON, with a reason the model can act on", () => {
    expect(() => parseInsightsReply("Sure! Here is your reading.")).toThrow(
      /not valid JSON/,
    );
    expect(() => parseInsightsReply("{broken")).toThrow(/not valid JSON/);
  });

  it("rejects a reply missing a section", () => {
    const { blind_spots: _removed, ...rest } = validInsights();
    expect(() => parseInsightsReply(JSON.stringify(rest))).toThrow(
      /blind_spots/,
    );
  });

  it("rejects a section with too few points or an empty summary", () => {
    expect(() =>
      parseInsightsReply(
        JSON.stringify(
          validInsights({
            strengths: {
              summary: "A reasonable summary of the strengths here.",
              points: ["Only one point here"],
            },
          }),
        ),
      ),
    ).toThrow(/strengths/);
    expect(() =>
      parseInsightsReply(
        JSON.stringify(
          validInsights({
            leadership: {
              summary: "short",
              points: ["One point", "Two points"],
            },
          }),
        ),
      ),
    ).toThrow(/leadership/);
  });

  it("rejects absurdly long output instead of storing it", () => {
    expect(() =>
      parseInsightsReply(
        JSON.stringify(
          validInsights({
            personality: {
              summary: "x".repeat(2000),
              points: ["One point", "Two points"],
            },
          }),
        ),
      ),
    ).toThrow(/personality/);
  });

  it("ignores extra keys the model invents, keeping only the eight sections", () => {
    const reply = {
      ...validInsights(),
      medical_diagnosis: {
        summary: "x".repeat(40),
        points: ["a point", "b point"],
      },
    };
    expect(Object.keys(parseInsightsReply(JSON.stringify(reply)))).toEqual([
      ...INSIGHT_SECTIONS,
    ]);
  });
});

describe("parseStoredInsights", () => {
  it("returns saved insights, and null for anything missing or damaged", () => {
    expect(parseStoredInsights(JSON.stringify(validInsights()))).not.toBeNull();
    expect(parseStoredInsights(null)).toBeNull();
    expect(parseStoredInsights("")).toBeNull();
    expect(parseStoredInsights("{not json")).toBeNull();
    expect(parseStoredInsights('{"personality":{}}')).toBeNull();
  });
});
