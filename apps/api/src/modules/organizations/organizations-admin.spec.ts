import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

const ORG = 'org-1';
const ADMIN = { id: 'admin-1', email: 'a@x.test', first_name: 'Ada', last_name: 'Admin', email_verified: true };
const HR = { id: 'hr-1', email: 'h@x.test', first_name: 'Hana', last_name: 'HR', email_verified: true };
const future = () => new Date(Date.now() + 86400000);
const ALL = ['read:team_results', 'manage:team', 'manage:organization', 'invite:members', 'approve:retakes'];
const HR_PERMS = ['read:team_results', 'manage:team', 'invite:members', 'approve:retakes'];

function setup(permissions: string[] = ALL, orgOver: object = {}) {
  const prisma: any = {
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme', type: 'corporate', status: 'active', suspended_reason: null, slug: 'acme', admin_name: 'Ada', admin_email: 'a@x.test', admin_phone: null, created_at: new Date(), ...orgOver }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Acme', admin_name: 'Ada', admin_phone: null }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ name: 'Acme', admin_name: 'Ada', admin_phone: null, ...data })),
    },
    organizationMember: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(2) },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    retakeRequest: { findMany: jest.fn().mockResolvedValue([]) },
    employeeInvitation: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'active', end_date: future(), seats_limit: 5, plan_name: 'Team' }), updateMany: jest.fn() },
    assessment: { findFirst: jest.fn().mockResolvedValue({ id: 'a-full' }) },
    role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-employee' }) },
    auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const rbac: any = { permissionsInOrganization: jest.fn().mockResolvedValue(permissions) };
  const mail: any = { sendInvitation: jest.fn().mockResolvedValue('sent'), sendReminder: jest.fn().mockResolvedValue('sent') };
  const billing: any = { frontendUrl: 'https://app.test', paymentsEnabled: () => true, freeOrganizationSeats: () => 9 };
  return { prisma, rbac, service: new OrganizationsService(prisma, rbac, mail, billing, { render: jest.fn() } as any) };
}

const member = (over: object = {}) => ({
  id: 'm2', user_id: 'emp-1', status: 'active', deleted_at: null, department: 'Sales', job_title: 'AE', joined_at: new Date(), consented_at: new Date(), suspended_reason: null,
  role: { key: 'employee', name: 'Employee' }, user: { first_name: 'Eli', last_name: 'M', email: 'e@x.test' }, ...over,
});
const audited = (prisma: any) => prisma.auditLog.create.mock.calls.map((c: any) => c[0].data);

describe('memberDetail', () => {
  it('is for people who can see the team only', async () => {
    const { service } = setup([]);
    await expect(service.memberDetail(ADMIN, ORG, 'emp-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('describes the person, their invitation, assessments and retakes, and what the viewer may do', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findFirst.mockResolvedValue(member());
    prisma.employeeInvitation.findFirst.mockResolvedValue({ created_at: new Date(), accepted_at: new Date(), role_key: 'employee', sender: { first_name: 'Hana', last_name: 'HR' } });
    prisma.assessmentSubmission.findMany.mockResolvedValue([{ id: 's1', status: 'completed', started_at: new Date(), completed_at: new Date(), progress_percent: 100, submission_number: 1, assessment: { name: 'Full', type: 'full_assessment' }, result: { id: 'r1' } }]);
    prisma.retakeRequest.findMany.mockResolvedValue([{ id: 'q1', status: 'approved', requested_by: 'member', created_at: new Date(), decided_at: new Date(), expires_at: future(), assessment: { name: 'Full' } }]);
    const out: any = await service.memberDetail(ADMIN, ORG, 'emp-1');
    expect(out.person).toMatchObject({ name: 'Eli M', role: 'employee', department: 'Sales', status: 'active', shares_results: true });
    expect(out.invitation).toMatchObject({ invited_by: 'Hana HR', role: 'employee' });
    expect(out.assessments[0]).toMatchObject({ name: 'Full', status: 'completed', result_id: 'r1' });
    expect(out.retakes[0]).toMatchObject({ status: 'approved', assessment: 'Full' });
    expect(out.can).toEqual({ suspend: true, reactivate: false, remove: true, view_result: true });
  });

  it('never selects anyone’s scores', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findFirst.mockResolvedValue(member());
    await service.memberDetail(ADMIN, ORG, 'emp-1');
    expect(JSON.stringify(prisma.assessmentSubmission.findMany.mock.calls[0][0].select)).not.toMatch(/score|answers|ai_/);
  });

  it('hides the result link while the person is paused, and offers to restore instead', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findFirst.mockResolvedValue(member({ status: 'suspended', suspended_reason: 'On leave' }));
    prisma.assessmentSubmission.findMany.mockResolvedValue([{ id: 's1', status: 'completed', started_at: new Date(), completed_at: new Date(), progress_percent: 100, submission_number: 1, assessment: { name: 'Full', type: 'full_assessment' }, result: { id: 'r1' } }]);
    const out: any = await service.memberDetail(ADMIN, ORG, 'emp-1');
    expect(out.person).toMatchObject({ status: 'suspended', suspended_reason: 'On leave' });
    expect(out.assessments[0].result_id).toBeNull();
    expect(out.can).toMatchObject({ suspend: false, reactivate: true, view_result: false });
  });

  it('does not offer to pause an administrator, yourself, or (for HR) another HR', async () => {
    const a = setup();
    a.prisma.organizationMember.findFirst.mockResolvedValue(member({ user_id: 'admin-2', role: { key: 'admin', name: 'Admin' } }));
    expect(((await a.service.memberDetail(ADMIN, ORG, 'admin-2')) as any).can).toMatchObject({ suspend: false, remove: false });
    const b = setup();
    b.prisma.organizationMember.findFirst.mockResolvedValue(member({ user_id: ADMIN.id }));
    expect(((await b.service.memberDetail(ADMIN, ORG, ADMIN.id)) as any).can.suspend).toBe(false);
    const c = setup(HR_PERMS);
    c.prisma.organizationMember.findFirst.mockResolvedValue(member({ role: { key: 'hr', name: 'HR' } }));
    expect(((await c.service.memberDetail(HR, ORG, 'emp-1')) as any).can.suspend).toBe(false);
  });

  it('404s for someone who is not in the company', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    await expect(service.memberDetail(ADMIN, ORG, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('company profile', () => {
  it('shows details to anyone who sees the team, and says whether they may edit', async () => {
    const admin = setup();
    const out: any = await admin.service.profile(ADMIN.id, ORG);
    expect(out).toMatchObject({ name: 'Acme', can_edit: true, plan: { name: 'Team', active: true } });
    expect(((await setup(HR_PERMS).service.profile(HR.id, ORG)) as any).can_edit).toBe(false);
    await expect(setup([]).service.profile('x', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only an administrator edits it, trims what it stores, and records what changed', async () => {
    await expect(setup(HR_PERMS).service.updateProfile(HR, ORG, { name: 'New' })).rejects.toBeInstanceOf(ForbiddenException);
    const { service, prisma } = setup();
    await expect(service.updateProfile(ADMIN, ORG, { name: '  Acme Group  ', admin_phone: '' })).resolves.toMatchObject({ changed: true, name: 'Acme Group' });
    expect(prisma.organization.update.mock.calls[0][0].data).toEqual({ name: 'Acme Group' });
    expect(audited(prisma)[0]).toMatchObject({ action: 'organization.updated', changes: { name: { from: 'Acme', to: 'Acme Group' } } });
  });

  it('refuses an empty name and does nothing when nothing changed', async () => {
    const { service, prisma } = setup();
    await expect(service.updateProfile(ADMIN, ORG, { name: '   ' })).rejects.toMatchObject({ response: { code: 'REQUIRED' } });
    await expect(service.updateProfile(ADMIN, ORG, { name: 'Acme' })).resolves.toMatchObject({ changed: false });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});

describe('pausing and restoring people', () => {
  const target = (role = 'employee', status = 'active') => ({ id: 'm2', status, deleted_at: null, role: { key: role } });

  it('pauses an employee: they leave the team, a seat frees up, and it is recorded', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue(target());
    await expect(service.suspendMember(ADMIN, ORG, 'emp-1', '  On leave  ')).resolves.toEqual({ status: 'suspended' });
    expect(prisma.organizationMember.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { status: 'suspended', suspended_reason: 'On leave' } });
    expect(prisma.subscription.updateMany).toHaveBeenCalled(); // seats recounted
    expect(audited(prisma)[0]).toMatchObject({ action: 'member.suspended', user_id: 'emp-1', changes: { reason: 'On leave' } });
  });

  it('will not pause yourself or an administrator; only an administrator pauses HR; employees have no say', async () => {
    const a = setup();
    await expect(a.service.suspendMember(ADMIN, ORG, ADMIN.id)).rejects.toMatchObject({ response: { code: 'CANNOT_PAUSE_SELF' } });
    a.prisma.organizationMember.findUnique.mockResolvedValue(target('admin'));
    await expect(a.service.suspendMember(ADMIN, ORG, 'admin-2')).rejects.toMatchObject({ response: { code: 'CANNOT_PAUSE_ADMIN' } });
    const hr = setup(HR_PERMS);
    hr.rbac.permissionsInOrganization.mockImplementation(async () => HR_PERMS);
    hr.prisma.organizationMember.findUnique.mockResolvedValue(target('hr'));
    await expect(hr.service.suspendMember(HR, ORG, 'hr-2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup([]).service.suspendMember(ADMIN, ORG, 'emp-1')).rejects.toBeInstanceOf(ForbiddenException);
    const gone = setup();
    gone.prisma.organizationMember.findUnique.mockResolvedValue(null);
    await expect(gone.service.suspendMember(ADMIN, ORG, 'emp-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores a paused person when there is a seat', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findUnique.mockResolvedValue(target('employee', 'suspended'));
    prisma.organizationMember.count.mockResolvedValue(2); // 2 of 5
    await expect(service.reactivateMember(ADMIN, ORG, 'emp-1')).resolves.toEqual({ status: 'active' });
    expect(prisma.organizationMember.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { status: 'active', suspended_reason: null } });
    expect(audited(prisma)[0].action).toBe('member.reactivated');
  });

  it('refuses to restore when the plan is full or ended, or nobody is paused', async () => {
    const full = setup();
    full.prisma.organizationMember.findUnique.mockResolvedValue(target('employee', 'suspended'));
    full.prisma.organizationMember.count.mockResolvedValue(5);
    await expect(full.service.reactivateMember(ADMIN, ORG, 'emp-1')).rejects.toMatchObject({ response: { code: 'SEATS_FULL' } });
    const ended = setup();
    ended.prisma.organizationMember.findUnique.mockResolvedValue(target('employee', 'suspended'));
    ended.prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: new Date(Date.now() - 1000), seats_limit: 5 });
    await expect(ended.service.reactivateMember(ADMIN, ORG, 'emp-1')).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_REQUIRED' } });
    const active = setup();
    active.prisma.organizationMember.findUnique.mockResolvedValue(target('employee', 'active'));
    await expect(active.service.reactivateMember(ADMIN, ORG, 'emp-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists paused people next to the team', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany
      .mockResolvedValueOnce([]) // the team
      .mockResolvedValueOnce([{ user_id: 'emp-1', department: 'Sales', suspended_reason: 'On leave', updated_at: new Date(), role: { key: 'employee' }, user: { first_name: 'Eli', last_name: 'M', email: 'e@x.test' } }]);
    const out: any = await service.members(ADMIN.id, ORG);
    expect(out.suspended).toEqual([expect.objectContaining({ user_id: 'emp-1', name: 'Eli M', reason: 'On leave' })]);
  });
});

describe('a suspended company', () => {
  it('cannot invite, resend or remind, and says why; the dashboard still says so', async () => {
    const { service } = setup(ALL, { status: 'suspended', suspended_reason: 'Unpaid invoice' });
    for (const run of [() => service.createInvitations(ADMIN, ORG, { emails: ['a@b.co'] }), () => service.resendInvitation(ADMIN, ORG, 'i1'), () => service.remind(ADMIN, ORG)]) {
      await expect(run()).rejects.toMatchObject({ response: { code: 'ORGANIZATION_SUSPENDED', message: expect.stringContaining('Unpaid invoice') } });
    }
  });

  it('a paused person cannot get back in by accepting a new invitation', async () => {
    const { service, prisma } = setup();
    prisma.employeeInvitation.findUnique.mockResolvedValue({ id: 'inv', organization_id: ORG, recipient_email: 'e@x.test', status: 'pending', expires_at: future(), accepted_by_user_id: null, role_key: 'employee', organization: { id: ORG, name: 'Acme', status: 'active', deleted_at: null } });
    prisma.employeeInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm2', status: 'suspended', deleted_at: null });
    await expect(service.acceptInvitation({ id: 'emp-1', email: 'e@x.test', first_name: 'Eli', last_name: 'M', email_verified: true }, 'x'.repeat(30))).rejects.toMatchObject({ response: { code: 'MEMBER_SUSPENDED' } });
  });
});
