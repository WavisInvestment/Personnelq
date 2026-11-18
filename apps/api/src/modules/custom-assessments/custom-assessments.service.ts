import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { RbacService } from '../../common/rbac/rbac.service';
import { PrismaService } from '../../database/prisma.service';
import { LIKERT_LABELS, LIKERT_VALUES } from '../assessments/catalog/ocean-items';
import { CustomSection, parseCustomScores } from '../assessments/scoring/custom-scoring';
import { DraftInput, draftInput, firstIssue, LIMITS, nameInput, publishProblem } from './definition';

export const CUSTOM_TYPE = 'custom_assessment';

interface Person {
  id: string;
  first_name: string;
  last_name: string;
}

const fail = (status: HttpStatus, code: string, message: string) => new HttpException({ statusCode: status, message, code }, status);

type Stored = { sections?: CustomSection[] } | null;

@Injectable()
export class CustomAssessmentsService {
  private readonly logger = new Logger(CustomAssessmentsService.name);

  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async require(userId: string, organizationId: string, permission: string) {
    const permissions = await this.rbac.permissionsInOrganization(userId, organizationId);
    if (!permissions.includes(permission)) throw new ForbiddenException('You don’t have access to this company.');
  }

  private audit(organizationId: string, actorId: string, action: string, resourceId: string, changes?: Prisma.InputJsonValue) {
    return this.prisma.auditLog
      .create({ data: { organization_id: organizationId, actor_id: actorId, user_id: actorId, action, resource_type: 'assessment', resource_id: resourceId, changes } })
      .catch((err) => this.logger.error(`Audit log write failed for ${action}: ${(err as Error).message}`));
  }

  private async own(organizationId: string, id: string) {
    const a = await this.prisma.assessment.findFirst({
      where: { id, organization_id: organizationId, type: CUSTOM_TYPE, deleted_at: null },
      include: { questions: { orderBy: { question_number: 'asc' } } },
    });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  /** The assessment as the editor shows it: sections with their questions in order. */
  private editorModel(a: Awaited<ReturnType<CustomAssessmentsService['own']>>) {
    const sections = ((a.definition as Stored)?.sections ?? []).map((s) => ({
      name: s.name,
      description: s.description,
      weight: s.weight,
      interpretation: s.interpretation,
      questions: a.questions.filter((q) => q.section_key === s.key).map((q) => ({ text: q.question_text, reverse: q.ocean_direction === 'reverse', weight: Math.round(q.weight) })),
    }));
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      version: a.version,
      status: a.published_at ? ('published' as const) : ('draft' as const),
      published_at: a.published_at,
      allow_retake: a.allow_retake,
      retake_interval_days: a.retake_interval_days,
      sections,
    };
  }

  private async team(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organization_id: organizationId, status: 'active', deleted_at: null, consented_at: { not: null } },
      orderBy: { joined_at: 'asc' },
      select: { user_id: true, department: true, job_title: true, user: { select: { first_name: true, last_name: true, email: true } } },
    });
    return members.map((m) => ({ user_id: m.user_id, name: `${m.user.first_name} ${m.user.last_name}`.trim(), email: m.user.email, department: m.department, job_title: m.job_title }));
  }

  // ------------------------------------------------------------ list, create, read

  async list(userId: string, organizationId: string) {
    await this.require(userId, organizationId, 'read:team_results');
    const rows = await this.prisma.assessment.findMany({
      where: { organization_id: organizationId, type: CUSTOM_TYPE, deleted_at: null },
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, description: true, version: true, published_at: true, total_questions: true, definition: true, created_at: true },
    });
    const ids = rows.map((r) => r.id);
    const team = await this.team(organizationId);
    const teamIds = team.map((t) => t.user_id);

    const [results, inProgress] = ids.length
      ? await Promise.all([
          this.prisma.assessmentResult.findMany({ where: { assessment_id: { in: ids }, organization_id: organizationId, user_id: { in: teamIds }, deleted_at: null }, select: { assessment_id: true, user_id: true } }),
          this.prisma.assessmentSubmission.findMany({ where: { assessment_id: { in: ids }, organization_id: organizationId, user_id: { in: teamIds }, status: 'in_progress', deleted_at: null }, select: { assessment_id: true, user_id: true } }),
        ])
      : [[], []];
    const distinct = (list: { assessment_id: string; user_id: string }[], id: string) => new Set(list.filter((x) => x.assessment_id === id).map((x) => x.user_id)).size;

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        version: r.version,
        status: r.published_at ? 'published' : 'draft',
        published_at: r.published_at,
        sections: ((r.definition as Stored)?.sections ?? []).length,
        questions: r.total_questions,
        completed: distinct(results, r.id),
        in_progress: distinct(inProgress, r.id),
        team_size: team.length,
      })),
    };
  }

  async create(actor: Person, organizationId: string, name: unknown) {
    await this.require(actor.id, organizationId, 'manage:assessments');
    const parsed = nameInput.min(3, 'Give the assessment a name (at least 3 characters).').safeParse(name);
    if (!parsed.success) throw fail(HttpStatus.BAD_REQUEST, 'INVALID_ASSESSMENT', parsed.error.issues[0].message);

    const count = await this.prisma.assessment.count({ where: { organization_id: organizationId, type: CUSTOM_TYPE, deleted_at: null } });
    if (count >= LIMITS.assessmentsPerOrganization) throw fail(HttpStatus.CONFLICT, 'TOO_MANY_ASSESSMENTS', `A company can have up to ${LIMITS.assessmentsPerOrganization} custom assessments. Archive one first.`);

    const created = await this.prisma.assessment.create({
      data: {
        organization_id: organizationId,
        name: parsed.data,
        type: CUSTOM_TYPE,
        framework: 'custom',
        scoring_method: 'custom',
        version: '1.0.0',
        total_questions: 0,
        allow_retake: false,
        retake_interval_days: 90,
        definition: { sections: [] },
        created_by: actor.id,
      },
      select: { id: true },
    });
    await this.audit(organizationId, actor.id, 'assessment.created', created.id);
    return { id: created.id };
  }

  async get(userId: string, organizationId: string, id: string) {
    await this.require(userId, organizationId, 'read:team_results');
    return this.editorModel(await this.own(organizationId, id));
  }

  // ------------------------------------------------------------ editing

  async save(actor: Person, organizationId: string, id: string, body: unknown) {
    await this.require(actor.id, organizationId, 'manage:assessments');
    const a = await this.own(organizationId, id);
    if (a.published_at) throw fail(HttpStatus.CONFLICT, 'ASSESSMENT_PUBLISHED', 'A published assessment can’t be changed. Create a new version to edit it.');

    const parsed = draftInput.safeParse(body);
    if (!parsed.success) throw fail(HttpStatus.BAD_REQUEST, 'INVALID_ASSESSMENT', firstIssue(parsed.error));
    const d = parsed.data;

    // Section keys are positional ("s1", "s2"...). The whole definition is replaced, which is safe because nobody has
    // taken a draft: only published assessments have answers.
    const sections = d.sections.map((s, i) => ({ key: `s${i + 1}`, name: s.name, description: s.description ?? null, weight: s.weight, interpretation: s.interpretation }));
    const questions = d.sections.flatMap((s, i) => s.questions.map((q) => ({ section: `s${i + 1}`, ...q })));

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { assessment_id: id } });
      await tx.assessment.update({
        where: { id },
        data: {
          name: d.name,
          description: d.description ?? null,
          allow_retake: d.allow_retake,
          retake_interval_days: d.retake_interval_days,
          total_questions: questions.length,
          definition: { sections } as unknown as Prisma.InputJsonObject,
        },
      });
      if (questions.length) {
        await tx.assessmentQuestion.createMany({
          data: questions.map((q, n) => ({
            assessment_id: id,
            question_number: n + 1,
            question_text: q.text,
            question_type: 'likert',
            section_key: q.section,
            ocean_direction: q.reverse ? 'reverse' : 'positive',
            weight: q.weight,
            min_score: 1,
            max_score: 5,
            options: LIKERT_LABELS,
            option_values: LIKERT_VALUES,
          })),
        });
      }
    });
    return this.editorModel(await this.own(organizationId, id));
  }

  async publish(actor: Person, organizationId: string, id: string) {
    await this.require(actor.id, organizationId, 'manage:assessments');
    const a = await this.own(organizationId, id);
    if (a.published_at) throw fail(HttpStatus.CONFLICT, 'ASSESSMENT_PUBLISHED', 'This assessment is already published.');

    const model = this.editorModel(a);
    const check = draftInput.safeParse({ name: model.name, description: model.description, allow_retake: model.allow_retake, retake_interval_days: model.retake_interval_days, sections: model.sections });
    const problem = check.success ? publishProblem(check.data as DraftInput) : firstIssue(check.error);
    if (problem) throw fail(HttpStatus.BAD_REQUEST, 'NOT_READY', problem);

    // Published assessments are locked: people's answers and results always match what they were asked.
    await this.prisma.assessment.update({ where: { id }, data: { published_at: new Date(), is_locked: true } });
    await this.audit(organizationId, actor.id, 'assessment.published', id, { version: a.version, questions: a.total_questions });
    return this.editorModel(await this.own(organizationId, id));
  }

  /** Starts a new editable draft from an existing one (usually a published one), with the next major version. */
  async newVersion(actor: Person, organizationId: string, id: string) {
    await this.require(actor.id, organizationId, 'manage:assessments');
    const a = await this.own(organizationId, id);
    const count = await this.prisma.assessment.count({ where: { organization_id: organizationId, type: CUSTOM_TYPE, deleted_at: null } });
    if (count >= LIMITS.assessmentsPerOrganization) throw fail(HttpStatus.CONFLICT, 'TOO_MANY_ASSESSMENTS', `A company can have up to ${LIMITS.assessmentsPerOrganization} custom assessments. Archive one first.`);

    const major = parseInt(a.version.split('.')[0], 10) || 1;
    const copy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: {
          organization_id: organizationId,
          name: a.name,
          description: a.description,
          type: CUSTOM_TYPE,
          framework: 'custom',
          scoring_method: 'custom',
          version: `${major + 1}.0.0`,
          total_questions: a.total_questions,
          allow_retake: a.allow_retake,
          retake_interval_days: a.retake_interval_days,
          definition: (a.definition ?? { sections: [] }) as Prisma.InputJsonObject,
          created_by: actor.id,
        },
        select: { id: true },
      });
      if (a.questions.length) {
        await tx.assessmentQuestion.createMany({
          data: a.questions.map((q) => ({
            assessment_id: created.id,
            question_number: q.question_number,
            question_text: q.question_text,
            question_type: q.question_type,
            section_key: q.section_key,
            ocean_direction: q.ocean_direction,
            weight: q.weight,
            min_score: q.min_score,
            max_score: q.max_score,
            options: q.options,
            option_values: q.option_values,
          })),
        });
      }
      return created;
    });
    await this.audit(organizationId, actor.id, 'assessment.versioned', copy.id, { from: id });
    return { id: copy.id };
  }

  /** Archives it: people can no longer start it, attempts in progress end, finished results stay with their owners. */
  async remove(actor: Person, organizationId: string, id: string) {
    await this.require(actor.id, organizationId, 'manage:assessments');
    await this.own(organizationId, id);
    await this.prisma.$transaction([
      this.prisma.assessment.update({ where: { id }, data: { deleted_at: new Date() } }),
      this.prisma.assessmentSubmission.updateMany({ where: { assessment_id: id, status: 'in_progress' }, data: { status: 'abandoned' } }),
    ]);
    await this.audit(organizationId, actor.id, 'assessment.archived', id);
    return { archived: true };
  }

  // ------------------------------------------------------------ results

  private async resultRows(organizationId: string, id: string) {
    const a = await this.own(organizationId, id);
    const sections = ((a.definition as Stored)?.sections ?? []) as CustomSection[];
    const team = await this.team(organizationId);
    const ids = team.map((t) => t.user_id);

    const [results, inProgress] = ids.length
      ? await Promise.all([
          this.prisma.assessmentResult.findMany({ where: { assessment_id: id, organization_id: organizationId, user_id: { in: ids }, deleted_at: null }, orderBy: { calculated_at: 'desc' }, select: { user_id: true, calculated_at: true, custom_scores: true } }),
          this.prisma.assessmentSubmission.findMany({ where: { assessment_id: id, organization_id: organizationId, user_id: { in: ids }, status: 'in_progress', deleted_at: null }, select: { user_id: true, progress_percent: true } }),
        ])
      : [[], []];

    const latest = new Map<string, (typeof results)[number]>();
    for (const r of results) if (!latest.has(r.user_id)) latest.set(r.user_id, r);
    const progress = new Map(inProgress.map((s) => [s.user_id, s.progress_percent]));

    const rows = team.map((m) => {
      const r = latest.get(m.user_id);
      const scores = r ? parseCustomScores(r.custom_scores) : null;
      return {
        ...m,
        status: scores ? ('completed' as const) : progress.has(m.user_id) ? ('in_progress' as const) : ('not_started' as const),
        progress_percent: scores ? 100 : (progress.get(m.user_id) ?? null),
        completed_at: scores ? r!.calculated_at : null,
        overall: scores ? { score: scores.overall.score, level_label: scores.overall.level_label } : null,
        sections: scores ? scores.sections.map((s) => ({ key: s.key, score: s.score, level_label: s.level_label })) : [],
      };
    });
    return { a, sections, rows };
  }

  async results(userId: string, organizationId: string, id: string) {
    await this.require(userId, organizationId, 'read:team_results');
    const { a, sections, rows } = await this.resultRows(organizationId, id);
    const done = rows.filter((r) => r.status === 'completed');
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
    const band = (score: number) => (score <= 40 ? 'low' : score <= 60 ? 'medium' : 'high');

    return {
      assessment: { id: a.id, name: a.name, version: a.version, status: a.published_at ? 'published' : 'draft' },
      team: {
        members: rows.length,
        completed: done.length,
        in_progress: rows.filter((r) => r.status === 'in_progress').length,
        not_started: rows.filter((r) => r.status === 'not_started').length,
        completion_pct: rows.length ? Math.round((done.length / rows.length) * 100) : 0,
        overall_average: avg(done.map((r) => r.overall!.score)),
      },
      sections: sections.map((s) => {
        const scores = done.map((r) => r.sections.find((x) => x.key === s.key)?.score).filter((x): x is number => typeof x === 'number');
        const counts = { low: 0, medium: 0, high: 0 };
        scores.forEach((x) => counts[band(x)]++);
        return { key: s.key, name: s.name, average: avg(scores), ...counts };
      }),
      members: rows,
    };
  }

  async resultsCsv(actor: Person, organizationId: string, id: string) {
    await this.require(actor.id, organizationId, 'export:results');
    const { a, sections, rows } = await this.resultRows(organizationId, id);
    const header = ['Name', 'Email', 'Department', 'Job title', 'Status', 'Completed on', 'Overall score', 'Overall level', ...sections.flatMap((s) => [`${s.name} score`, `${s.name} level`])];
    const body = [...rows]
      .sort((x, y) => x.name.localeCompare(y.name))
      .map((m) => [
        m.name, m.email, m.department, m.job_title, m.status.replace('_', ' '),
        m.completed_at ? m.completed_at.toISOString().slice(0, 10) : '',
        m.overall?.score ?? '', m.overall?.level_label ?? '',
        ...sections.flatMap((s) => {
          const x = m.sections.find((y) => y.key === s.key);
          return [x?.score ?? '', x?.level_label ?? ''];
        }),
      ]);
    await this.audit(organizationId, actor.id, 'results.exported', id, { format: 'csv', assessment: a.name, people: rows.length });
    const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'assessment';
    return { csv: toCsv(header, body), filename: `${slug}-results-${new Date().toISOString().slice(0, 10)}.csv` };
  }
}
