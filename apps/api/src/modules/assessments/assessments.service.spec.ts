import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { SNAPSHOT_ITEMS } from './catalog/ocean-items';
import { AssessmentsService } from './assessments.service';

const DAY = 24 * 60 * 60 * 1000;
const USER = 'user-1';

const snapshot = {
  id: 'a-snap',
  slug: 'ocean-snapshot',
  name: 'Free personality snapshot',
  description: null,
  type: 'free_snapshot',
  version: '1.0.0',
  total_questions: 10,
  allow_retake: true,
  retake_interval_days: 7,
};
const full = { ...snapshot, id: 'a-full', slug: 'ocean-full', type: 'full_assessment', total_questions: 50, retake_interval_days: 180 };

const questionRows = SNAPSHOT_ITEMS.map((i, n) => ({
  id: `q-${i.id}`,
  question_number: n + 1,
  question_text: i.text,
  min_score: 1,
  max_score: 5,
  weight: 1,
  ocean_trait: i.trait,
  ocean_direction: i.reverse ? 'reverse' : 'positive',
  options: [],
  option_values: [],
}));

function setup(config: Record<string, string> = {}) {
  const prisma: any = {
    assessment: { findMany: jest.fn(), findFirst: jest.fn() },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    assessmentAnswer: { upsert: jest.fn(), count: jest.fn() },
    assessmentResult: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: { count: jest.fn().mockResolvedValue(0) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]) },
    retakeRequest: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction = jest.fn((callback: any) => callback(prisma));
  const get = (k: string) => config[k];
  const service = new AssessmentsService(prisma, { get } as any, new BillingConfigService({ get } as any));
  return { prisma, service };
}

/** A configured payment setup: Paystack key, a price, and payments switched on. */
const PAID = { ASSESSMENT_PAYMENT_REQUIRED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_abcdef1234567890', FULL_ASSESSMENT_PRICE: '5000' };

describe('AssessmentsService', () => {
  describe('start', () => {
    it('404s for an assessment that does not exist or is not published', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(null);
      await expect(service.start(USER, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('resumes an attempt that is already in progress instead of creating another', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(snapshot);
      const getSubmission = jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-1' } as any);
      prisma.assessmentSubmission.findFirst.mockResolvedValueOnce({ id: 'sub-1' }); // in progress

      const result = await service.start(USER, snapshot.id);

      expect(result).toEqual({ resumed: true, submission: { id: 'sub-1' } });
      expect(prisma.assessmentSubmission.create).not.toHaveBeenCalled();
      expect(getSubmission).toHaveBeenCalledWith(USER, 'sub-1');
    });

    it('locks a repeat attempt until the retake interval has passed', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(snapshot);
      const completed = new Date(Date.now() - 2 * DAY);
      prisma.assessmentSubmission.findFirst
        .mockResolvedValueOnce(null) // nothing in progress
        .mockResolvedValueOnce({ id: 'old', completed_at: completed });

      const error: any = await service.start(USER, snapshot.id).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'RETAKE_LOCKED' });
      expect(new Date(error.getResponse().retake_available_at).getTime()).toBe(completed.getTime() + 7 * DAY);
      expect(prisma.assessmentSubmission.create).not.toHaveBeenCalled();
    });

    it('never allows a retake when the assessment forbids it', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue({ ...snapshot, allow_retake: false });
      prisma.assessmentSubmission.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'old', completed_at: new Date(Date.now() - 999 * DAY) });

      const error: any = await service.start(USER, snapshot.id).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ code: 'RETAKE_LOCKED', retake_available_at: null });
    });

    it('starts a new numbered attempt linked to the previous one once the interval has passed', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(snapshot);
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'new-sub' } as any);
      prisma.assessmentSubmission.findFirst
        .mockResolvedValueOnce(null) // nothing in progress
        .mockResolvedValueOnce({ id: 'old', completed_at: new Date(Date.now() - 8 * DAY) }) // last completed
        .mockResolvedValueOnce({ submission_number: 3 }); // highest number so far
      prisma.assessmentSubmission.create.mockResolvedValue({ id: 'new-sub' });

      const result = await service.start(USER, snapshot.id);

      expect(result.resumed).toBe(false);
      expect(prisma.assessmentSubmission.create.mock.calls[0][0].data).toMatchObject({
        user_id: USER,
        organization_id: null,
        submission_number: 4,
        previous_submission_id: 'old',
        is_current: false,
      });
    });

    it('lets the loser of a start race resume the winner’s attempt', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(snapshot);
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'winner' } as any);
      prisma.assessmentSubmission.findFirst
        .mockResolvedValueOnce(null) // not in progress yet
        .mockResolvedValueOnce(null) // never completed
        .mockResolvedValueOnce(null) // numbering lookup inside the transaction
        .mockResolvedValueOnce({ id: 'winner' }); // found after the conflict
      prisma.assessmentSubmission.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' }),
      );

      const result = await service.start(USER, snapshot.id);

      expect(result).toEqual({ resumed: true, submission: { id: 'winner' } });
    });

    describe('payment gate', () => {
      it('is open by default, even for the full assessment', async () => {
        const { prisma, service } = setup();
        prisma.assessment.findFirst.mockResolvedValue(full);
        jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 's' } as any);
        prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
        prisma.assessmentSubmission.create.mockResolvedValue({ id: 's' });

        await expect(service.start(USER, full.id)).resolves.toMatchObject({ resumed: false });
        expect(prisma.payment.count).not.toHaveBeenCalled();
      });

      it('returns 402 for the full assessment when payment is required and nothing was paid', async () => {
        const { prisma, service } = setup({ ASSESSMENT_PAYMENT_REQUIRED: 'true' });
        prisma.assessment.findFirst.mockResolvedValue(full);
        prisma.assessmentSubmission.findFirst.mockResolvedValue(null);

        const error: any = await service.start(USER, full.id).catch((e) => e);

        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(402);
        expect(error.getResponse()).toMatchObject({ code: 'PAYMENT_REQUIRED' });
      });

      it('never charges for the free snapshot', async () => {
        const { prisma, service } = setup({ ASSESSMENT_PAYMENT_REQUIRED: 'true' });
        prisma.assessment.findFirst.mockResolvedValue(snapshot);
        jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 's' } as any);
        prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
        prisma.assessmentSubmission.create.mockResolvedValue({ id: 's' });

        await expect(service.start(USER, snapshot.id)).resolves.toMatchObject({ resumed: false });
      });

      it('lets a paid attempt through, and one payment buys one attempt', async () => {
        const { prisma, service } = setup({ ASSESSMENT_PAYMENT_REQUIRED: 'true' });
        prisma.assessment.findFirst.mockResolvedValue(full);
        jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 's' } as any);
        prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
        prisma.assessmentSubmission.create.mockResolvedValue({ id: 's' });

        prisma.payment.count.mockResolvedValue(1);
        prisma.assessmentSubmission.count.mockResolvedValue(0); // 1 paid, 0 used
        await expect(service.start(USER, full.id)).resolves.toMatchObject({ resumed: false });

        prisma.assessmentSubmission.count.mockResolvedValue(1); // 1 paid, 1 used
        await expect(service.start(USER, full.id)).rejects.toMatchObject({ status: 402 });
      });
    });
  });

  describe('checkoutEligibility', () => {
    it('404s for an unknown assessment', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(null);
      await expect(service.checkoutEligibility(USER, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('describes what stands between a person and a purchase', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      const completed = new Date(Date.now() - 10 * DAY);
      prisma.assessmentSubmission.findFirst
        .mockResolvedValueOnce(null) // not in progress
        .mockResolvedValueOnce({ completed_at: completed }); // finished 10 days ago; full retake window is 180 days
      prisma.payment.count.mockResolvedValue(0);

      const result = await service.checkoutEligibility(USER, full.id);

      expect(result).toMatchObject({ requiresPayment: true, hasInProgress: false, retakeLocked: true, hasPaidAttempt: false });
      expect(new Date(result.retakeAvailableAt!).getTime()).toBe(completed.getTime() + 180 * DAY);
    });

    it('never requires payment for the snapshot, or for anything while payments are off', async () => {
      const a = setup(PAID);
      a.prisma.assessment.findFirst.mockResolvedValue(snapshot);
      a.prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      expect((await a.service.checkoutEligibility(USER, snapshot.id)).requiresPayment).toBe(false);

      const b = setup({});
      b.prisma.assessment.findFirst.mockResolvedValue(full);
      b.prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      expect((await b.service.checkoutEligibility(USER, full.id)).requiresPayment).toBe(false);
    });

    it('recognises an attempt that is already in progress and one that is already paid for', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      prisma.assessmentSubmission.findFirst.mockResolvedValueOnce({ id: 'sub' }).mockResolvedValueOnce(null);
      prisma.payment.count.mockResolvedValue(1);
      prisma.assessmentSubmission.count.mockResolvedValue(0);
      expect(await service.checkoutEligibility(USER, full.id)).toMatchObject({ hasInProgress: true, hasPaidAttempt: true });
    });
  });

  describe('saveAnswers', () => {
    const submission = (overrides: object = {}) => ({
      id: 'sub-1',
      status: 'in_progress',
      is_locked: false,
      assessment: { total_questions: 10, questions: questionRows.map((q) => ({ id: q.id, min_score: 1, max_score: 5 })) },
      ...overrides,
    });
    const body = (answers: any[]) => ({ answers });

    it('404s for someone else’s submission (without revealing it exists)', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      await expect(service.saveAnswers('intruder', 'sub-1', body([{ question_id: 'q-E1', value: 3 }]))).rejects.toThrow(NotFoundException);
      expect(prisma.assessmentSubmission.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'sub-1', user_id: 'intruder' });
    });

    it('refuses to change a completed attempt', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(submission({ status: 'completed', is_locked: true }));
      const error: any = await service.saveAnswers(USER, 'sub-1', body([{ question_id: 'q-E1', value: 3 }])).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'SUBMISSION_LOCKED' });
      expect(prisma.assessmentAnswer.upsert).not.toHaveBeenCalled();
    });

    it('rejects an answer for a question outside this assessment', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(submission());
      await expect(service.saveAnswers(USER, 'sub-1', body([{ question_id: 'q-other', value: 3 }]))).rejects.toThrow(BadRequestException);
      expect(prisma.assessmentAnswer.upsert).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range value and a repeated question', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(submission());
      await expect(service.saveAnswers(USER, 'sub-1', body([{ question_id: 'q-E1', value: 6 }]))).rejects.toThrow(/between 1 and 5/);
      await expect(service.saveAnswers(USER, 'sub-1', body([{ question_id: 'q-E1', value: 0 }]))).rejects.toThrow(/between 1 and 5/);
      await expect(
        service.saveAnswers(USER, 'sub-1', body([{ question_id: 'q-E1', value: 2 }, { question_id: 'q-E1', value: 3 }])),
      ).rejects.toThrow(/only be answered once/);
      expect(prisma.assessmentAnswer.upsert).not.toHaveBeenCalled();
    });

    it('saves valid answers and reports progress', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(submission());
      prisma.assessmentAnswer.count.mockResolvedValue(4);

      const result = await service.saveAnswers(
        USER,
        'sub-1',
        body([{ question_id: 'q-E1', value: 5, time_spent_seconds: 7 }, { question_id: 'q-A2', value: 2 }]),
      );

      expect(prisma.assessmentAnswer.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.assessmentAnswer.upsert.mock.calls[0][0]).toMatchObject({
        where: { submission_id_question_id: { submission_id: 'sub-1', question_id: 'q-E1' } },
        update: { answer_value: 5, time_spent_seconds: 7 },
      });
      expect(result).toEqual({ answered: 4, total: 10, progress_percent: 40 });
      expect(prisma.assessmentSubmission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { progress_percent: 40, current_question: 4 },
      });
    });
  });

  describe('complete', () => {
    /** Answers that express the most of every trait: forward items 5, reverse items 1. */
    const allHigh = SNAPSHOT_ITEMS.map((i) => ({ question_id: `q-${i.id}`, answer_value: i.reverse ? 1 : 5 }));
    const inProgress = (overrides: object = {}) => ({
      id: 'sub-2',
      assessment_id: 'a-snap',
      organization_id: null,
      status: 'in_progress',
      started_at: new Date(Date.now() - 90_000),
      assessment: { ...snapshot, questions: questionRows },
      answers: allHigh,
      result: null,
      ...overrides,
    });

    it('404s for someone else’s submission', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      await expect(service.complete('intruder', 'sub-2')).rejects.toThrow(NotFoundException);
    });

    it('refuses to finish with unanswered questions and says how many are left', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(inProgress({ answers: allHigh.slice(0, 7) }));

      const error: any = await service.complete(USER, 'sub-2').catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({ code: 'INCOMPLETE', missing: 3 });
      expect(prisma.assessmentResult.create).not.toHaveBeenCalled();
    });

    it('scores on the server, stores the result, locks the attempt and chains history', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(inProgress());
      prisma.assessmentResult.findFirst.mockResolvedValue({ id: 'prev-result' });
      prisma.assessmentResult.create.mockResolvedValue({ id: 'new-result' });
      jest.spyOn(service, 'getResult').mockResolvedValue({ id: 'new-result' } as any);

      const out = await service.complete(USER, 'sub-2');

      expect(out).toEqual({ id: 'new-result' });
      const created = prisma.assessmentResult.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        user_id: USER,
        organization_id: null,
        submission_id: 'sub-2',
        openness_score: 100,
        conscientiousness_score: 100,
        extraversion_score: 100,
        agreeableness_score: 100,
        neuroticism_score: 100,
        overall_score: 100,
        result_version: '1.0.0',
        is_current: true,
        previous_result_id: 'prev-result',
      });
      // earlier results are only un-marked as current, never altered or removed
      expect(prisma.assessmentResult.updateMany).toHaveBeenCalledWith({
        where: { user_id: USER, assessment_id: 'a-snap', is_current: true, id: { not: 'new-result' } },
        data: { is_current: false },
      });
      expect(prisma.assessmentSubmission.updateMany.mock.calls[0][0].data).toEqual({ is_current: false });
      const lock = prisma.assessmentSubmission.update.mock.calls[0][0].data;
      expect(lock).toMatchObject({
        status: 'completed',
        is_locked: true,
        locked_reason: 'completed',
        progress_percent: 100,
        is_current: true,
      });
      expect(lock.duration_seconds).toBeGreaterThanOrEqual(89);
    });

    it('scores reverse-worded answers correctly end to end', async () => {
      const { prisma, service } = setup();
      // Same answers (all 5) for every item: forward items count fully, reverse items count as 1 -> 50 per trait.
      prisma.assessmentSubmission.findFirst.mockResolvedValue(
        inProgress({ answers: SNAPSHOT_ITEMS.map((i) => ({ question_id: `q-${i.id}`, answer_value: 5 })) }),
      );
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      prisma.assessmentResult.create.mockResolvedValue({ id: 'r' });
      jest.spyOn(service, 'getResult').mockResolvedValue({} as any);

      await service.complete(USER, 'sub-2');

      const created = prisma.assessmentResult.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ extraversion_score: 50, openness_score: 50, overall_score: 50, previous_result_id: null });
    });

    it('is idempotent: finishing an already finished attempt returns the same result', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(inProgress({ status: 'completed', result: { id: 'existing' } }));
      jest.spyOn(service, 'getResult').mockResolvedValue({ id: 'existing' } as any);

      await expect(service.complete(USER, 'sub-2')).resolves.toEqual({ id: 'existing' });
      expect(prisma.assessmentResult.create).not.toHaveBeenCalled();
    });

    it('returns the winner’s result if two completions race', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue(inProgress());
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      prisma.assessmentResult.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' }),
      );
      prisma.assessmentResult.findUnique.mockResolvedValue({ id: 'winner' });
      jest.spyOn(service, 'getResult').mockResolvedValue({ id: 'winner' } as any);

      await expect(service.complete(USER, 'sub-2')).resolves.toEqual({ id: 'winner' });
    });
  });

  describe('results', () => {
    const resultRow = (assessment: object, overrides: object = {}) => ({
      id: 'res-1',
      is_current: true,
      result_version: '1.0.0',
      previous_result_id: null,
      overall_score: 62,
      percentile: null,
      openness_score: 85,
      conscientiousness_score: 50,
      extraversion_score: 10,
      agreeableness_score: 70,
      neuroticism_score: 30,
      assessment,
      submission: { submission_number: 1, completed_at: new Date(Date.now() - DAY), duration_seconds: 120 },
      ...overrides,
    });

    it('404s for another person’s result', async () => {
      const { prisma, service } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      await expect(service.getResult('intruder', 'res-1')).rejects.toThrow(NotFoundException);
      expect(prisma.assessmentResult.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'res-1', user_id: 'intruder' });
    });

    it('gives the snapshot as a preview: levels only, no written interpretation', async () => {
      const { prisma, service } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(snapshot));

      const result = await service.getResult(USER, 'res-1');

      expect(result.is_preview).toBe(true);
      expect(result.profile_class).toMatchObject({ key: expect.any(String), name: expect.stringMatching(/^CL-0[1-8]$/) });
      expect(result.profile_class!.pairs_with).toHaveLength(3);
      expect(result.tier).toMatchObject({ key: 'insight' });
      expect(result.disclaimer).toBeNull();
      expect(result.traits.map((t) => t.description)).toEqual([null, null, null, null, null]);
      expect(result.traits.find((t) => t.trait === 'openness')).toMatchObject({ score: 85, level: 'very_high', level_label: 'Very high' });
      expect(result.traits.find((t) => t.trait === 'extraversion')).toMatchObject({ level: 'very_low' });
    });

    it('gives the full assessment a fixed written reading for every trait', async () => {
      const { prisma, service } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(full));

      const result = await service.getResult(USER, 'res-1');

      expect(result.is_preview).toBe(false);
      expect(result.disclaimer).toContain('not a diagnosis');
      for (const t of result.traits) expect(t.description).toEqual(expect.any(String));
      expect(result.traits.map((t) => t.trait)).toEqual(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']);
    });

    describe('written insights on a result', () => {
      const saved = JSON.stringify(
        Object.fromEntries(
          ['personality', 'communication', 'leadership', 'working_style', 'relationship_style', 'strengths', 'blind_spots', 'recommendations'].map((k) => [
            k,
            { summary: `A sufficiently long summary for ${k} here.`, points: ['First point here', 'Second point here'] },
          ]),
        ),
      );

      it('includes saved insights for the full assessment', async () => {
        const { prisma, service } = setup({ CLAUDE_API_KEY: 'sk-ant-api03-realkey1234567890' });
        prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(full, { ai_interpretation: saved, ai_generated_at: new Date('2026-10-01') }));
        const result = await service.getResult(USER, 'res-1');
        expect(Object.keys(result.insights!)).toHaveLength(8);
        expect(result.insights_available).toBe(true);
        expect(result.insights_generated_at).toEqual(new Date('2026-10-01'));
      });

      it('has no insights yet, but says whether they can be generated', async () => {
        const configured = setup({ CLAUDE_API_KEY: 'sk-ant-api03-realkey1234567890' });
        configured.prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(full, { ai_interpretation: null }));
        expect(await configured.service.getResult(USER, 'res-1')).toMatchObject({ insights: null, insights_available: true });

        const unconfigured = setup({});
        unconfigured.prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(full, { ai_interpretation: null }));
        expect(await unconfigured.service.getResult(USER, 'res-1')).toMatchObject({ insights: null, insights_available: false });
      });

      it('offers the short written analysis for the free snapshot too', async () => {
        const { prisma, service } = setup({ CLAUDE_API_KEY: 'sk-ant-api03-realkey1234567890' });
        prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(snapshot, { ai_interpretation: null }));
        expect(await service.getResult(USER, 'res-1')).toMatchObject({ insights: null, insights_available: true });
      });

      it('ignores damaged stored insights instead of failing to show the result', async () => {
        const { prisma, service } = setup({});
        prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(full, { ai_interpretation: '{"personality": "oops"' }));
        expect((await service.getResult(USER, 'res-1')).insights).toBeNull();
      });
    });

    it('reports when a retake opens, only on the current result', async () => {
      const { prisma, service } = setup();
      prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(snapshot));
      const current = await service.getResult(USER, 'res-1');
      expect(current.retake).toMatchObject({ available: false });
      expect(current.retake!.available_at).toBeInstanceOf(Date);

      prisma.assessmentResult.findFirst.mockResolvedValue(resultRow(snapshot, { is_current: false }));
      expect((await service.getResult(USER, 'res-1')).retake).toBeNull();
    });

    it('lists only the caller’s results, newest first, optionally for one assessment', async () => {
      const { prisma, service } = setup();
      prisma.assessmentResult.findMany.mockResolvedValue([
        { ...resultRow(full), assessment: { slug: 'ocean-full', name: 'Full', type: 'full_assessment' } },
      ]);

      const { data } = await service.listResults(USER, 'ocean-full');

      const args = prisma.assessmentResult.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ user_id: USER, assessment: { slug: 'ocean-full' } });
      expect(args.orderBy).toEqual({ calculated_at: 'desc' });
      expect(data[0].traits[0]).not.toHaveProperty('description');
    });
  });

  describe('listAssessments', () => {
    it('reports status, progress and why an assessment cannot be started', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findMany.mockResolvedValue([snapshot, full]);
      prisma.assessmentSubmission.findMany.mockResolvedValue([
        { id: 'sub-x', assessment_id: 'a-full', progress_percent: 40, _count: { answers: 20 } },
      ]);
      prisma.assessmentResult.findMany.mockResolvedValue([
        { id: 'res-1', assessment_id: 'a-snap', submission: { submission_number: 1, completed_at: new Date(Date.now() - 2 * DAY) } },
      ]);

      const { data } = await service.listAssessments(USER);

      const snap = data.find((a) => a.slug === 'ocean-snapshot')!;
      expect(snap).toMatchObject({ status: 'completed', can_start: false, blocked_reason: 'RETAKE_LOCKED', estimated_minutes: 5 });
      expect(snap.retake_available_at).toBeInstanceOf(Date);
      expect(snap.latest_result).toMatchObject({ id: 'res-1', submission_number: 1 });

      const fullRow = data.find((a) => a.slug === 'ocean-full')!;
      expect(fullRow).toMatchObject({
        status: 'in_progress',
        can_start: true,
        blocked_reason: null,
        in_progress: { submission_id: 'sub-x', progress_percent: 40, answered: 20 },
        estimated_minutes: 20,
      });
    });

    describe('prices and payment availability', () => {
      const listFull = async (config: Record<string, string>) => {
        const { prisma, service } = setup(config);
        prisma.assessment.findMany.mockResolvedValue([snapshot, full]);
        const { data } = await service.listAssessments(USER);
        return { snap: data.find((a) => a.slug === 'ocean-snapshot')!, fullRow: data.find((a) => a.slug === 'ocean-full')! };
      };

      it('shows no price and no block while payments are off', async () => {
        const { snap, fullRow } = await listFull({});
        expect(fullRow).toMatchObject({ price: null, can_start: true, blocked_reason: null });
        expect(snap.price).toBeNull();
      });

      it('shows the configured price and asks for payment once payments are on', async () => {
        const { snap, fullRow } = await listFull(PAID);
        expect(fullRow).toMatchObject({ price: { amount: 5000, currency: 'NGN' }, can_start: false, blocked_reason: 'PAYMENT_REQUIRED' });
        expect(snap).toMatchObject({ price: null, can_start: true, blocked_reason: null }); // the snapshot is always free
      });

      it('says "unavailable" (not "pay now") when payments are required but no price is configured', async () => {
        const { fullRow } = await listFull({ ...PAID, FULL_ASSESSMENT_PRICE: '' });
        expect(fullRow).toMatchObject({ price: null, can_start: false, blocked_reason: 'PAYMENT_UNAVAILABLE' });
      });

      it('says "unavailable" when there is no valid payment provider key', async () => {
        const { fullRow } = await listFull({ ...PAID, PAYSTACK_SECRET_KEY: 'sk_test_xxxxx' });
        expect(fullRow.blocked_reason).toBe('PAYMENT_UNAVAILABLE');
      });

      it('lets a person who has already paid start', async () => {
        const { prisma, service } = setup(PAID);
        prisma.assessment.findMany.mockResolvedValue([full]);
        prisma.payment.count.mockResolvedValue(1);
        prisma.assessmentSubmission.count.mockResolvedValue(0);
        const { data } = await service.listAssessments(USER);
        expect(data[0]).toMatchObject({ can_start: true, blocked_reason: null });
      });
    });

    it('only lists published platform assessments', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findMany.mockResolvedValue([]);
      await service.listAssessments(USER);
      expect(prisma.assessment.findMany.mock.calls[0][0].where).toMatchObject({
        organization_id: null,
        deleted_at: null,
        published_at: { not: null },
      });
    });
  });

  describe('company attempts', () => {
    const ORG = 'org-1';
    const memberOf = (prisma: any) => prisma.organizationMember.findMany.mockResolvedValue([{ organization: { id: ORG, name: 'Acme Co' } }]);

    it('lets a covered employee start the full assessment for the company without paying, and records the company', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      memberOf(prisma);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assessmentSubmission.create.mockResolvedValue({ id: 'sub-co' });
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-co' } as any);

      await service.start(USER, full.id, ORG);

      expect(prisma.payment.count).not.toHaveBeenCalled();
      expect(prisma.assessmentSubmission.create.mock.calls[0][0].data).toMatchObject({ organization_id: ORG, user_id: USER });
    });

    it('refuses a company the person is not covered by (403) and never creates an attempt', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      memberOf(prisma);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);

      const error: any = await service.start(USER, full.id, 'some-other-org').catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(403);
      expect(error.getResponse()).toMatchObject({ code: 'COMPANY_COVER_UNAVAILABLE' });
      expect(prisma.assessmentSubmission.create).not.toHaveBeenCalled();
    });

    it('does not let the free snapshot be taken for a company', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findFirst.mockResolvedValue(snapshot);
      memberOf(prisma);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      await expect(service.start(USER, snapshot.id, ORG)).rejects.toThrow(HttpException);
    });

    it('still asks a private attempt to pay', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      memberOf(prisma);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      const error: any = await service.start(USER, full.id).catch((e) => e);
      expect(error.getResponse()).toMatchObject({ code: 'PAYMENT_REQUIRED' });
    });

    it('does not count company attempts as used-up personal payments', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(full);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      await service.start(USER, full.id).catch(() => undefined);
      expect(prisma.assessmentSubmission.count.mock.calls[0][0].where).toMatchObject({ organization_id: null });
    });

    it('offers the company cover on the full assessment only', async () => {
      const { prisma, service } = setup();
      prisma.assessment.findMany.mockResolvedValue([snapshot, full]);
      memberOf(prisma);
      const { data } = await service.listAssessments(USER);
      expect(data.find((a: any) => a.type === 'free_snapshot')!.company_cover).toBeNull();
      expect(data.find((a: any) => a.type === 'full_assessment')!.company_cover).toEqual({ id: ORG, name: 'Acme Co' });
    });

    it('stamps the company onto the result when a company attempt is finished', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue({
        id: 'sub-co', assessment_id: 'a-snap', organization_id: ORG, status: 'in_progress', started_at: new Date(Date.now() - 1000),
        assessment: { ...snapshot, questions: questionRows },
        answers: questionRows.map((q) => ({ question_id: q.id, answer_value: 5 })),
        result: null,
      });
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      prisma.assessmentResult.create.mockResolvedValue({ id: 'r' });
      jest.spyOn(service, 'getResult').mockResolvedValue({ id: 'r' } as any);
      await service.complete(USER, 'sub-co');
      expect(prisma.assessmentResult.create.mock.calls[0][0].data.organization_id).toBe(ORG);
    });
  });

  describe('company-made assessments', () => {
    const ORG = 'org-1';
    const INTERP = { low: 'Low text', medium: 'Mid text', high: 'High text' };
    const custom = {
      ...snapshot,
      id: 'a-cust',
      slug: null,
      name: 'Customer service fit',
      type: 'custom_assessment',
      total_questions: 3,
      organization_id: ORG,
      scoring_method: 'custom',
      definition: { sections: [{ key: 's1', name: 'Empathy', description: null, weight: 2, interpretation: INTERP }, { key: 's2', name: 'Follow-through', description: null, weight: 1, interpretation: INTERP }] },
      questions: [
        { id: 'c1', section_key: 's1', ocean_trait: null, ocean_direction: 'positive', weight: 1, min_score: 1, max_score: 5 },
        { id: 'c2', section_key: 's1', ocean_trait: null, ocean_direction: 'reverse', weight: 1, min_score: 1, max_score: 5 },
        { id: 'c3', section_key: 's2', ocean_trait: null, ocean_direction: 'positive', weight: 1, min_score: 1, max_score: 5 },
      ],
    };
    const memberOf = (prisma: any) => prisma.organizationMember.findMany.mockResolvedValue([{ organization: { id: ORG, name: 'Acme Co' } }]);

    it('only looks for assessments that are official or belong to a company covering the person', async () => {
      const { prisma, service } = setup(PAID);
      memberOf(prisma);
      prisma.assessment.findFirst.mockResolvedValue(custom);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assessmentSubmission.create.mockResolvedValue({ id: 'sub-c' });
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-c' } as any);
      await service.start(USER, 'a-cust');
      expect(prisma.assessment.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'a-cust', deleted_at: null, published_at: { not: null }, OR: [{ organization_id: null }, { organization_id: { in: [ORG] } }] });
    });

    it('starts it for its company without any payment, even when payments are switched on', async () => {
      const { prisma, service } = setup(PAID);
      memberOf(prisma);
      prisma.assessment.findFirst.mockResolvedValue(custom);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assessmentSubmission.create.mockResolvedValue({ id: 'sub-c' });
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-c' } as any);
      await service.start(USER, 'a-cust', 'some-other-org-ignored');
      expect(prisma.payment.count).not.toHaveBeenCalled();
      expect(prisma.assessmentSubmission.create.mock.calls[0][0].data).toMatchObject({ organization_id: ORG, assessment_id: 'a-cust' });
    });

    it('is a 404 for someone the company does not cover (the lookup finds nothing)', async () => {
      const { prisma, service } = setup(PAID);
      prisma.assessment.findFirst.mockResolvedValue(null);
      await expect(service.start(USER, 'a-cust')).rejects.toThrow(NotFoundException);
      expect(prisma.assessment.findFirst.mock.calls[0][0].where.OR[1]).toEqual({ organization_id: { in: [] } });
    });

    it('scores a custom attempt by its own sections, stores the wording and leaves the OCEAN columns empty', async () => {
      const { prisma, service } = setup();
      prisma.assessmentSubmission.findFirst.mockResolvedValue({
        id: 'sub-c', assessment_id: 'a-cust', organization_id: ORG, status: 'in_progress', started_at: new Date(Date.now() - 1000),
        assessment: custom,
        answers: [{ question_id: 'c1', answer_value: 5 }, { question_id: 'c2', answer_value: 1 }, { question_id: 'c3', answer_value: 1 }],
        result: null,
      });
      prisma.assessmentResult.findFirst.mockResolvedValue(null);
      prisma.assessmentResult.create.mockResolvedValue({ id: 'r-c' });
      jest.spyOn(service, 'getResult').mockResolvedValue({ id: 'r-c' } as any);

      await service.complete(USER, 'sub-c');

      const data = prisma.assessmentResult.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ organization_id: ORG, openness_score: null, neuroticism_score: null, overall_score: 66.7 });
      expect(data.custom_scores.sections.map((x: any) => [x.key, x.score, x.text])).toEqual([['s1', 100, 'High text'], ['s2', 0, 'Low text']]);
      expect(data.custom_scores.overall).toMatchObject({ score: 66.7, level_label: 'High' });
    });

    it('lists only published assessments of covering companies, with the person’s own progress', async () => {
      const { prisma, service } = setup();
      memberOf(prisma);
      prisma.assessment.findMany.mockResolvedValue([custom]);
      prisma.assessmentSubmission.findMany.mockResolvedValue([{ id: 's', assessment_id: 'a-cust', progress_percent: 40 }]);
      const { data } = await service.listCompanyAssessments(USER);
      expect(prisma.assessment.findMany.mock.calls[0][0].where).toMatchObject({ organization_id: { in: [ORG] }, type: 'custom_assessment', deleted_at: null, published_at: { not: null } });
      expect(data[0]).toMatchObject({ id: 'a-cust', company: { id: ORG, name: 'Acme Co' }, status: 'in_progress', in_progress: { progress_percent: 40 }, can_start: true });
    });

    it('has nothing to list when no company covers the person', async () => {
      const { service, prisma } = setup();
      expect(await service.listCompanyAssessments(USER)).toEqual({ data: [] });
      expect(prisma.assessment.findMany).not.toHaveBeenCalled();
    });

    it('locks a finished company assessment until the company approves a retake', async () => {
      const { prisma, service } = setup();
      memberOf(prisma);
      prisma.assessment.findMany.mockResolvedValue([{ ...custom, allow_retake: false }]);
      prisma.assessmentResult.findMany.mockResolvedValue([{ id: 'r', assessment_id: 'a-cust', submission: { completed_at: new Date() } }]);
      const { data } = await service.listCompanyAssessments(USER);
      expect(data[0]).toMatchObject({ status: 'completed', can_start: false, company_retake: { state: 'needs_approval' } });
    });

    it('lets the person repeat a company assessment freely once the window its author set has opened', async () => {
      const { prisma, service } = setup();
      memberOf(prisma);
      prisma.assessment.findMany.mockResolvedValue([{ ...custom, allow_retake: true, retake_interval_days: 30 }]);
      prisma.assessmentResult.findMany.mockResolvedValue([{ id: 'r', assessment_id: 'a-cust', submission: { completed_at: new Date(Date.now() - 31 * DAY) } }]);
      expect((await service.listCompanyAssessments(USER)).data[0]).toMatchObject({ can_start: true, company_retake: null });
    });

    it('lets the person start again once the company has approved, and says a request is waiting before that', async () => {
      const { prisma, service } = setup();
      memberOf(prisma);
      prisma.assessment.findMany.mockResolvedValue([custom]);
      prisma.assessmentResult.findMany.mockResolvedValue([{ id: 'r', assessment_id: 'a-cust', submission: { completed_at: new Date() } }]);
      prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q', status: 'requested', expires_at: null });
      expect((await service.listCompanyAssessments(USER)).data[0]).toMatchObject({ can_start: false, company_retake: { state: 'requested' } });
      prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q', status: 'approved', expires_at: new Date(Date.now() + 1e6) });
      expect((await service.listCompanyAssessments(USER)).data[0]).toMatchObject({ can_start: true, company_retake: { state: 'approved' } });
    });
  });

  describe('with payments switched off', () => {
    const OFF = { ...PAID, PAYMENTS_ENABLED: 'false' };

    it('makes the full assessment free: no price, nothing blocked, and starting needs no payment', async () => {
      const { prisma, service } = setup(OFF);
      prisma.assessment.findMany.mockResolvedValue([snapshot, full]);
      const { data } = await service.listAssessments(USER);
      const f = data.find((a: any) => a.type === 'full_assessment')!;
      expect(f).toMatchObject({ price: null, blocked_reason: null, can_start: true });

      prisma.assessment.findFirst.mockResolvedValue(full);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assessmentSubmission.create.mockResolvedValue({ id: 'sub-free' });
      jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-free' } as any);
      await expect(service.start(USER, full.id)).resolves.toMatchObject({ resumed: false });
      expect(prisma.payment.count).not.toHaveBeenCalled();
    });

    it('says no purchase is needed at checkout time', async () => {
      const { prisma, service } = setup(OFF);
      prisma.assessment.findFirst.mockResolvedValue(full);
      prisma.assessmentSubmission.findFirst.mockResolvedValue(null);
      expect(await service.checkoutEligibility(USER, full.id)).toMatchObject({ requiresPayment: false });
    });

    it('lets company members take company assessments without any plan on the company', async () => {
      const { prisma, service } = setup(OFF);
      prisma.organizationMember.findMany.mockResolvedValue([{ organization: { id: 'org-1', name: 'Acme Co' } }]);
      await service.companyCovers(USER);
      expect(prisma.organizationMember.findMany.mock.calls[0][0].where.organization).toEqual({ deleted_at: null, status: 'active' });
    });

    it('with payments ON the company must have an active plan', async () => {
      const { prisma, service } = setup(PAID);
      await service.companyCovers(USER);
      expect(prisma.organizationMember.findMany.mock.calls[0][0].where.organization.subscriptions).toBeDefined();
    });
  });
});

describe('repeating an assessment through a company', () => {
  const ORG = 'org-1';
  const done = { id: 'old-sub', completed_at: new Date(Date.now() - 10 * DAY) };

  const covered = (prisma: any) => {
    prisma.organizationMember.findMany.mockResolvedValue([{ organization: { id: ORG, name: 'Acme Co' } }]);
    prisma.assessment.findFirst.mockResolvedValue(full);
    prisma.assessmentSubmission.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.status === 'completed' ? done : null));
    prisma.assessmentSubmission.count.mockResolvedValue(1); // finished once through this company
  };

  it('needs the company’s approval, even though the personal retake window is irrelevant here', async () => {
    const { prisma, service } = setup(PAID);
    covered(prisma);
    const e: any = await service.start(USER, full.id, ORG).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'RETAKE_NEEDS_APPROVAL', organization_id: ORG, request_status: null });
    expect(prisma.assessmentSubmission.create).not.toHaveBeenCalled();
  });

  it('says so when a request is already waiting', async () => {
    const { prisma, service } = setup(PAID);
    covered(prisma);
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q1', status: 'requested', expires_at: null });
    const e: any = await service.start(USER, full.id, ORG).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'RETAKE_NEEDS_APPROVAL', request_status: 'requested' });
  });

  it('starts once approved, uses the approval up and links the new attempt to the old one', async () => {
    const { prisma, service } = setup(PAID);
    covered(prisma);
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q1', status: 'approved', expires_at: new Date(Date.now() + DAY) });
    prisma.assessmentSubmission.create.mockResolvedValue({ id: 'sub-new' });
    jest.spyOn(service, 'getSubmission').mockResolvedValue({ id: 'sub-new' } as any);
    await expect(service.start(USER, full.id, ORG)).resolves.toMatchObject({ resumed: false });
    expect(prisma.retakeRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'q1', status: 'approved' }, data: { status: 'used', used_at: expect.any(Date), open_key: null } });
    expect(prisma.assessmentSubmission.create.mock.calls[0][0].data).toMatchObject({ organization_id: ORG, previous_submission_id: 'old-sub' });
  });

  it('fails when another start used the approval first', async () => {
    const { prisma, service } = setup(PAID);
    covered(prisma);
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q1', status: 'approved', expires_at: new Date(Date.now() + DAY) });
    prisma.retakeRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.start(USER, full.id, ORG)).rejects.toMatchObject({ response: { code: 'RETAKE_NEEDS_APPROVAL' } });
    expect(prisma.assessmentSubmission.create).not.toHaveBeenCalled();
  });

  it('a private retake still follows the retake window and ignores company approvals', async () => {
    const { prisma, service } = setup(PAID);
    covered(prisma);
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'q1', status: 'approved', expires_at: new Date(Date.now() + DAY) });
    const e: any = await service.start(USER, full.id).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'RETAKE_LOCKED' });
    expect(prisma.retakeRequest.updateMany).not.toHaveBeenCalled();
  });
});
