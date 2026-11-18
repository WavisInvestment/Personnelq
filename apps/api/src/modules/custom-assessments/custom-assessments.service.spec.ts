import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { CustomAssessmentsService } from './custom-assessments.service';
import { publishProblem } from './definition';

const ORG = 'org-1';
const ADMIN = { id: 'u-admin', first_name: 'Ada', last_name: 'Boss' };
const INTERP = { low: 'Low text', medium: 'Mid text', high: 'High text' };

const draft = (over: object = {}) => ({
  name: 'Customer service fit',
  description: 'How we serve people',
  allow_retake: false,
  retake_interval_days: 90,
  sections: [
    { name: 'Empathy', description: null, weight: 2, interpretation: INTERP, questions: [{ text: 'I listen before I answer.', reverse: false, weight: 1 }, { text: 'I get impatient with upset customers.', reverse: true, weight: 2 }] },
    { name: 'Follow-through', description: 'Closing the loop', weight: 1, interpretation: INTERP, questions: [{ text: 'I confirm the problem is solved.', reverse: false, weight: 1 }] },
  ],
  ...over,
});

const row = (over: object = {}) => ({
  id: 'a1', organization_id: ORG, name: 'Customer service fit', description: null, version: '1.0.0', type: 'custom_assessment', published_at: null, allow_retake: false, retake_interval_days: 90, total_questions: 3,
  definition: { sections: [{ key: 's1', name: 'Empathy', description: null, weight: 2, interpretation: INTERP }, { key: 's2', name: 'Follow-through', description: null, weight: 1, interpretation: INTERP }] },
  questions: [
    { question_number: 1, question_text: 'I listen before I answer.', section_key: 's1', ocean_direction: 'positive', weight: 1, min_score: 1, max_score: 5, question_type: 'likert', options: [], option_values: [] },
    { question_number: 2, question_text: 'I get impatient with upset customers.', section_key: 's1', ocean_direction: 'reverse', weight: 2, min_score: 1, max_score: 5, question_type: 'likert', options: [], option_values: [] },
    { question_number: 3, question_text: 'I confirm the problem is solved.', section_key: 's2', ocean_direction: 'positive', weight: 1, min_score: 1, max_score: 5, question_type: 'likert', options: [], option_values: [] },
  ],
  ...over,
});

function setup(permissions: string[] = ['manage:assessments', 'read:team_results', 'export:results']) {
  const prisma: any = {
    assessment: { findFirst: jest.fn().mockResolvedValue(row()), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'new-id' }), update: jest.fn() },
    assessmentQuestion: { deleteMany: jest.fn(), createMany: jest.fn() },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    assessmentResult: { findMany: jest.fn().mockResolvedValue([]) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const rbac: any = { permissionsInOrganization: jest.fn().mockResolvedValue(permissions) };
  return { prisma, service: new CustomAssessmentsService(prisma, rbac) };
}

describe('permissions', () => {
  it.each([
    ['list', (s: any) => s.list('u', ORG)],
    ['create', (s: any) => s.create(ADMIN, ORG, 'Name here')],
    ['save', (s: any) => s.save(ADMIN, ORG, 'a1', draft())],
    ['publish', (s: any) => s.publish(ADMIN, ORG, 'a1')],
    ['delete', (s: any) => s.remove(ADMIN, ORG, 'a1')],
    ['results', (s: any) => s.results('u', ORG, 'a1')],
    ['csv', (s: any) => s.resultsCsv(ADMIN, ORG, 'a1')],
  ])('%s is refused without the company permission, before touching any data', async (_n, run) => {
    const { service, prisma } = setup([]);
    await expect(run(service)).rejects.toThrow(ForbiddenException);
    expect(prisma.assessment.findFirst).not.toHaveBeenCalled();
    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });

  it('a person who can only read results cannot edit', async () => {
    const { service } = setup(['read:team_results']);
    await expect(service.save(ADMIN, ORG, 'a1', draft())).rejects.toThrow(ForbiddenException);
    await expect(service.get('u', ORG, 'a1')).resolves.toMatchObject({ id: 'a1' });
  });

  it('another company’s assessment is a 404', async () => {
    const { service, prisma } = setup();
    prisma.assessment.findFirst.mockResolvedValue(null);
    await expect(service.get('u', ORG, 'other')).rejects.toThrow(NotFoundException);
    expect(prisma.assessment.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'other', organization_id: ORG, type: 'custom_assessment', deleted_at: null });
  });
});

describe('create', () => {
  it('makes an empty draft owned by the company', async () => {
    const { service, prisma } = setup();
    expect(await service.create(ADMIN, ORG, '  Onboarding check  ')).toEqual({ id: 'new-id' });
    expect(prisma.assessment.create.mock.calls[0][0].data).toMatchObject({ organization_id: ORG, name: 'Onboarding check', type: 'custom_assessment', scoring_method: 'custom', total_questions: 0, created_by: ADMIN.id, definition: { sections: [] } });
    expect(prisma.assessment.create.mock.calls[0][0].data.published_at).toBeUndefined();
  });

  it('refuses a tiny name and a company over the limit', async () => {
    const { service, prisma } = setup();
    await expect(service.create(ADMIN, ORG, 'ab')).rejects.toThrow(HttpException);
    await expect(service.create(ADMIN, ORG, 12345)).rejects.toThrow(HttpException);
    prisma.assessment.count.mockResolvedValue(25);
    const e: any = await service.create(ADMIN, ORG, 'One too many').catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'TOO_MANY_ASSESSMENTS' });
  });
});

describe('save', () => {
  it('replaces the questions: positional section keys, global numbering, reverse and weight kept, the standard answer scale', async () => {
    const { service, prisma } = setup();
    await service.save(ADMIN, ORG, 'a1', draft());
    expect(prisma.assessmentQuestion.deleteMany).toHaveBeenCalledWith({ where: { assessment_id: 'a1' } });
    const rows = prisma.assessmentQuestion.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.question_number, r.section_key, r.ocean_direction, r.weight])).toEqual([[1, 's1', 'positive', 1], [2, 's1', 'reverse', 2], [3, 's2', 'positive', 1]]);
    expect(rows[0]).toMatchObject({ min_score: 1, max_score: 5, option_values: [1, 2, 3, 4, 5] });
    expect(rows[0].options[0]).toBe('Strongly disagree');
    const data = prisma.assessment.update.mock.calls[0][0].data;
    expect(data.total_questions).toBe(3);
    expect(data.definition.sections.map((s: any) => [s.key, s.name, s.weight])).toEqual([['s1', 'Empathy', 2], ['s2', 'Follow-through', 1]]);
  });

  it('refuses a published assessment (409) and changes nothing', async () => {
    const { service, prisma } = setup();
    prisma.assessment.findFirst.mockResolvedValue(row({ published_at: new Date() }));
    const e: any = await service.save(ADMIN, ORG, 'a1', draft()).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'ASSESSMENT_PUBLISHED' });
    expect(prisma.assessmentQuestion.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown field', { ...draft(), role: 'admin' }],
    ['a section weight of 9', draft({ sections: [{ ...draft().sections[0], weight: 9 }] })],
    ['a question weight of 0', draft({ sections: [{ ...draft().sections[0], questions: [{ text: 'Hello there', reverse: false, weight: 0 }] }] })],
    ['11 sections', draft({ sections: Array.from({ length: 11 }, () => draft().sections[0]) })],
    ['a non-boolean reverse flag', draft({ sections: [{ ...draft().sections[0], questions: [{ text: 'Hello there', reverse: 'yes', weight: 1 }] }] })],
    ['a retake interval of 0 days', draft({ retake_interval_days: 0 })],
    ['over 100 questions in total', draft({ sections: Array.from({ length: 3 }, () => ({ ...draft().sections[0], questions: Array.from({ length: 40 }, () => ({ text: 'A fine question', reverse: false, weight: 1 })) })) })],
  ])('rejects %s (400) without touching the questions', async (_n, body) => {
    const { service, prisma } = setup();
    const e: any = await service.save(ADMIN, ORG, 'a1', body).catch((x) => x);
    expect(e.getStatus()).toBe(400);
    expect(e.getResponse()).toMatchObject({ code: 'INVALID_ASSESSMENT' });
    expect(prisma.assessmentQuestion.deleteMany).not.toHaveBeenCalled();
  });

  it('accepts an unfinished draft (no sections yet)', async () => {
    const { service } = setup();
    await expect(service.save(ADMIN, ORG, 'a1', draft({ name: '', sections: [] }))).resolves.toBeDefined();
  });
});

describe('publish', () => {
  it('locks a ready assessment and records it', async () => {
    const { service, prisma } = setup();
    await service.publish(ADMIN, ORG, 'a1');
    const data = prisma.assessment.update.mock.calls[0][0].data;
    expect(data.published_at).toBeInstanceOf(Date);
    expect(data.is_locked).toBe(true);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'assessment.published', resource_id: 'a1' });
  });

  it('says what is missing, in plain words', async () => {
    const { service, prisma } = setup();
    const msg = async (r: object) => {
      prisma.assessment.findFirst.mockResolvedValue(row(r));
      const e: any = await service.publish(ADMIN, ORG, 'a1').catch((x) => x);
      expect(e.getResponse().code).toBe('NOT_READY');
      return e.getResponse().message as string;
    };
    expect(await msg({ definition: { sections: [] }, questions: [] })).toMatch(/at least one section/);
    expect(await msg({ questions: row().questions.filter((q) => q.section_key !== 's2') })).toMatch(/Follow-through/);
    expect(await msg({ name: 'ab' })).toMatch(/name/);
    expect(await msg({ questions: [{ ...row().questions[0], question_text: 'Hi' }, ...row().questions.slice(1)] })).toMatch(/Question 1 in “Empathy”/);
    expect(prisma.assessment.update).not.toHaveBeenCalled();
  });

  it('refuses to publish twice', async () => {
    const { service, prisma } = setup();
    prisma.assessment.findFirst.mockResolvedValue(row({ published_at: new Date() }));
    const e: any = await service.publish(ADMIN, ORG, 'a1').catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'ASSESSMENT_PUBLISHED' });
  });

  it('publishProblem catches duplicate section names regardless of case', () => {
    const d = draft({ sections: [draft().sections[0], { ...draft().sections[1], name: 'EMPATHY' }] }) as any;
    expect(publishProblem(d)).toMatch(/Two sections are called/);
    expect(publishProblem(draft() as any)).toBeNull();
  });
});

describe('new version and archive', () => {
  it('copies into a fresh unpublished draft with the next major version', async () => {
    const { service, prisma } = setup();
    prisma.assessment.findFirst.mockResolvedValue(row({ published_at: new Date(), version: '2.0.0' }));
    expect(await service.newVersion(ADMIN, ORG, 'a1')).toEqual({ id: 'new-id' });
    const data = prisma.assessment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ version: '3.0.0', organization_id: ORG, name: 'Customer service fit', total_questions: 3 });
    expect(data.published_at).toBeUndefined();
    expect(prisma.assessmentQuestion.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(prisma.assessmentQuestion.createMany.mock.calls[0][0].data[0].assessment_id).toBe('new-id');
  });

  it('archiving soft-deletes and ends attempts in progress, never touching results', async () => {
    const { service, prisma } = setup();
    expect(await service.remove(ADMIN, ORG, 'a1')).toEqual({ archived: true });
    expect(prisma.assessment.update.mock.calls[0][0].data.deleted_at).toBeInstanceOf(Date);
    expect(prisma.assessmentSubmission.updateMany).toHaveBeenCalledWith({ where: { assessment_id: 'a1', status: 'in_progress' }, data: { status: 'abandoned' } });
  });
});

describe('results', () => {
  const member = (id: string, extra: object = {}) => ({ user_id: id, department: 'Sales', job_title: null, user: { first_name: id, last_name: 'X', email: `${id}@acme.test` }, ...extra });
  const stored = (a: number, b: number) => ({ sections: [{ key: 's1', name: 'Empathy', score: a, level_label: 'x', text: 't' }, { key: 's2', name: 'Follow-through', score: b, level_label: 'y', text: 't' }], overall: { score: (a + b) / 2, level: 'moderate', level_label: 'Moderate' } });

  it('uses each person’s latest company result, counts statuses and averages sections', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([member('a'), member('b'), member('c')]);
    prisma.assessmentResult.findMany.mockResolvedValue([
      { user_id: 'a', calculated_at: new Date('2026-10-02'), custom_scores: stored(80, 60) },
      { user_id: 'a', calculated_at: new Date('2026-09-01'), custom_scores: stored(10, 10) },
    ]);
    prisma.assessmentSubmission.findMany.mockResolvedValue([{ user_id: 'b', progress_percent: 40 }]);
    const out = await service.results('u', ORG, 'a1');
    expect(out.team).toMatchObject({ members: 3, completed: 1, in_progress: 1, not_started: 1, completion_pct: 33, overall_average: 70 });
    expect(out.sections[0]).toMatchObject({ name: 'Empathy', average: 80, high: 1, low: 0 });
    expect(out.members.map((m) => m.status)).toEqual(['completed', 'in_progress', 'not_started']);
    expect(prisma.assessmentResult.findMany.mock.calls[0][0].where).toMatchObject({ assessment_id: 'a1', organization_id: ORG, deleted_at: null });
  });

  it('exports a spreadsheet-safe CSV and records it', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([member('a', { department: '=evil()' })]);
    prisma.assessmentResult.findMany.mockResolvedValue([{ user_id: 'a', calculated_at: new Date('2026-10-02'), custom_scores: stored(80, 60) }]);
    const { csv, filename } = await service.resultsCsv(ADMIN, ORG, 'a1');
    expect(csv.startsWith('﻿Name,Email,Department')).toBe(true);
    expect(csv).toContain("'=evil()");
    expect(csv).toContain('Empathy score,Empathy level,Follow-through score,Follow-through level');
    expect(filename).toMatch(/^customer-service-fit-results-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'results.exported', actor_id: ADMIN.id });
  });
});
