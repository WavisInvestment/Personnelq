import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { InsightsService } from "./insights.service";
import { validInsights } from "./insights.test-helpers";

const USER = "u1";
const row = (over: object = {}) => ({
  id: "res-1",
  user_id: USER,
  ai_interpretation: null,
  ai_generated_at: null,
  ai_model: null,
  openness_score: 82,
  conscientiousness_score: 45,
  extraversion_score: 12,
  agreeableness_score: 70,
  neuroticism_score: 66,
  assessment: { type: "full_assessment" },
  ...over,
});

function setup(
  claude: Partial<{
    isConfigured: () => boolean;
    complete: jest.Mock;
    model: string;
  }> = {},
) {
  const prisma: any = {
    assessmentResult: {
      findFirst: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
  };
  const client = {
    isConfigured: jest.fn(() => true),
    model: "claude-sonnet-5-5",
    complete: jest.fn().mockResolvedValue(JSON.stringify(validInsights())),
    ...claude,
  };
  return {
    prisma,
    client,
    service: new InsightsService(prisma, client as any),
  };
}

describe("InsightsService", () => {
  it("404s for a result that is not the caller’s", async () => {
    const { service, prisma } = setup();
    prisma.assessmentResult.findFirst.mockResolvedValue(null);
    await expect(
      service.getOrGenerate("intruder", "res-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      prisma.assessmentResult.findFirst.mock.calls[0][0].where,
    ).toMatchObject({ id: "res-1", user_id: "intruder" });
  });

  it("refuses a result that is neither a snapshot nor a full assessment", async () => {
    const { service, prisma, client } = setup();
    prisma.assessmentResult.findFirst.mockResolvedValue(
      row({ assessment: { type: "custom_assessment" } }),
    );
    const error: any = await service
      .getOrGenerate(USER, "res-1")
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().code).toBe("INSIGHTS_NOT_AVAILABLE");
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("writes a short analysis for the free snapshot, with its own three sections, and saves it", async () => {
    const { service, prisma, client } = setup();
    prisma.assessmentResult.findFirst.mockResolvedValue(
      row({ assessment: { type: "free_snapshot" } }),
    );
    const part = { summary: "A short summary that is long enough to pass.", points: ["First point here", "Second point here"] };
    client.complete.mockResolvedValue(JSON.stringify({ personality: part, strengths: part, recommendations: part }));
    const out = await service.getOrGenerate(USER, "res-1");
    expect(Object.keys(out.insights)).toEqual(["personality", "strengths", "recommendations"]);
    expect(client.complete.mock.calls[0][0]).toMatch(/quick 10-question/);
    expect(prisma.assessmentResult.updateMany).toHaveBeenCalled();
  });

  it("returns saved insights without calling Claude again (generated once, free to re-open)", async () => {
    const { service, prisma, client } = setup();
    prisma.assessmentResult.findFirst.mockResolvedValue(
      row({
        ai_interpretation: JSON.stringify(validInsights()),
        ai_generated_at: new Date("2026-10-01"),
        ai_model: "claude-x",
      }),
    );

    const out = await service.getOrGenerate(USER, "res-1");

    expect(out.model).toBe("claude-x");
    expect(Object.keys(out.insights)).toHaveLength(8);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("answers 503 AI_UNAVAILABLE when Claude is not configured, without trying", async () => {
    const { service, client } = setup({ isConfigured: () => false });
    const error: any = await service
      .getOrGenerate(USER, "res-1")
      .catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse().code).toBe("AI_UNAVAILABLE");
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("generates, validates, and saves insights with the model and time", async () => {
    const { service, prisma, client } = setup();

    const out = await service.getOrGenerate(USER, "res-1");

    expect(Object.keys(out.insights)).toHaveLength(8);
    expect(client.complete).toHaveBeenCalledTimes(1);
    const saved = prisma.assessmentResult.updateMany.mock.calls[0][0];
    expect(saved.where).toEqual({ id: "res-1", ai_interpretation: null }); // compare-and-set: never overwrite
    expect(JSON.parse(saved.data.ai_interpretation)).toEqual(validInsights());
    expect(saved.data.ai_model).toBe("claude-sonnet-5-5");
    expect(saved.data.ai_generated_at).toBeInstanceOf(Date);
  });

  it("sends only scores to Claude: nothing about who the person is", async () => {
    const { service, client } = setup();
    await service.getOrGenerate(USER, "res-1");
    const [system, user] = client.complete.mock.calls[0];
    expect(user).toContain("82/100");
    expect(`${system}${user}`).not.toMatch(/u1|res-1|@/);
  });

  it("retries once when the first reply is not usable, telling Claude what was wrong", async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce("Sure! Here is a reading.")
      .mockResolvedValueOnce(JSON.stringify(validInsights()));
    const { service } = setup({ complete });

    const out = await service.getOrGenerate(USER, "res-1");

    expect(Object.keys(out.insights)).toHaveLength(8);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][1]).toContain("could not be used");
  });

  it("gives up with 502 after two unusable replies and saves nothing", async () => {
    const complete = jest
      .fn()
      .mockResolvedValue("I am unable to produce JSON.");
    const { service, prisma } = setup({ complete });

    const error: any = await service
      .getOrGenerate(USER, "res-1")
      .catch((e) => e);

    expect(error.getStatus()).toBe(502);
    expect(error.getResponse().code).toBe("AI_ERROR");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(prisma.assessmentResult.updateMany).not.toHaveBeenCalled();
  });

  it("turns an API failure into 502 without leaking the provider’s error text", async () => {
    const complete = jest
      .fn()
      .mockRejectedValue(new Error("401 invalid x-api-key sk-ant-secretvalue"));
    const { service } = setup({ complete });
    const error: any = await service
      .getOrGenerate(USER, "res-1")
      .catch((e) => e);
    expect(error.getStatus()).toBe(502);
    expect(JSON.stringify(error.getResponse())).not.toMatch(/sk-ant|x-api-key/);
  });

  it("shares one call between simultaneous requests for the same result", async () => {
    let release: (v: string) => void = () => undefined;
    const complete = jest
      .fn()
      .mockReturnValue(new Promise<string>((r) => (release = r)));
    const { service } = setup({ complete });

    const first = service.getOrGenerate(USER, "res-1");
    const second = service.getOrGenerate(USER, "res-1");
    await new Promise((r) => setImmediate(r));
    release(JSON.stringify(validInsights()));
    const [a, b] = await Promise.all([first, second]);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("keeps the winner’s insights if another server saved first", async () => {
    const { service, prisma } = setup();
    prisma.assessmentResult.updateMany.mockResolvedValue({ count: 0 });
    const winning = validInsights({
      personality: {
        summary: "The summary that was saved first by someone else.",
        points: ["One saved point", "Two saved points"],
      },
    });
    prisma.assessmentResult.findUnique.mockResolvedValue({
      ai_interpretation: JSON.stringify(winning),
      ai_generated_at: new Date(),
      ai_model: "m",
    });

    const out = await service.getOrGenerate(USER, "res-1");

    expect(out.insights.personality.summary).toContain("saved first");
  });

  it("can try again after a failure (a failed job is not cached)", async () => {
    const complete = jest
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(JSON.stringify(validInsights()));
    const { service } = setup({ complete });
    await expect(service.getOrGenerate(USER, "res-1")).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.getOrGenerate(USER, "res-1")).resolves.toMatchObject({
      model: "claude-sonnet-5-5",
    });
  });
});
