import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { TRAITS } from "../assessments/catalog/ocean-items";
import { classView, classify, tierFor } from "../assessments/scoring/classes";
import { describeTrait } from "../assessments/scoring/interpretation";
import { LEVEL_LABELS, levelFor } from "../assessments/scoring/scoring";
import { UpdateBadgeDto } from "./dto/update-badge.dto";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SharedElements {
  scores: boolean;
  descriptions: boolean;
  date: boolean;
  /** The personality class and tier, with who the class pairs well with. */
  class: boolean;
}

const DEFAULT_ELEMENTS: SharedElements = {
  scores: true,
  descriptions: false,
  date: true,
  class: true,
};

/** 256 bits of randomness, URL-safe. Unguessable, so the link itself is the access control. */
const newToken = () => randomBytes(32).toString("base64url");

const readElements = (value: Prisma.JsonValue): SharedElements => {
  const v = (value ?? {}) as Partial<SharedElements>;
  return {
    scores: typeof v.scores === "boolean" ? v.scores : DEFAULT_ELEMENTS.scores,
    descriptions:
      typeof v.descriptions === "boolean"
        ? v.descriptions
        : DEFAULT_ELEMENTS.descriptions,
    date: typeof v.date === "boolean" ? v.date : DEFAULT_ELEMENTS.date,
    class: typeof v.class === "boolean" ? v.class : DEFAULT_ELEMENTS.class,
  };
};

type BadgeRow = Prisma.ShareableBadgeGetPayload<object>;

function ownerView(badge: BadgeRow) {
  const live =
    badge.is_public && (!badge.expires_at || badge.expires_at > new Date());
  return {
    id: badge.id,
    result_id: badge.result_id,
    is_public: badge.is_public,
    // The link only exists while sharing is on, and it stops working once it expires.
    share_path: badge.is_public ? `/b/${badge.share_token}` : null,
    is_live: live,
    expired: badge.is_public && !live,
    display_name: badge.display_name,
    custom_message: badge.custom_message,
    shared_elements: readElements(badge.shared_elements),
    expires_at: badge.expires_at,
    published_at: badge.published_at,
    view_count: badge.view_count,
    last_viewed_at: badge.last_viewed_at,
  };
}

@Injectable()
export class BadgesService {
  constructor(private prisma: PrismaService) {}

  /** The result must be the caller's and from the full assessment (the free snapshot is a preview and isn't shareable). */
  private async ownResult(userId: string, resultId: string) {
    const result = await this.prisma.assessmentResult.findFirst({
      where: { id: resultId, user_id: userId, deleted_at: null },
      select: { id: true, assessment: { select: { type: true } } },
    });
    if (!result) throw new NotFoundException("Result not found");
    if (result.assessment.type !== "full_assessment") {
      throw new BadRequestException({
        statusCode: 400,
        message: "Badges are made from the full assessment.",
        code: "BADGE_NOT_AVAILABLE",
      });
    }
    return result;
  }

  async getForResult(userId: string, resultId: string) {
    await this.ownResult(userId, resultId);
    const badge = await this.prisma.shareableBadge.findFirst({
      where: { result_id: resultId, user_id: userId, deleted_at: null },
    });
    return { badge: badge ? ownerView(badge) : null };
  }

  async upsert(
    user: { id: string; first_name: string },
    resultId: string,
    dto: UpdateBadgeDto,
  ) {
    await this.ownResult(user.id, resultId);

    const existing = await this.prisma.shareableBadge.findUnique({
      where: { result_id: resultId },
    });
    const now = new Date();
    const current = existing
      ? readElements(existing.shared_elements)
      : DEFAULT_ELEMENTS;

    const elements: SharedElements = {
      scores: dto.show_scores ?? current.scores,
      descriptions: dto.show_descriptions ?? current.descriptions,
      date: dto.show_date ?? current.date,
      class: dto.show_class ?? current.class,
    };

    let expires_at: Date | null | undefined;
    if (dto.expires_in_days === null) expires_at = null;
    else if (typeof dto.expires_in_days === "number")
      expires_at = new Date(now.getTime() + dto.expires_in_days * DAY_MS);

    const displayName =
      dto.display_name === undefined
        ? (existing?.display_name ?? user.first_name)
        : dto.display_name;
    const message =
      dto.custom_message === undefined
        ? (existing?.custom_message ?? null)
        : dto.custom_message;

    if (!existing) {
      const token = newToken();
      const created = await this.prisma.shareableBadge.create({
        data: {
          user_id: user.id,
          result_id: resultId,
          share_token: token,
          share_url: `/b/${token}`,
          is_public: dto.is_public,
          published_at: dto.is_public ? now : null,
          expires_at: expires_at ?? null,
          display_name: displayName,
          custom_message: message,
          shared_elements: elements as unknown as Prisma.JsonObject,
        },
      });
      return { badge: ownerView(created) };
    }

    // Switching sharing back on after it was off issues a brand-new link, so a link that was
    // revoked (or expired) can never come back to life. An expired badge is still flagged public in the
    // database, so "off" has to mean "not live", not just "not flagged".
    const wasLive =
      existing.is_public && (!existing.expires_at || existing.expires_at > now);
    const reopening = dto.is_public && !wasLive;
    const token = reopening ? newToken() : existing.share_token;

    const updated = await this.prisma.shareableBadge.update({
      where: { id: existing.id },
      data: {
        is_public: dto.is_public,
        share_token: token,
        share_url: `/b/${token}`,
        published_at: dto.is_public
          ? reopening
            ? now
            : (existing.published_at ?? now)
          : null,
        deleted_at: null,
        ...(expires_at !== undefined && { expires_at }),
        // An expired link that is saved again without choosing a new expiry would still be dead; give it none.
        ...(reopening && expires_at === undefined && { expires_at: null }),
        display_name: displayName,
        custom_message: message,
        shared_elements: elements as unknown as Prisma.JsonObject,
      },
    });
    return { badge: ownerView(updated) };
  }

  /** Stops sharing and retires the link for good. */
  async revoke(userId: string, resultId: string) {
    await this.ownResult(userId, resultId);
    const existing = await this.prisma.shareableBadge.findFirst({
      where: { result_id: resultId, user_id: userId },
    });
    if (!existing) return { badge: null };

    const token = newToken();
    const updated = await this.prisma.shareableBadge.update({
      where: { id: existing.id },
      data: {
        is_public: false,
        share_token: token,
        share_url: `/b/${token}`,
        published_at: null,
      },
    });
    return { badge: ownerView(updated) };
  }

  /** What a visitor sees. Only what the owner chose to share, nothing about the account. */
  async publicView(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
      throw new NotFoundException("Badge not found");

    const now = new Date();
    const badge = await this.prisma.shareableBadge.findFirst({
      where: {
        share_token: token,
        is_public: true,
        deleted_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        result: { deleted_at: null },
      },
      include: {
        result: {
          select: {
            openness_score: true,
            conscientiousness_score: true,
            extraversion_score: true,
            agreeableness_score: true,
            neuroticism_score: true,
            assessment: { select: { name: true } },
            submission: { select: { completed_at: true } },
          },
        },
      },
    });
    if (!badge) throw new NotFoundException("Badge not found");

    // Counting a view must never break showing the badge.
    await this.prisma.shareableBadge
      .update({
        where: { id: badge.id },
        data: { view_count: { increment: 1 }, last_viewed_at: now },
      })
      .catch(() => undefined);

    const elements = readElements(badge.shared_elements);
    const scoreOf = (trait: (typeof TRAITS)[number]) =>
      badge.result[`${trait}_score` as const] ?? 0;
    let profile_class: ReturnType<typeof classView> | null = null;
    let tier: ReturnType<typeof tierFor> = null;
    if (elements.class) {
      profile_class = classView(
        classify({
          openness: scoreOf("openness"),
          conscientiousness: scoreOf("conscientiousness"),
          extraversion: scoreOf("extraversion"),
          agreeableness: scoreOf("agreeableness"),
          neuroticism: scoreOf("neuroticism"),
        }),
      );
      const [snapshots, fulls] = await Promise.all(
        (["free_snapshot", "full_assessment"] as const).map((type) =>
          this.prisma.assessmentResult.count({
            where: {
              user_id: badge.user_id,
              deleted_at: null,
              assessment: { type },
            },
          }),
        ),
      );
      tier = tierFor({ snapshots, fulls });
    }
    return {
      profile_class,
      tier,
      display_name: badge.display_name,
      assessment_name: badge.result.assessment.name,
      completed_at: elements.date ? badge.result.submission.completed_at : null,
      message: badge.custom_message,
      traits: TRAITS.map((trait) => {
        const score = badge.result[`${trait}_score` as const] ?? 0;
        const level = levelFor(score);
        return {
          trait,
          level,
          level_label: LEVEL_LABELS[level],
          score: elements.scores ? score : null,
          description: elements.descriptions
            ? describeTrait(trait, level)
            : null,
        };
      }),
    };
  }
}
