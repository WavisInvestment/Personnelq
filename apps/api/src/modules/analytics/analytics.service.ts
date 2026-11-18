import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { evolution, Scores } from "./stats";

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /** The companies a person currently belongs to, fresh from the database (the sign-in copy goes stale). */
  async organizations(userId: string) {
    const [rows, account] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: {
          user_id: userId,
          status: "active",
          deleted_at: null,
          organization: { deleted_at: null },
        },
        select: {
          consented_at: true,
          role: { select: { key: true } },
          organization: {
            select: { id: true, name: true, slug: true, type: true },
          },
        },
        orderBy: { joined_at: "asc" },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { joined_via_organization_id: true },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        ...r.organization,
        role: r.role.key,
        shares_results: r.consented_at !== null,
        can_leave: account?.joined_via_organization_id !== r.organization.id,
      })),
    };
  }

  /**
   * A person's own progress. The trend uses full assessments only: the 10-question snapshot has two questions per
   * trait, so mixing it in would show noise as change.
   */
  async progress(userId: string) {
    const rows = await this.prisma.assessmentResult.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { calculated_at: "asc" },
      select: {
        id: true,
        calculated_at: true,
        openness_score: true,
        conscientiousness_score: true,
        extraversion_score: true,
        agreeableness_score: true,
        neuroticism_score: true,
        assessment: { select: { type: true } },
        organization: { select: { name: true } },
      },
    });

    const points = rows
      .filter((r) => r.assessment.type === "full_assessment")
      .map((r, i) => ({
        result_id: r.id,
        completed_at: r.calculated_at,
        attempt: i + 1,
        company: r.organization?.name ?? null,
        scores: {
          openness: r.openness_score ?? 0,
          conscientiousness: r.conscientiousness_score ?? 0,
          extraversion: r.extraversion_score ?? 0,
          agreeableness: r.agreeableness_score ?? 0,
          neuroticism: r.neuroticism_score ?? 0,
        } as Scores,
      }));

    return {
      summary: {
        assessments_taken: rows.length,
        full_attempts: points.length,
        last_taken: rows.length ? rows[rows.length - 1].calculated_at : null,
      },
      points,
      change: evolution(points),
    };
  }
}
