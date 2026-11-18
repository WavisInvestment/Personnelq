import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { BillingConfigService } from "../../common/billing/billing-config.service";
import { PrismaService } from "../../database/prisma.service";
import { claudeApiKey } from "../insights/claude-config";
import {
  parseStoredInsights,
  parseStoredSnapshot,
} from "../insights/insights.schema";
import { ESTIMATED_MINUTES } from "./catalog/core-assessments";
import { TRAITS, Trait } from "./catalog/ocean-items";
import { SaveAnswersDto } from "./dto/save-answers.dto";
import { classView, classify, tierFor } from "./scoring/classes";
import { RESULT_DISCLAIMER, describeTrait } from "./scoring/interpretation";
import {
  CustomSection,
  StoredCustomScores,
  buildCustomScores,
  parseCustomScores,
} from "./scoring/custom-scoring";
import {
  LEVEL_LABELS,
  ScorableQuestion,
  TraitScores,
  levelFor,
  scoreAnswers,
} from "./scoring/scoring";

const DAY_MS = 24 * 60 * 60 * 1000;

// Questions are sent to the client without their trait or direction: scoring happens only on the server.
const questionSelect = {
  id: true,
  question_number: true,
  question_text: true,
  min_score: true,
  max_score: true,
  options: true,
  option_values: true,
} satisfies Prisma.AssessmentQuestionSelect;

const assessmentSummarySelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  version: true,
  total_questions: true,
  allow_retake: true,
  retake_interval_days: true,
} satisfies Prisma.AssessmentSelect;

type AssessmentSummary = Prisma.AssessmentGetPayload<{
  select: typeof assessmentSummarySelect;
}>;

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private billing: BillingConfigService,
  ) {}

  // ---------------------------------------------------------------- rules

  /** Whether a finished attempt can be repeated yet, and when. */
  private retakeStatus(
    assessment: Pick<
      AssessmentSummary,
      "allow_retake" | "retake_interval_days"
    >,
    completedAt: Date | null,
  ) {
    if (!completedAt)
      return { allowed: true, available_at: null as Date | null };
    if (!assessment.allow_retake)
      return { allowed: false, available_at: null as Date | null };
    const available_at = new Date(
      completedAt.getTime() + assessment.retake_interval_days * DAY_MS,
    );
    return { allowed: Date.now() >= available_at.getTime(), available_at };
  }

  private paymentRequired(type: string) {
    return (
      this.billing.paymentsEnabled() &&
      type === "full_assessment" &&
      this.config.get<string>("ASSESSMENT_PAYMENT_REQUIRED") === "true"
    );
  }

  /** One successful payment buys one attempt. Off until payments go live (ASSESSMENT_PAYMENT_REQUIRED). */
  private async hasPaidAttempt(
    userId: string,
    assessment: Pick<AssessmentSummary, "id" | "type">,
  ) {
    if (!this.paymentRequired(assessment.type)) return true;
    const [paid, used] = await Promise.all([
      this.prisma.payment.count({
        where: {
          user_id: userId,
          assessment_id: assessment.id,
          status: "success",
        },
      }),
      this.prisma.assessmentSubmission.count({
        // Attempts taken for a company are covered by its plan, so they don't use up a personal payment.
        where: {
          user_id: userId,
          assessment_id: assessment.id,
          organization_id: null,
          status: { not: "abandoned" },
          deleted_at: null,
        },
      }),
    ]);
    return paid > used;
  }

  /** Companies that currently cover this person's full assessment: they accepted the invitation and the plan is active. */
  async companyCovers(userId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: {
        user_id: userId,
        status: "active",
        deleted_at: null,
        consented_at: { not: null },
        // With payments switched off companies need no plan, so being a member is enough.
        organization: {
          deleted_at: null,
          status: "active",
          ...(this.billing.paymentsEnabled() && {
            subscriptions: {
              some: { status: "active", end_date: { gt: new Date() } },
            },
          }),
        },
      },
      select: { organization: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.organization);
  }

  // ---------------------------------------------------------------- listing

  async listAssessments(userId: string) {
    const assessments = await this.prisma.assessment.findMany({
      where: {
        organization_id: null,
        deleted_at: null,
        published_at: { not: null },
      },
      orderBy: { total_questions: "asc" },
      select: assessmentSummarySelect,
    });
    const ids = assessments.map((a) => a.id);
    const covers = await this.companyCovers(userId);

    const coverIds = covers.map((c) => c.id);
    const [companyDone, inProgress, latest] = await Promise.all([
      coverIds.length
        ? this.prisma.assessmentSubmission.findMany({
            where: {
              user_id: userId,
              assessment_id: { in: ids },
              organization_id: { in: coverIds },
              status: "completed",
              deleted_at: null,
            },
            select: { assessment_id: true },
          })
        : Promise.resolve([] as { assessment_id: string }[]),
      this.prisma.assessmentSubmission.findMany({
        where: {
          user_id: userId,
          assessment_id: { in: ids },
          status: "in_progress",
          deleted_at: null,
        },
        select: {
          id: true,
          assessment_id: true,
          progress_percent: true,
          _count: { select: { answers: true } },
        },
      }),
      this.prisma.assessmentResult.findMany({
        where: {
          user_id: userId,
          assessment_id: { in: ids },
          is_current: true,
          deleted_at: null,
        },
        select: {
          id: true,
          assessment_id: true,
          submission: {
            select: { submission_number: true, completed_at: true },
          },
        },
      }),
    ]);

    const data = await Promise.all(
      assessments.map(async (a) => {
        const progress = inProgress.find((s) => s.assessment_id === a.id);
        const result = latest.find((r) => r.assessment_id === a.id);
        const completedAt = result?.submission.completed_at ?? null;
        const retake = this.retakeStatus(a, completedAt);
        const company =
          a.type === "full_assessment" ? (covers[0] ?? null) : null;
        const company_retake =
          company && !progress && result
            ? await this.retakeState(
                userId,
                a.id,
                company.id,
                companyDone.some((d) => d.assessment_id === a.id) ||
                  !retake.allowed,
              )
            : null;

        let blocked_reason:
          "RETAKE_LOCKED" | "PAYMENT_REQUIRED" | "PAYMENT_UNAVAILABLE" | null =
          null;
        if (!progress) {
          if (result && !retake.allowed) blocked_reason = "RETAKE_LOCKED";
          else if (!(await this.hasPaidAttempt(userId, a))) {
            // Payment is required: it can be bought only if a price and a payment provider are configured.
            blocked_reason =
              this.billing.assessmentPrice() &&
              this.billing.paystackConfigured()
                ? "PAYMENT_REQUIRED"
                : "PAYMENT_UNAVAILABLE";
          }
        }

        return {
          id: a.id,
          slug: a.slug,
          name: a.name,
          description: a.description,
          type: a.type,
          version: a.version,
          total_questions: a.total_questions,
          estimated_minutes:
            ESTIMATED_MINUTES[a.slug ?? ""] ??
            Math.ceil(a.total_questions * 0.4),
          status: progress
            ? "in_progress"
            : result
              ? "completed"
              : "not_started",
          in_progress: progress
            ? {
                submission_id: progress.id,
                progress_percent: progress.progress_percent,
                answered: progress._count.answers,
              }
            : null,
          latest_result: result
            ? {
                id: result.id,
                submission_number: result.submission.submission_number,
                completed_at: completedAt,
              }
            : null,
          price: this.paymentRequired(a.type)
            ? this.billing.assessmentPrice()
            : null,
          // Only the full assessment can be taken for a company.
          company_cover: company,
          // Repeating through the company needs its approval: null when nothing is in the way.
          company_retake,
          can_start: blocked_reason === null,
          blocked_reason,
          retake_available_at:
            blocked_reason === "RETAKE_LOCKED" ? retake.available_at : null,
        };
      }),
    );

    return { data };
  }

  /** Published assessments made by the companies that currently cover this person, with their own progress on each. */
  async listCompanyAssessments(userId: string) {
    const covers = await this.companyCovers(userId);
    if (covers.length === 0) return { data: [] };

    const assessments = await this.prisma.assessment.findMany({
      where: {
        organization_id: { in: covers.map((c) => c.id) },
        type: "custom_assessment",
        deleted_at: null,
        published_at: { not: null },
      },
      orderBy: { published_at: "desc" },
      select: { ...assessmentSummarySelect, organization_id: true },
    });
    const ids = assessments.map((a) => a.id);
    const [inProgress, latest] = await Promise.all([
      this.prisma.assessmentSubmission.findMany({
        where: {
          user_id: userId,
          assessment_id: { in: ids },
          status: "in_progress",
          deleted_at: null,
        },
        select: { id: true, assessment_id: true, progress_percent: true },
      }),
      this.prisma.assessmentResult.findMany({
        where: {
          user_id: userId,
          assessment_id: { in: ids },
          is_current: true,
          deleted_at: null,
        },
        select: {
          id: true,
          assessment_id: true,
          submission: { select: { completed_at: true } },
        },
      }),
    ]);

    return {
      data: await Promise.all(
        assessments.map(async (a) => {
          const progress = inProgress.find((s) => s.assessment_id === a.id);
          const result = latest.find((r) => r.assessment_id === a.id);
          // A company's own assessment repeats freely once the window its author set has opened; before that (or when
          // retakes are off) the company has to approve.
          const retake = this.retakeStatus(
            a,
            result?.submission.completed_at ?? null,
          );
          const needs = !progress && !!result && !retake.allowed;
          const retake_state = needs
            ? await this.retakeState(userId, a.id, a.organization_id!, true)
            : null;
          const locked = needs && retake_state?.state !== "approved";
          return {
            id: a.id,
            name: a.name,
            description: a.description,
            company: covers.find((c) => c.id === a.organization_id)!,
            total_questions: a.total_questions,
            estimated_minutes: Math.max(1, Math.ceil(a.total_questions * 0.4)),
            status: progress
              ? "in_progress"
              : result
                ? "completed"
                : "not_started",
            in_progress: progress
              ? { progress_percent: progress.progress_percent }
              : null,
            latest_result: result
              ? { id: result.id, completed_at: result.submission.completed_at }
              : null,
            can_start: !locked,
            company_retake: retake_state,
          };
        }),
      ),
    };
  }

  // ---------------------------------------------------------------- starting

  /** What a person needs before they can be asked to pay for an assessment. Used by checkout. */
  async checkoutEligibility(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organization_id: null,
        deleted_at: null,
        published_at: { not: null },
      },
      select: assessmentSummarySelect,
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    const requiresPayment = this.paymentRequired(assessment.type);
    const [inProgress, lastDone] = await Promise.all([
      this.findInProgress(userId, assessment.id),
      this.prisma.assessmentSubmission.findFirst({
        where: {
          user_id: userId,
          assessment_id: assessment.id,
          status: "completed",
          deleted_at: null,
        },
        orderBy: { submission_number: "desc" },
        select: { completed_at: true },
      }),
    ]);
    const retake = this.retakeStatus(
      assessment,
      lastDone?.completed_at ?? null,
    );

    return {
      assessment: {
        id: assessment.id,
        name: assessment.name,
        type: assessment.type,
      },
      requiresPayment,
      hasInProgress: !!inProgress,
      retakeLocked: !!lastDone && !retake.allowed,
      retakeAvailableAt: retake.available_at,
      hasPaidAttempt:
        requiresPayment && (await this.hasPaidAttempt(userId, assessment)),
    };
  }

  async start(userId: string, assessmentId: string, organizationId?: string) {
    // Official assessments, plus published assessments made by a company the person belongs to (and that is covering them).
    const covers = await this.companyCovers(userId);
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        deleted_at: null,
        published_at: { not: null },
        OR: [
          { organization_id: null },
          { organization_id: { in: covers.map((c) => c.id) } },
        ],
      },
      select: { ...assessmentSummarySelect, organization_id: true },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    const existing = await this.findInProgress(userId, assessment.id);
    if (existing)
      return {
        resumed: true,
        submission: await this.getSubmission(userId, existing.id),
      };

    const lastDone = await this.prisma.assessmentSubmission.findFirst({
      where: {
        user_id: userId,
        assessment_id: assessment.id,
        status: "completed",
        deleted_at: null,
      },
      orderBy: { submission_number: "desc" },
      select: { id: true, completed_at: true },
    });

    const retake = this.retakeStatus(
      assessment,
      lastDone?.completed_at ?? null,
    );

    // A company attempt is paid for by the company's plan and is visible to its HR; a private one is neither.
    // A company-made assessment always belongs to its company; the lookup above already proved the person is covered by it.
    const attemptOrganizationId =
      assessment.organization_id ?? organizationId ?? null;
    if (!assessment.organization_id && organizationId) {
      const covered =
        assessment.type === "full_assessment" &&
        covers.some((o) => o.id === organizationId);
      if (!covered) {
        throw new HttpException(
          {
            statusCode: 403,
            message: "Your company can’t cover this assessment right now.",
            code: "COMPANY_COVER_UNAVAILABLE",
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Repeating an assessment: privately it waits for the retake window; through a company it needs HR's approval.
    let approval: { id: string } | null = null;
    if (lastDone) {
      if (attemptOrganizationId) {
        // The official assessment never repeats through a company without approval. A company's own assessment follows
        // the window its author set (approval is how HR lets someone repeat before it opens, or when retakes are off).
        const needsApproval = assessment.organization_id
          ? !retake.allowed
          : (await this.companyCompleted(
              userId,
              assessment.id,
              attemptOrganizationId,
            )) || !retake.allowed;
        if (needsApproval) {
          const open = await this.openRetake(
            userId,
            assessment.id,
            attemptOrganizationId,
          );
          if (open?.status !== "approved") {
            throw new ConflictException({
              statusCode: 409,
              message: open
                ? "Your request is waiting for approval from your company."
                : "Repeating this assessment for your company needs approval. You can ask for it.",
              code: "RETAKE_NEEDS_APPROVAL",
              organization_id: attemptOrganizationId,
              request_status: open?.status ?? null,
            });
          }
          approval = { id: open.id };
        }
      } else if (!retake.allowed) {
        throw new ConflictException({
          statusCode: 409,
          message: retake.available_at
            ? "This assessment is locked until your retake window opens."
            : "This assessment can only be taken once.",
          code: "RETAKE_LOCKED",
          retake_available_at: retake.available_at,
        });
      }
    }

    if (
      !attemptOrganizationId &&
      !(await this.hasPaidAttempt(userId, assessment))
    ) {
      throw new HttpException(
        {
          statusCode: 402,
          message: "Payment is required to start this assessment.",
          code: "PAYMENT_REQUIRED",
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.assessmentSubmission.findFirst({
          where: { user_id: userId, assessment_id: assessment.id },
          orderBy: { submission_number: "desc" },
          select: { submission_number: true },
        });
        // An approval is good for one attempt: starting uses it up (and only one of two simultaneous starts can).
        if (approval) {
          const used = await tx.retakeRequest.updateMany({
            where: { id: approval.id, status: "approved" },
            data: { status: "used", used_at: new Date(), open_key: null },
          });
          if (used.count === 0)
            throw new ConflictException({
              statusCode: 409,
              code: "RETAKE_NEEDS_APPROVAL",
              message: "This approval has already been used.",
            });
        }
        return tx.assessmentSubmission.create({
          data: {
            user_id: userId,
            organization_id: attemptOrganizationId,
            assessment_id: assessment.id,
            submission_number: (latest?.submission_number ?? 0) + 1,
            previous_submission_id: lastDone?.id ?? null,
            // Only a completed attempt is "current"; this flips on completion.
            is_current: false,
          },
          select: { id: true },
        });
      });
      return {
        resumed: false,
        submission: await this.getSubmission(userId, created.id),
      };
    } catch (err) {
      // Two simultaneous starts: the loser resumes the winner's attempt.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raced = await this.findInProgress(userId, assessment.id);
        if (raced)
          return {
            resumed: true,
            submission: await this.getSubmission(userId, raced.id),
          };
      }
      throw err;
    }
  }

  /** Has this person already finished the assessment through this company? */
  private async companyCompleted(
    userId: string,
    assessmentId: string,
    organizationId: string,
  ) {
    const n = await this.prisma.assessmentSubmission.count({
      where: {
        user_id: userId,
        assessment_id: assessmentId,
        organization_id: organizationId,
        status: "completed",
        deleted_at: null,
      },
    });
    return n > 0;
  }

  /** The person's live retake request for this company: waiting for HR, or approved and not yet expired. */
  private openRetake(
    userId: string,
    assessmentId: string,
    organizationId: string,
  ) {
    return this.prisma.retakeRequest.findFirst({
      where: {
        user_id: userId,
        assessment_id: assessmentId,
        organization_id: organizationId,
        OR: [
          { status: "requested" },
          { status: "approved", expires_at: { gt: new Date() } },
        ],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true, expires_at: true },
    });
  }

  /** What the person sees about repeating an assessment through a company: nothing, "ask", "waiting" or "approved". */
  private async retakeState(
    userId: string,
    assessmentId: string,
    organizationId: string,
    needsApproval: boolean,
  ) {
    if (!needsApproval) return null;
    const open = await this.openRetake(userId, assessmentId, organizationId);
    return {
      organization_id: organizationId,
      state: (open?.status ?? "needs_approval") as
        "needs_approval" | "requested" | "approved",
      expires_at: open?.status === "approved" ? open.expires_at : null,
    };
  }

  private findInProgress(userId: string, assessmentId: string) {
    return this.prisma.assessmentSubmission.findFirst({
      where: {
        user_id: userId,
        assessment_id: assessmentId,
        status: "in_progress",
        deleted_at: null,
      },
      select: { id: true },
    });
  }

  // ---------------------------------------------------------------- taking

  async getSubmission(userId: string, submissionId: string) {
    const submission = await this.prisma.assessmentSubmission.findFirst({
      where: { id: submissionId, user_id: userId, deleted_at: null },
      include: {
        assessment: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            total_questions: true,
            questions: {
              orderBy: { question_number: "asc" },
              select: questionSelect,
            },
          },
        },
        answers: { select: { question_id: true, answer_value: true } },
        result: { select: { id: true } },
      },
    });
    if (!submission) throw new NotFoundException("Submission not found");

    return {
      id: submission.id,
      status: submission.status,
      submission_number: submission.submission_number,
      progress_percent: submission.progress_percent,
      answered: submission.answers.length,
      total: submission.assessment.total_questions,
      is_locked: submission.is_locked,
      result_id: submission.result?.id ?? null,
      started_at: submission.started_at,
      assessment: {
        id: submission.assessment.id,
        slug: submission.assessment.slug,
        name: submission.assessment.name,
        type: submission.assessment.type,
        total_questions: submission.assessment.total_questions,
      },
      questions: submission.assessment.questions.map((q) => ({
        id: q.id,
        number: q.question_number,
        text: q.question_text,
        min: q.min_score,
        max: q.max_score,
        options: q.options,
        values: q.option_values,
      })),
      answers: Object.fromEntries(
        submission.answers.map((a) => [a.question_id, a.answer_value]),
      ),
    };
  }

  async saveAnswers(userId: string, submissionId: string, dto: SaveAnswersDto) {
    const submission = await this.prisma.assessmentSubmission.findFirst({
      where: { id: submissionId, user_id: userId, deleted_at: null },
      select: {
        id: true,
        status: true,
        is_locked: true,
        assessment: {
          select: {
            total_questions: true,
            questions: {
              select: { id: true, min_score: true, max_score: true },
            },
          },
        },
      },
    });
    if (!submission) throw new NotFoundException("Submission not found");

    // A completed attempt is history and is never edited.
    if (submission.status !== "in_progress" || submission.is_locked) {
      throw new ConflictException({
        statusCode: 409,
        message:
          "This assessment has been completed and can no longer be changed.",
        code: "SUBMISSION_LOCKED",
      });
    }

    const questions = new Map(
      submission.assessment.questions.map((q) => [q.id, q]),
    );
    const seen = new Set<string>();
    for (const answer of dto.answers) {
      const question = questions.get(answer.question_id);
      if (!question)
        throw new BadRequestException(
          "One of the answers is for a question that is not part of this assessment",
        );
      if (seen.has(answer.question_id))
        throw new BadRequestException(
          "Each question can only be answered once per request",
        );
      seen.add(answer.question_id);
      if (
        answer.value < question.min_score ||
        answer.value > question.max_score
      ) {
        throw new BadRequestException(
          `Answers must be between ${question.min_score} and ${question.max_score}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const answer of dto.answers) {
        await tx.assessmentAnswer.upsert({
          where: {
            submission_id_question_id: {
              submission_id: submission.id,
              question_id: answer.question_id,
            },
          },
          create: {
            submission_id: submission.id,
            question_id: answer.question_id,
            answer_value: answer.value,
            time_spent_seconds: answer.time_spent_seconds ?? 0,
          },
          update: {
            answer_value: answer.value,
            time_spent_seconds: answer.time_spent_seconds ?? 0,
          },
        });
      }

      const answered = await tx.assessmentAnswer.count({
        where: { submission_id: submission.id },
      });
      const total = submission.assessment.total_questions;
      const progress_percent = Math.min(
        100,
        Math.floor((answered / total) * 100),
      );
      await tx.assessmentSubmission.update({
        where: { id: submission.id },
        data: { progress_percent, current_question: answered },
      });

      return { answered, total, progress_percent };
    });
  }

  // ---------------------------------------------------------------- completing

  async complete(userId: string, submissionId: string) {
    let resultId: string;

    try {
      resultId = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.assessmentSubmission.findFirst({
          where: { id: submissionId, user_id: userId, deleted_at: null },
          include: {
            assessment: { include: { questions: true } },
            answers: true,
            result: { select: { id: true } },
          },
        });
        if (!submission) throw new NotFoundException("Submission not found");

        // Finishing twice (a double click, a retry) returns the same result instead of failing.
        if (submission.result) return submission.result.id;

        if (submission.status !== "in_progress") {
          throw new ConflictException({
            statusCode: 409,
            message: "This assessment is not in progress.",
            code: "SUBMISSION_LOCKED",
          });
        }

        const answers = new Map(
          submission.answers.map((a) => [a.question_id, a.answer_value]),
        );
        const missing = submission.assessment.questions.filter(
          (q) => !answers.has(q.id),
        ).length;
        if (missing > 0) {
          throw new BadRequestException({
            statusCode: 400,
            message: `Please answer every question before finishing. ${missing} left.`,
            code: "INCOMPLETE",
            missing,
          });
        }

        let traits: TraitScores | null = null;
        let overall: number;
        let custom: StoredCustomScores | null = null;

        if (submission.assessment.scoring_method === "custom") {
          const sections = ((
            submission.assessment.definition as {
              sections?: CustomSection[];
            } | null
          )?.sections ?? []) as CustomSection[];
          custom = buildCustomScores(
            sections,
            submission.assessment.questions.map((q) => ({
              id: q.id,
              section: q.section_key ?? "",
              reverse: q.ocean_direction === "reverse",
              weight: q.weight,
              min: q.min_score,
              max: q.max_score,
            })),
            answers,
          );
          overall = custom.overall.score;
        } else {
          const scorable: ScorableQuestion[] =
            submission.assessment.questions.map((q) => {
              if (!TRAITS.includes(q.ocean_trait as Trait))
                throw new Error(`Question ${q.id} has no valid trait`);
              return {
                id: q.id,
                trait: q.ocean_trait as Trait,
                reverse: q.ocean_direction === "reverse",
                weight: q.weight,
                min: q.min_score,
                max: q.max_score,
              };
            });
          ({ traits, overall } = scoreAnswers(scorable, answers));
        }

        const previous = await tx.assessmentResult.findFirst({
          where: {
            user_id: userId,
            assessment_id: submission.assessment_id,
            is_current: true,
          },
          select: { id: true },
        });
        const now = new Date();

        const result = await tx.assessmentResult.create({
          data: {
            user_id: userId,
            organization_id: submission.organization_id,
            assessment_id: submission.assessment_id,
            submission_id: submission.id,
            openness_score: traits?.openness ?? null,
            conscientiousness_score: traits?.conscientiousness ?? null,
            extraversion_score: traits?.extraversion ?? null,
            agreeableness_score: traits?.agreeableness ?? null,
            neuroticism_score: traits?.neuroticism ?? null,
            overall_score: overall,
            custom_scores: custom
              ? (custom as unknown as Prisma.InputJsonObject)
              : undefined,
            result_version: submission.assessment.version,
            is_current: true,
            previous_result_id: previous?.id ?? null,
            calculated_at: now,
          },
          select: { id: true },
        });

        // Earlier attempts stay exactly as they were; only their "current" marker moves.
        await tx.assessmentResult.updateMany({
          where: {
            user_id: userId,
            assessment_id: submission.assessment_id,
            is_current: true,
            id: { not: result.id },
          },
          data: { is_current: false },
        });
        await tx.assessmentSubmission.updateMany({
          where: {
            user_id: userId,
            assessment_id: submission.assessment_id,
            is_current: true,
            id: { not: submission.id },
          },
          data: { is_current: false },
        });

        await tx.assessmentSubmission.update({
          where: { id: submission.id },
          data: {
            status: "completed",
            completed_at: now,
            duration_seconds: Math.max(
              0,
              Math.round(
                (now.getTime() - submission.started_at.getTime()) / 1000,
              ),
            ),
            progress_percent: 100,
            current_question: submission.assessment.total_questions,
            is_current: true,
            is_locked: true,
            locked_reason: "completed",
          },
        });

        return result.id;
      });
    } catch (err) {
      // Two simultaneous completions: the loser returns the winner's result.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await this.prisma.assessmentResult.findUnique({
          where: { submission_id: submissionId },
          select: { id: true },
        });
        if (existing) return this.getResult(userId, existing.id);
      }
      throw err;
    }

    return this.getResult(userId, resultId);
  }

  // ---------------------------------------------------------------- results

  private traitRows(
    result: {
      openness_score: number | null;
      conscientiousness_score: number | null;
      extraversion_score: number | null;
      agreeableness_score: number | null;
      neuroticism_score: number | null;
    },
    withDescriptions: boolean,
  ) {
    return TRAITS.map((trait) => {
      const score = result[`${trait}_score` as const] ?? 0;
      const level = levelFor(score);
      return {
        trait,
        score,
        level,
        level_label: LEVEL_LABELS[level],
        description: withDescriptions ? describeTrait(trait, level) : null,
      };
    });
  }

  /** The class for a result's five scores and the person's tier (how much of the product they have taken). */
  private async profileOf(
    userId: string,
    r: {
      openness_score: number | null;
      conscientiousness_score: number | null;
      extraversion_score: number | null;
      agreeableness_score: number | null;
      neuroticism_score: number | null;
    },
  ) {
    const [snapshots, fulls] = await Promise.all(
      (["free_snapshot", "full_assessment"] as const).map((type) =>
        this.prisma.assessmentResult.count({
          where: {
            user_id: userId,
            deleted_at: null,
            assessment: { type },
          },
        }),
      ),
    );
    const scores = [
      r.openness_score,
      r.conscientiousness_score,
      r.extraversion_score,
      r.agreeableness_score,
      r.neuroticism_score,
    ];
    const profile_class = scores.every((s) => s !== null)
      ? classView(
          classify({
            openness: r.openness_score!,
            conscientiousness: r.conscientiousness_score!,
            extraversion: r.extraversion_score!,
            agreeableness: r.agreeableness_score!,
            neuroticism: r.neuroticism_score!,
          }),
        )
      : null;
    return { profile_class, tier: tierFor({ snapshots, fulls }) };
  }

  async getResult(userId: string, resultId: string) {
    const result = await this.prisma.assessmentResult.findFirst({
      where: { id: resultId, user_id: userId, deleted_at: null },
      include: {
        assessment: { select: assessmentSummarySelect },
        submission: {
          select: {
            submission_number: true,
            completed_at: true,
            duration_seconds: true,
          },
        },
        organization: { select: { name: true } },
      },
    });
    if (!result) throw new NotFoundException("Result not found");

    const isPreview = result.assessment.type === "free_snapshot";
    const custom = parseCustomScores(result.custom_scores);
    const profile = custom ? null : await this.profileOf(userId, result);
    const retake = result.is_current
      ? this.retakeStatus(result.assessment, result.submission.completed_at)
      : null;

    return {
      id: result.id,
      assessment: {
        id: result.assessment.id,
        slug: result.assessment.slug,
        name: result.assessment.name,
        type: result.assessment.type,
        version: result.result_version,
      },
      submission_number: result.submission.submission_number,
      is_current: result.is_current,
      previous_result_id: result.previous_result_id,
      completed_at: result.submission.completed_at,
      duration_seconds: result.submission.duration_seconds,
      // The snapshot is a preview: it comes with a short written analysis and a class, not the dimension-by-dimension reading.
      is_preview: isPreview,
      // Set when this result was taken for a company, which can therefore see it.
      company: result.organization?.name ?? null,
      kind: custom ? "custom" : "ocean",
      custom,
      traits: custom ? [] : this.traitRows(result, !isPreview),
      // The personality class this profile falls in, who it pairs well with, and the person's progress tier.
      profile_class: profile?.profile_class ?? null,
      tier: profile?.tier ?? null,
      overall_score: result.overall_score,
      percentile: result.percentile,
      // Written insights exist only for the full assessment. "available" says whether they can be generated now.
      insights: isPreview
        ? parseStoredSnapshot(result.ai_interpretation)
        : parseStoredInsights(result.ai_interpretation),
      insights_generated_at: result.ai_generated_at,
      insights_available: !custom && claudeApiKey(this.config) !== null,
      disclaimer: isPreview
        ? null
        : custom
          ? "This is a company assessment written by your organisation. It is not an official Personnelq assessment and isn’t comparable with other organisations’ assessments."
          : RESULT_DISCLAIMER,
      retake: retake
        ? { available: retake.allowed, available_at: retake.available_at }
        : null,
    };
  }

  async listResults(userId: string, assessmentSlug?: string) {
    const rows = await this.prisma.assessmentResult.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        ...(assessmentSlug && { assessment: { slug: assessmentSlug } }),
      },
      orderBy: { calculated_at: "desc" },
      include: {
        assessment: { select: { slug: true, name: true, type: true } },
        submission: { select: { submission_number: true, completed_at: true } },
        organization: { select: { name: true } },
      },
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        company: r.organization?.name ?? null,
        assessment: r.assessment,
        submission_number: r.submission.submission_number,
        is_current: r.is_current,
        is_preview: r.assessment.type === "free_snapshot",
        kind: r.custom_scores ? "custom" : "ocean",
        overall_score: r.overall_score,
        completed_at: r.submission.completed_at,
        traits: (r.custom_scores ? [] : this.traitRows(r, false)).map(
          ({ trait, score, level, level_label }) => ({
            trait,
            score,
            level,
            level_label,
          }),
        ),
      })),
    };
  }
}
