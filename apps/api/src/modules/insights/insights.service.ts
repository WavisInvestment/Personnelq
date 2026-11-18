import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { Trait } from "../assessments/catalog/ocean-items";
import { ClaudeClient } from "./claude.client";
import {
  SNAPSHOT_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildRetryPrompt,
  buildSnapshotPrompt,
  buildUserPrompt,
  parseInsightsReply,
  parseSnapshotReply,
} from "./insights.prompt";
import {
  Insights,
  SnapshotInsights,
  parseStoredInsights,
  parseStoredSnapshot,
} from "./insights.schema";

export interface InsightsView {
  insights: Insights | SnapshotInsights;
  generated_at: Date | null;
  model: string | null;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  /** Results currently being written, so two quick requests share one (paid) call to Claude. */
  private inFlight = new Map<string, Promise<InsightsView>>();

  constructor(
    private prisma: PrismaService,
    private claude: ClaudeClient,
  ) {}

  async getOrGenerate(userId: string, resultId: string): Promise<InsightsView> {
    const result = await this.prisma.assessmentResult.findFirst({
      where: { id: resultId, user_id: userId, deleted_at: null },
      include: { assessment: { select: { type: true } } },
    });
    if (!result) throw new NotFoundException("Result not found");

    const snapshot = result.assessment.type === "free_snapshot";
    if (!snapshot && result.assessment.type !== "full_assessment") {
      throw new BadRequestException({
        statusCode: 400,
        message: "Written insights are part of the personality assessments.",
        code: "INSIGHTS_NOT_AVAILABLE",
      });
    }

    const existing = snapshot
      ? parseStoredSnapshot(result.ai_interpretation)
      : parseStoredInsights(result.ai_interpretation);
    if (existing)
      return {
        insights: existing,
        generated_at: result.ai_generated_at,
        model: result.ai_model,
      };

    if (!this.claude.isConfigured()) {
      throw new HttpException(
        {
          statusCode: 503,
          message: "Written insights aren’t available right now.",
          code: "AI_UNAVAILABLE",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const running = this.inFlight.get(result.id);
    if (running) return running;

    const job = this.generate(result, snapshot).finally(() =>
      this.inFlight.delete(result.id),
    );
    this.inFlight.set(result.id, job);
    return job;
  }

  private async generate(
    result: {
      id: string;
      ai_interpretation: string | null;
      openness_score: number | null;
      conscientiousness_score: number | null;
      extraversion_score: number | null;
      agreeableness_score: number | null;
      neuroticism_score: number | null;
    },
    snapshot: boolean,
  ): Promise<InsightsView> {
    // Only the five numbers leave this server: no name, email, or anything else identifying.
    const scores: Record<Trait, number> = {
      openness: result.openness_score ?? 0,
      conscientiousness: result.conscientiousness_score ?? 0,
      extraversion: result.extraversion_score ?? 0,
      agreeableness: result.agreeableness_score ?? 0,
      neuroticism: result.neuroticism_score ?? 0,
    };

    let insights: Insights | SnapshotInsights;
    try {
      insights = snapshot
        ? await this.askSnapshot(buildSnapshotPrompt(scores))
        : await this.askClaude(buildUserPrompt(scores));
    } catch (err) {
      this.logger.error(
        `Could not generate insights for result ${result.id}: ${(err as Error).message}`,
      );
      throw new HttpException(
        {
          statusCode: 502,
          message:
            "We couldn’t write your insights just now. Please try again in a minute.",
          code: "AI_ERROR",
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const generatedAt = new Date();
    const model = this.claude.model;
    // Compare-and-set so a result is only ever written once, even if two servers race.
    const saved = await this.prisma.assessmentResult.updateMany({
      where: { id: result.id, ai_interpretation: result.ai_interpretation },
      data: {
        ai_interpretation: JSON.stringify(insights),
        ai_generated_at: generatedAt,
        ai_model: model,
      },
    });

    if (saved.count === 0) {
      const winner = await this.prisma.assessmentResult.findUnique({
        where: { id: result.id },
        select: {
          ai_interpretation: true,
          ai_generated_at: true,
          ai_model: true,
        },
      });
      const stored = snapshot
        ? parseStoredSnapshot(winner?.ai_interpretation)
        : parseStoredInsights(winner?.ai_interpretation);
      if (stored)
        return {
          insights: stored,
          generated_at: winner!.ai_generated_at,
          model: winner!.ai_model,
        };
    }
    return { insights, generated_at: generatedAt, model };
  }

  /** Same as askClaude, for the short snapshot analysis. */
  private async askSnapshot(userPrompt: string): Promise<SnapshotInsights> {
    const first = await this.claude.complete(
      SNAPSHOT_SYSTEM_PROMPT,
      userPrompt,
    );
    try {
      return parseSnapshotReply(first);
    } catch (problem) {
      this.logger.warn(
        `First snapshot reply from Claude was unusable: ${(problem as Error).message}. Retrying once.`,
      );
      const second = await this.claude.complete(
        SNAPSHOT_SYSTEM_PROMPT,
        `${userPrompt}\n\n${buildRetryPrompt((problem as Error).message)}`,
      );
      return parseSnapshotReply(second);
    }
  }

  /** Asks once, and once more if the reply could not be used. Never accepts unvalidated output. */
  private async askClaude(userPrompt: string): Promise<Insights> {
    const first = await this.claude.complete(SYSTEM_PROMPT, userPrompt);
    try {
      return parseInsightsReply(first);
    } catch (problem) {
      this.logger.warn(
        `First reply from Claude was unusable: ${(problem as Error).message}. Retrying once.`,
      );
      const second = await this.claude.complete(
        SYSTEM_PROMPT,
        `${userPrompt}\n\n${buildRetryPrompt((problem as Error).message)}`,
      );
      return parseInsightsReply(second);
    }
  }
}
