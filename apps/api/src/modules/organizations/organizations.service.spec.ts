import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { renderTeamReportHtml } from './team-report';

const ORG = 'org-1';
const ADMIN = { id: 'u-admin', email: 'boss@acme.test', first_name: 'Ada', last_name: 'Boss' };
const EMP = { id: 'u-emp', email: 'Eve@Acme.test', first_name: 'Eve', last_name: 'Doe' };
const TOKEN = 'T'.repeat(43);
const future = () => new Date(Date.now() + 5 * 86400000);
const past = () => new Date(Date.now() - 86400000);

function setup(permissions: string[] = ['invite:members', 'read:team_results', 'manage:team', 'export:results'], paymentsEnabled = true) {
  const prisma: any = {
    organization: { findFirst: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme Co', type: 'corporate', status: 'active' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ joined_via_organization_id: null }) },
    subscription: {
      findUnique: jest.fn().mockResolvedValue({ status: 'active', end_date: future(), seats_limit: 3, plan_name: 'Team' }),
      updateMany: jest.fn(),
    },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn(), count: jest.fn().mockResolvedValue(1), groupBy: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    employeeInvitation: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'inv-1' }), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    assessment: { findFirst: jest.fn().mockResolvedValue({ id: 'a-full' }) },
    assessmentResult: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-employee' }) },
    auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const rbac: any = { permissionsInOrganization: jest.fn().mockResolvedValue(permissions) };
  const mail: any = { sendInvitation: jest.fn().mockResolvedValue('sent'), sendReminder: jest.fn().mockResolvedValue('sent') };
  const billing: any = { frontendUrl: 'https://app.test', paymentsEnabled: () => paymentsEnabled, freeOrganizationSeats: () => 4 };
  const pdf: any = { render: jest.fn() };
  return { prisma, rbac, mail, service: new OrganizationsService(prisma, rbac, mail, billing, pdf) };
}

const pendingInvite = (over: object = {}) => ({
  id: 'inv-1', organization_id: ORG, recipient_email: 'eve@acme.test', status: 'pending', expires_at: future(), accepted_by_user_id: null,
  department: 'Sales', job_title: 'AE', organization: { id: ORG, name: 'Acme Co', status: 'active', deleted_at: null }, ...over,
});

describe('permissions', () => {
  it.each([
    ['dashboard', (s: any) => s.dashboard('u', ORG)],
    ['members', (s: any) => s.members('u', ORG)],
    ['invite', (s: any) => s.createInvitations(ADMIN, ORG, { emails: ['a@b.co'] })],
    ['export', (s: any) => s.exportCsv(ADMIN, ORG)],
    ['remove', (s: any) => s.removeMember(ADMIN, ORG, 'x')],
    ['remind', (s: any) => s.remind(ADMIN, ORG)],
  ])('%s: refuses someone without the company permission, before touching any data', async (_n, run) => {
    const { service, prisma } = setup([]);
    await expect(run(service)).rejects.toThrow(ForbiddenException);
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
    expect(prisma.employeeInvitation.create).not.toHaveBeenCalled();
  });
});

describe('createInvitations', () => {
  it('needs an active plan (402)', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: past(), seats_limit: 5 });
    const e: any = await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'] }).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });

  it('refuses more people than the open seats (members and waiting invitations both count)', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([{ user: { email: 'm@acme.test' } }, { user: { email: 'n@acme.test' } }]);
    prisma.employeeInvitation.findMany.mockResolvedValue([]);
    const e: any = await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co', 'c@d.co'] }).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'SEATS_FULL', remaining: 1 });
    expect(prisma.employeeInvitation.create).not.toHaveBeenCalled();
  });

  it('skips people who are already members or already invited, and sends the rest with a long random token', async () => {
    const { service, prisma, mail } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([{ user: { email: 'm@acme.test' } }]);
    prisma.employeeInvitation.findMany.mockResolvedValue([{ recipient_email: 'w@acme.test' }]);
    const out = await service.createInvitations(ADMIN, ORG, { emails: ['m@acme.test', 'w@acme.test', 'new@acme.test', 'new@acme.test'], department: 'Ops' });
    expect(out.invitations.map((i) => i.status)).toEqual(['already_member', 'already_invited', 'invited']);
    expect(prisma.employeeInvitation.create).toHaveBeenCalledTimes(1);
    const data = prisma.employeeInvitation.create.mock.calls[0][0].data;
    expect(data.invitation_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data).toMatchObject({ recipient_email: 'new@acme.test', department: 'Ops', organization_id: ORG, sender_id: ADMIN.id });
    expect(mail.sendInvitation).toHaveBeenCalledWith('new@acme.test', expect.objectContaining({ organization: 'Acme Co', link: `https://app.test/invite/${data.invitation_token}` }));
  });
});

describe('acceptInvitation', () => {
  it('404s a malformed or unknown token without a database lookup for the first', async () => {
    const { service, prisma } = setup();
    await expect(service.acceptInvitation(EMP, 'short')).rejects.toThrow(NotFoundException);
    expect(prisma.employeeInvitation.findUnique).not.toHaveBeenCalled();
    prisma.employeeInvitation.findUnique.mockResolvedValue(null);
    await expect(service.acceptInvitation(EMP, TOKEN)).rejects.toThrow(NotFoundException);
  });

  it('only works for the invited address (403), even with a valid link', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    const e: any = await service.acceptInvitation({ ...EMP, email: 'someone@else.test' }, TOKEN).catch((x) => x);
    expect(e.getStatus()).toBe(403);
    expect(e.getResponse()).toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', pendingInvite({ expires_at: past() }), 'INVITATION_EXPIRED'],
    ['revoked', pendingInvite({ status: 'revoked' }), 'INVITATION_REVOKED'],
    ['already used by someone else', pendingInvite({ status: 'accepted', accepted_by_user_id: 'other' }), 'INVITATION_ACCEPTED'],
  ])('refuses an invitation that is %s (409)', async (_n, inv, code) => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(inv);
    const e: any = await service.acceptInvitation(EMP, TOKEN).catch((x) => x);
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toMatchObject({ code });
  });

  it('accepts case-insensitively: joins as an employee with consent recorded and seats synced', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    const out = await service.acceptInvitation(EMP, TOKEN);
    expect(out).toMatchObject({ already_accepted: false, organization: { id: ORG }, next: { href: '/assessments/full' } });
    const up = prisma.organizationMember.upsert.mock.calls[0][0];
    expect(up.create).toMatchObject({ user_id: EMP.id, role_id: 'role-employee', department: 'Sales' });
    expect(up.create.consented_at).toBeInstanceOf(Date);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({ where: { organization_id: ORG }, data: { seats_used: 1 } });
  });

  it('is idempotent for the person who already accepted', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite({ status: 'accepted', accepted_by_user_id: EMP.id }));
    expect(await service.acceptInvitation(EMP, TOKEN)).toMatchObject({ already_accepted: true });
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
  });

  it('rolls back when the company is out of seats', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    prisma.organizationMember.count.mockResolvedValue(4); // limit is 3
    const e: any = await service.acceptInvitation(EMP, TOKEN).catch((x) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getResponse()).toMatchObject({ code: 'SEATS_FULL' });
  });

  it('refuses when the company plan has lapsed', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.subscription.findUnique.mockResolvedValue({ status: 'expired', end_date: past(), seats_limit: 3 });
    const e: any = await service.acceptInvitation(EMP, TOKEN).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'ORGANIZATION_INACTIVE' });
  });
});

describe('invitationInfo (public)', () => {
  it('gives the sign-up and sign-in forms the address and role to fix in place, plus a masked hint', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue({ ...pendingInvite(), organization: { name: 'Acme Co' }, sender: { first_name: 'Ada', last_name: 'Boss' } });
    prisma.role.findFirst.mockResolvedValue({ key: 'employee', name: 'Employee' });
    const info = await service.invitationInfo(TOKEN);
    expect(info).toMatchObject({ status: 'pending', organization_name: 'Acme Co', inviter_name: 'Ada Boss' });
    expect(info.email).toBe('eve@acme.test');
    expect(info.email_hint).toMatch(/^e\*+@acme\.test$/);
    expect(info.role).toEqual({ key: 'employee', name: 'Employee' });
    // nothing about the account behind it
    expect(Object.keys(info).sort()).toEqual(['department', 'email', 'email_hint', 'expires_at', 'inviter_name', 'job_title', 'organization_name', 'organization_type', 'role', 'status']);
  });
});

describe('removing and leaving', () => {
  it('refuses to remove an administrator or yourself', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1', status: 'active', deleted_at: null, role: { key: 'admin' } });
    const e: any = await service.removeMember(ADMIN, ORG, 'u-other-admin').catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'CANNOT_REMOVE_ADMIN' });
    const self: any = await service.removeMember(ADMIN, ORG, ADMIN.id).catch((x) => x);
    expect(self.getResponse()).toMatchObject({ code: 'USE_LEAVE' });
  });

  it('removing a member detaches their results and submissions so the company stops seeing them', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm2', status: 'active', deleted_at: null, role: { key: 'employee' } });
    await service.removeMember(ADMIN, ORG, EMP.id);
    expect(prisma.organizationMember.update.mock.calls[0][0].data).toMatchObject({ status: 'inactive', consented_at: null });
    expect(prisma.assessmentResult.updateMany).toHaveBeenCalledWith({ where: { organization_id: ORG, user_id: EMP.id }, data: { organization_id: null } });
    expect(prisma.assessmentSubmission.updateMany).toHaveBeenCalledWith({ where: { organization_id: ORG, user_id: EMP.id }, data: { organization_id: null } });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'member.removed', actor_id: ADMIN.id, user_id: EMP.id });
  });

  it('an account created from this company’s invitation cannot leave it, but one that joined with an existing account can', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm2', status: 'active', deleted_at: null, role: { key: 'employee' } });
    prisma.user.findUnique.mockResolvedValue({ joined_via_organization_id: ORG });
    const e: any = await service.leave(EMP, ORG).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'CANNOT_LEAVE' });
    expect(prisma.assessmentResult.updateMany).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValue({ joined_via_organization_id: 'some-other-company' });
    await expect(service.leave(EMP, ORG)).resolves.toEqual({ left: true });
  });

  it('the only administrator cannot leave; an employee can, with the same detaching', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1', status: 'active', deleted_at: null, role: { key: 'admin' } });
    prisma.organizationMember.count.mockResolvedValue(0); // nobody else is an administrator
    const e: any = await service.leave(ADMIN, ORG).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'ADMIN_CANNOT_LEAVE' });
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm2', status: 'active', deleted_at: null, role: { key: 'employee' } });
    await service.leave(EMP, ORG);
    expect(prisma.assessmentResult.updateMany).toHaveBeenCalled();
  });
});

describe('team data', () => {
  const memberRow = (id: string, over: object = {}) => ({ user_id: id, department: 'Sales', job_title: null, joined_at: new Date(), consented_at: new Date(), user: { id, first_name: id, last_name: 'X', email: `${id}@acme.test` }, role: { key: 'employee' }, ...over });
  const resultRow = (id: string, user_id: string, o: number) => ({ id, user_id, calculated_at: new Date(), overall_score: o, openness_score: o, conscientiousness_score: 50, extraversion_score: 50, agreeableness_score: 50, neuroticism_score: 50 });

  it('uses each person’s latest company result and reports completion honestly', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a'), memberRow('b'), memberRow('c')]);
    prisma.assessmentResult.findMany.mockResolvedValue([resultRow('r2', 'a', 80), resultRow('r1', 'a', 20)]); // newest first
    prisma.assessmentSubmission.findMany.mockResolvedValue([{ user_id: 'b', progress_percent: 40 }]);
    const { data } = await service.members('u', ORG);
    expect(data.map((m) => m.status)).toEqual(['completed', 'in_progress', 'not_started']);
    expect(data[0].result!.scores.openness).toBe(80);
    expect(data[1].progress_percent).toBe(40);
  });

  it('only ever queries consenting, active, undeleted members and company-taken results', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a')]);
    await service.members('u', ORG);
    expect(prisma.organizationMember.findMany.mock.calls[0][0].where).toMatchObject({ organization_id: ORG, status: 'active', deleted_at: null, consented_at: { not: null } });
    expect(prisma.assessmentResult.findMany.mock.calls[0][0].where).toMatchObject({ organization_id: ORG, deleted_at: null });
  });

  it('exports a CSV with formulas neutralised and records the export', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a', { department: '=cmd()' })]);
    prisma.assessmentResult.findMany.mockResolvedValue([resultRow('r1', 'a', 90)]);
    const { csv, filename } = await service.exportCsv(ADMIN, ORG);
    expect(csv.startsWith('﻿Name,Email')).toBe(true);
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain('a X,a@acme.test');
    expect(filename).toMatch(/^team-results-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'results.exported', actor_id: ADMIN.id });
  });

  it('groups the team by personality class, lists people who have not finished, and names the classes nobody has', async () => {
    const { service, prisma } = setup(['read:team_results']);
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a'), memberRow('b'), memberRow('c')]);
    // 'a' and 'b' score alike (same class); 'c' has not finished
    prisma.assessmentResult.findMany.mockResolvedValue([resultRow('r1', 'a', 85), resultRow('r2', 'b', 85)]);
    const out = await service.classes('u', ORG);

    expect(out.classes).toHaveLength(8);
    expect(out.classified).toBe(2);
    const group = out.classes.find((c) => c.count === 2)!;
    expect(group.members.map((m) => m.name).sort()).toEqual(['a X', 'b X']);
    expect(group.pairs_with).toHaveLength(3);
    expect(out.not_classified.map((m) => m.name)).toEqual(['c X']);
    expect(out.balance.most_common).toMatchObject({ key: group.key, count: 2 });
    expect(out.balance.missing).toHaveLength(7);
    // nothing but people and class names: no scores or emails leave this call
    expect(JSON.stringify(out)).not.toMatch(/score|@acme/i);
  });

  it('puts each person’s class on the team list, and needs the same permission as the team results', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a'), memberRow('b')]);
    prisma.assessmentResult.findMany.mockResolvedValue([resultRow('r1', 'a', 85)]);
    const { data } = await service.members('u', ORG);
    expect(data[0].profile_class).toMatchObject({ name: expect.stringMatching(/^CL-0[1-8]$/) });
    expect(data[1].profile_class).toBeNull();

    const { service: denied } = setup([]);
    await expect(denied.classes('u', ORG)).rejects.toThrow();
  });

  it('looking at one person’s scores is audited; someone without a company result is a 404', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([memberRow('a'), memberRow('b')]);
    prisma.assessmentResult.findMany.mockResolvedValue([resultRow('r1', 'a', 90)]);
    prisma.assessmentResult.findUnique = jest.fn().mockResolvedValue({ assessment: { name: 'Full personality assessment' } });
    const out = await service.memberResult(ADMIN, ORG, 'a');
    expect(out.result.traits).toHaveLength(5);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'member.result_viewed', user_id: 'a' });
    await expect(service.memberResult(ADMIN, ORG, 'b')).rejects.toThrow(NotFoundException);
    await expect(service.memberResult(ADMIN, ORG, 'not-in-team')).rejects.toThrow(NotFoundException);
  });
});

describe('remind', () => {
  const row = (id: string) => ({ user_id: id, department: null, job_title: null, joined_at: new Date(), consented_at: new Date(), user: { id, first_name: id, last_name: 'X', email: `${id}@acme.test` }, role: { key: 'employee' } });

  function team(prisma: any) {
    prisma.organizationMember.findMany.mockResolvedValue([row('done'), row('idle'), row('busy'), row('recent')]);
    prisma.assessmentResult.findMany.mockResolvedValue([{ id: 'r', user_id: 'done', calculated_at: new Date(), overall_score: 50, openness_score: 50, conscientiousness_score: 50, extraversion_score: 50, agreeableness_score: 50, neuroticism_score: 50 }]);
    prisma.assessmentSubmission.findMany.mockResolvedValue([{ user_id: 'busy', progress_percent: 30 }]);
  }

  it('emails only people who have not finished, and records each reminder', async () => {
    const { service, prisma, mail } = setup();
    team(prisma);
    const out = await service.remind(ADMIN, ORG);
    expect(mail.sendReminder.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['busy@acme.test', 'idle@acme.test', 'recent@acme.test']);
    expect(out).toMatchObject({ sent: 3, skipped_recent: 0, waiting: 3 });
    expect(prisma.auditLog.create.mock.calls.map((c: any[]) => c[0].data.action)).toEqual(['member.reminded', 'member.reminded', 'member.reminded']);
    expect(mail.sendReminder.mock.calls[0][1]).toMatchObject({ organization: 'Acme Co', sender: 'Ada Boss', link: 'https://app.test/assessments/full' });
  });

  it('does not remind anyone reminded in the last few days', async () => {
    const { service, prisma, mail } = setup();
    team(prisma);
    prisma.auditLog.findMany.mockResolvedValue([{ user_id: 'recent' }]);
    const out = await service.remind(ADMIN, ORG);
    expect(mail.sendReminder.mock.calls.map((c: any[]) => c[0])).not.toContain('recent@acme.test');
    expect(out).toMatchObject({ sent: 2, skipped_recent: 1, waiting: 3 });
    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ action: 'member.reminded', organization_id: ORG });
    expect(Date.now() - where.created_at.gt.getTime()).toBeGreaterThan(2.9 * 86400000);
  });

  it('does not record a reminder that could not be emailed, and says so', async () => {
    const { service, prisma, mail } = setup();
    team(prisma);
    mail.sendReminder.mockResolvedValue('not_configured');
    const out = await service.remind(ADMIN, ORG);
    expect(out).toMatchObject({ sent: 0, not_emailed: 3 });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('needs an active plan, and does nothing when everyone has finished', async () => {
    const { service, prisma, mail } = setup();
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: past(), seats_limit: 3 });
    const e: any = await service.remind(ADMIN, ORG).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: future(), seats_limit: 3 });
    prisma.organizationMember.findMany.mockResolvedValue([]);
    expect(await service.remind(ADMIN, ORG)).toMatchObject({ sent: 0, waiting: 0 });
    expect(mail.sendReminder).not.toHaveBeenCalled();
  });
});

describe('with payments switched off', () => {
  const free = (permissions?: string[]) => {
    const t = setup(permissions, false);
    // No subscription row at all: a company that never bought a plan.
    t.prisma.subscription.findUnique.mockResolvedValue(null);
    return t;
  };

  it('lets a company with no plan invite people, and never asks the subscription table', async () => {
    const { service, prisma, mail } = free();
    const out = await service.createInvitations(ADMIN, ORG, { emails: ['new@acme.test'] });
    expect(out.invitations[0].status).toBe('invited');
    expect(mail.sendInvitation).toHaveBeenCalled();
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('caps a free company at the free seat limit (members and waiting invitations count)', async () => {
    const { service, prisma } = free();
    prisma.organizationMember.findMany.mockResolvedValue([{ user: { email: 'a@acme.test' } }, { user: { email: 'b@acme.test' } }]);
    prisma.employeeInvitation.findMany.mockResolvedValue([{ recipient_email: 'c@acme.test' }]);
    const e: any = await service.createInvitations(ADMIN, ORG, { emails: ['x@acme.test', 'y@acme.test'] }).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'SEATS_FULL', remaining: 1 });
  });

  it('ignores a lapsed old plan: the company is still free to invite', async () => {
    const { service, prisma } = free();
    prisma.subscription.findUnique.mockResolvedValue({ status: 'expired', end_date: past(), seats_limit: 1 });
    await expect(service.createInvitations(ADMIN, ORG, { emails: ['a@b.co', 'c@d.co'] })).resolves.toBeDefined();
  });

  it('lets a person accept an invitation to a company with no plan', async () => {
    const { service, prisma } = free();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    prisma.organizationMember.count.mockResolvedValue(2);
    expect(await service.acceptInvitation(EMP, TOKEN)).toMatchObject({ already_accepted: false });
  });

  it('still rolls back an acceptance past the free seat limit', async () => {
    const { service, prisma } = free();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    prisma.organizationMember.count.mockResolvedValue(5);
    const e: any = await service.acceptInvitation(EMP, TOKEN).catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'SEATS_FULL' });
  });

  it('reports a free plan on the dashboard, with no end date', async () => {
    const { service } = free();
    const d = await service.dashboard('u', ORG);
    expect(d.plan).toEqual({ name: 'Free', active: true, end_date: null, seats_limit: 4, seats_used: 0 });
  });

  it('sends reminders without any plan', async () => {
    const { service, prisma, mail } = free();
    prisma.organizationMember.findMany.mockResolvedValue([{ user_id: 'idle', department: null, job_title: null, joined_at: new Date(), consented_at: new Date(), user: { id: 'idle', first_name: 'Ife', last_name: 'X', email: 'idle@acme.test' }, role: { key: 'employee' } }]);
    expect(await service.remind(ADMIN, ORG)).toMatchObject({ sent: 1 });
    expect(mail.sendReminder).toHaveBeenCalled();
  });
});

describe('departments (the list lives in the website; the server only stores the value)', () => {
  it('stores what an invitation says, with spaces tidied, and no lookup of any list', async () => {
    const { service, prisma } = setup();
    await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'], department: '  Customer   Care ' });
    expect(prisma.employeeInvitation.create.mock.calls[0][0].data.department).toBe('Customer Care');
  });

  it('treats a blank or missing department as none', async () => {
    const { service, prisma } = setup();
    await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co', 'c@d.co'], department: '   ' });
    await service.createInvitations(ADMIN, ORG, { emails: ['e@f.co'] });
    expect(prisma.employeeInvitation.create.mock.calls.map((c: any[]) => c[0].data.department)).toEqual([null, null, null]);
  });

  describe('changing a person’s department', () => {
    const member = { id: 'm1', status: 'active', deleted_at: null, department: 'Sales', role: { key: 'employee' } };

    it('needs permission to manage the team', async () => {
      const { service, prisma } = setup(['read:team_results']);
      await expect(service.setMemberDepartment(ADMIN, ORG, 'u1', 'Ops')).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationMember.update).not.toHaveBeenCalled();
    });

    it('sets it (tidied) and records the change', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(member);
      expect(await service.setMemberDepartment(ADMIN, ORG, 'u1', ' Human   Resources ')).toEqual({ department: 'Human Resources' });
      expect(prisma.organizationMember.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { department: 'Human Resources' } });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'member.department_changed', user_id: 'u1', changes: { from: 'Sales', to: 'Human Resources' } });
    });

    it('clears it with null or blank', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(member);
      expect(await service.setMemberDepartment(ADMIN, ORG, 'u1', null)).toEqual({ department: null });
      expect(await service.setMemberDepartment(ADMIN, ORG, 'u1', '   ')).toEqual({ department: null });
    });

    it('is a 404 for someone who is not in the company', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(service.setMemberDepartment(ADMIN, ORG, 'stranger', 'Ops')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('team report html', () => {
  it('escapes the company and department names and carries no individual names', () => {
    const html = renderTeamReportHtml({
      organization: '<img src=x onerror=alert(1)> Co', generatedAt: new Date('2026-10-01T00:00:00Z'), members: 2, completed: 1, inProgress: 1, notStarted: 0,
      distribution: [], departments: [{ department: '<script>x</script>', members: 2, completed: 1, averages: { openness: 70 } }],
    });
    expect(html).not.toMatch(/<img|<script>x/);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('roles', () => {
  const asAdmin = () => setup(['manage:organization', 'manage:team', 'invite:members', 'read:team_results']);

  it('only an administrator can change roles', async () => {
    const { service } = setup(['manage:team', 'invite:members']);
    await expect(service.setMemberRole(ADMIN, ORG, EMP.id, 'hr')).rejects.toThrow(ForbiddenException);
  });

  it('promotes someone to HR and records it', async () => {
    const { service, prisma } = asAdmin();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm2', status: 'active', deleted_at: null, role: { key: 'employee' } });
    prisma.role.findFirst.mockResolvedValue({ id: 'role-hr' });
    prisma.organizationMember.update.mockResolvedValue({});
    await expect(service.setMemberRole(ADMIN, ORG, EMP.id, 'hr')).resolves.toEqual({ role: 'hr' });
    expect(prisma.organizationMember.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { role_id: 'role-hr' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'member.role_changed', changes: { from: 'employee', to: 'hr' } });
  });

  it('never leaves the company without an administrator', async () => {
    const { service, prisma } = asAdmin();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1', status: 'active', deleted_at: null, role: { key: 'admin' } });
    prisma.organizationMember.count.mockResolvedValue(0);
    const e: any = await service.setMemberRole(ADMIN, ORG, ADMIN.id, 'employee').catch((x) => x);
    expect(e.getResponse()).toMatchObject({ code: 'LAST_ADMIN' });
    expect(prisma.organizationMember.update).not.toHaveBeenCalled();
  });

  it('lets an administrator step down once another remains', async () => {
    const { service, prisma } = asAdmin();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1', status: 'active', deleted_at: null, role: { key: 'admin' } });
    prisma.organizationMember.count.mockResolvedValue(1);
    prisma.role.findFirst.mockResolvedValue({ id: 'role-employee' });
    await expect(service.setMemberRole(ADMIN, ORG, ADMIN.id, 'employee')).resolves.toEqual({ role: 'employee' });
  });

  it('an administrator may leave when another administrator remains', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1', status: 'active', deleted_at: null, role: { key: 'admin' } });
    prisma.organizationMember.count.mockResolvedValue(1);
    await expect(service.leave(ADMIN, ORG)).resolves.toEqual({ left: true });
  });

  it('inviting HR or administrators needs an administrator; employees do not', async () => {
    const { service, prisma } = setup(['invite:members']);
    await expect(service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'], role: 'hr' })).rejects.toThrow(ForbiddenException);
    await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'] });
    expect(prisma.employeeInvitation.create.mock.calls[0][0].data).toMatchObject({ role_key: 'employee' });
  });

  it('stores the invited role and gives it to the person who accepts', async () => {
    const { service, prisma } = asAdmin();
    await service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'], role: 'hr' });
    expect(prisma.employeeInvitation.create.mock.calls[0][0].data).toMatchObject({ role_key: 'hr' });

    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite({ role_key: 'hr' }));
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    prisma.role.findFirst.mockResolvedValue({ id: 'role-hr' });
    await service.acceptInvitation({ id: 'u9', email: 'eve@acme.test', first_name: 'Eve', last_name: 'E', email_verified: true }, 'x'.repeat(30));
    expect(prisma.role.findFirst).toHaveBeenCalledWith({ where: { scope: 'organization', key: 'hr' }, select: { id: true } });
    expect(prisma.organizationMember.upsert.mock.calls[0][0].create).toMatchObject({ role_id: 'role-hr' });
  });

  it('refuses to invite or accept with an unconfirmed email address', async () => {
    const { service, prisma } = asAdmin();
    prisma.employeeInvitation.findUnique.mockResolvedValue(pendingInvite());
    await expect(service.createInvitations({ ...ADMIN, email_verified: false }, ORG, { emails: ['a@b.co'] })).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    await expect(service.acceptInvitation({ id: 'u9', email: 'eve@acme.test', first_name: 'E', last_name: 'E', email_verified: false }, 'x'.repeat(30))).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
  });
});
