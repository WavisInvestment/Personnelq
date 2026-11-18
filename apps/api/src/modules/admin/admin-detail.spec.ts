import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const now = new Date('2026-10-20T10:00:00Z');

function setup() {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    session: { count: jest.fn().mockResolvedValue(2), findFirst: jest.fn().mockResolvedValue({ created_at: now }) },
    organization: { findFirst: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]) },
    employeeInvitation: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    assessment: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    retakeRequest: { groupBy: jest.fn().mockResolvedValue([]) },
    auditLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    assessmentSubmission: { groupBy: jest.fn().mockResolvedValue([]) },
    staffAction: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new AdminService(prisma) };
}

const person = (over: object = {}) => ({
  id: 'u1', email: 'ada@x.test', first_name: 'Ada', last_name: 'O', email_verified: true, email_verified_at: now, failed_login_attempts: 0, locked_until: null, created_at: now, deleted_at: null,
  platform_role: null, account_role: { key: 'individual', name: 'Individual' },
  organization_members: [{ status: 'active', department: 'Finance', job_title: null, joined_at: now, consented_at: now, role: { key: 'employee', name: 'Employee' }, organization: { id: 'o1', name: 'Acme', type: 'corporate' } }],
  submissions: [{ id: 's1', status: 'completed', started_at: now, completed_at: now, progress_percent: 100, submission_number: 1, assessment: { name: 'Full', type: 'full_assessment', version: '1.0.0' }, organization: { id: 'o1', name: 'Acme' } }],
  shareable_badges: [{ is_public: true, published_at: now, expires_at: null, view_count: 3, last_viewed_at: now }],
  payments: [],
  ...over,
});

describe('AdminService.userDetail', () => {
  it('describes the person, their companies, assessments and sign-in, and says whether results are shared', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(person());
    const out: any = await service.userDetail('u1', 'staff1');
    expect(out).toMatchObject({ id: 'u1', deleted: false, account_role: 'individual', platform_role: null, sign_in: { active_sessions: 2, last_signed_in: now } });
    expect(out.companies[0]).toMatchObject({ id: 'o1', name: 'Acme', role: 'employee', shares_results: true, department: 'Finance' });
    expect(out.assessments[0]).toMatchObject({ name: 'Full', status: 'completed', attempt: 1, company: { id: 'o1', name: 'Acme' } });
  });

  it('never asks for what the person keeps private: scores, answers, insights, or the badge link', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(person());
    await service.userDetail('u1', 'staff1');
    const text = JSON.stringify(prisma.user.findUnique.mock.calls[0][0].select);
    for (const secret of ['score', 'answers', 'ai_interpretation', 'share_token', 'share_url', 'password', 'refresh_token', 'custom_scores']) expect(text).not.toContain(secret);
  });

  it('flags a deleted account, and 404s for an unknown person', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(person({ deleted_at: now }));
    await expect(service.userDetail('u1', 's')).resolves.toMatchObject({ deleted: true });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.userDetail('nope', 's')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.organizationDetail', () => {
  const org = { id: 'o1', name: 'Acme', slug: 'acme', type: 'corporate', status: 'active', admin_name: 'Ngozi', admin_email: 'n@x.test', admin_phone: null, created_at: now, updated_at: now };

  it('404s for an unknown or deleted company, and records nothing', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(null);
    await expect(service.organizationDetail('nope', 'staff1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('shows people with whether they finished, never with scores', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(org);
    prisma.organizationMember.findMany.mockResolvedValue([
      { user_id: 'a', status: 'active', department: 'Sales', job_title: null, joined_at: now, consented_at: now, role: { key: 'employee', name: 'Employee' }, user: { first_name: 'A', last_name: 'One', email: 'a@x.test' } },
      { user_id: 'b', status: 'active', department: null, job_title: null, joined_at: now, consented_at: null, role: { key: 'admin', name: 'Admin' }, user: { first_name: 'B', last_name: 'Two', email: 'b@x.test' } },
      { user_id: 'c', status: 'inactive', department: null, job_title: null, joined_at: now, consented_at: now, role: { key: 'employee', name: 'Employee' }, user: { first_name: 'C', last_name: 'Three', email: 'c@x.test' } },
    ]);
    prisma.assessmentSubmission.groupBy.mockResolvedValueOnce([{ user_id: 'a', _count: { _all: 1 } }]).mockResolvedValueOnce([{ user_id: 'b', _count: { _all: 1 } }]);
    const out: any = await service.organizationDetail('o1', 'staff1');
    expect(out.members.map((m: any) => [m.name, m.progress, m.shares_results])).toEqual([['A One', 'completed', true], ['B Two', 'in_progress', false], ['C Three', 'not_started', true]]);
    expect(out.counts).toMatchObject({ active_members: 2, inactive_members: 1 });
    expect(JSON.stringify(out)).not.toMatch(/openness|neuroticism|_score/);
  });

  it('summarises invitations, retakes, company assessments and payments', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(org);
    prisma.employeeInvitation.groupBy.mockResolvedValue([{ status: 'pending', _count: { _all: 2 } }, { status: 'expired', _count: { _all: 1 } }]);
    prisma.retakeRequest.groupBy.mockResolvedValue([{ status: 'requested', _count: { _all: 3 } }]);
    prisma.assessment.findMany.mockResolvedValue([{ id: 'x', name: 'Fit', version: '1.0.0', published_at: now, created_at: now, _count: { submissions: 7 } }, { id: 'y', name: 'Draft', version: '1.0.0', published_at: null, created_at: now, _count: { submissions: 0 } }]);
    prisma.payment.findMany.mockResolvedValue([{ id: 'p', amount: 50000, currency: 'NGN', status: 'success', payment_type: 'subscription', description: 'Plan', provider_reference: 'r', created_at: now, user: { first_name: 'N', last_name: 'E' } }]);
    const out: any = await service.organizationDetail('o1', 'staff1');
    expect(out.invitations).toMatchObject({ pending: 2, accepted: 0, expired: 1, revoked: 0 });
    expect(out.counts).toMatchObject({ retakes_waiting: 3, retakes_approved: 0 });
    expect(out.assessments.map((a: any) => [a.name, a.status, a.attempts])).toEqual([['Fit', 'published', 7], ['Draft', 'draft', 0]]);
    expect(out.payments[0]).toMatchObject({ paid_by: 'N E', amount: 50000 });
  });

  it('records in the company’s audit trail that platform staff looked', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(org);
    await service.organizationDetail('o1', 'staff1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { organization_id: 'o1', actor_id: 'staff1', user_id: 'staff1', action: 'platform.company_viewed', resource_type: 'organization', resource_id: 'o1' } });
  });

  it('still answers when the audit write fails', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(org);
    prisma.auditLog.create.mockRejectedValue(new Error('db'));
    await expect(service.organizationDetail('o1', 'staff1')).resolves.toMatchObject({ id: 'o1' });
  });
});
