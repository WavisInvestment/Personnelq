import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RetakesService } from './retakes.service';

const ORG = 'org-1';
const HR = { id: 'hr-1', email: 'hr@acme.test', first_name: 'Hana', last_name: 'R', email_verified: true };
const EMP = { id: 'emp-1', email: 'emp@acme.test', first_name: 'Eli', last_name: 'M', email_verified: true };
const future = () => new Date(Date.now() + 86400000);

function setup(permissions: string[] = ['approve:retakes']) {
  const prisma: any = {
    organization: { findFirst: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme Co' }) },
    organizationMember: {
      findFirst: jest.fn().mockResolvedValue({ user: { id: EMP.id, email: EMP.email, first_name: 'Eli', last_name: 'M' } }),
      findMany: jest.fn().mockResolvedValue([{ user: { email: 'hr@acme.test' } }]),
    },
    assessment: { findFirst: jest.fn().mockResolvedValue({ id: 'a-full', name: 'Full assessment' }) },
    assessmentSubmission: { count: jest.fn().mockResolvedValue(1) },
    retakeRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'rq-1', ...data })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'active', end_date: new Date(Date.now() + 86_400_000) }) },
  };
  const rbac: any = { permissionsInOrganization: jest.fn().mockResolvedValue(permissions) };
  const mail: any = { sendRetakeRequested: jest.fn().mockResolvedValue('sent'), sendRetakeApproved: jest.fn().mockResolvedValue('sent') };
  const billing: any = { frontendUrl: 'https://app.test', paymentsEnabled: () => true };
  return { prisma, mail, service: new RetakesService(prisma, rbac, mail, billing) };
}

describe('asking for a retake', () => {
  it('records the request and tells the company’s administrators and HR', async () => {
    const { service, prisma, mail } = setup();
    await expect(service.request(EMP, 'a-full', ORG)).resolves.toMatchObject({ id: 'rq-1', status: 'requested' });
    expect(prisma.retakeRequest.create.mock.calls[0][0].data).toMatchObject({ organization_id: ORG, user_id: EMP.id, requested_by: 'member' });
    expect(mail.sendRetakeRequested).toHaveBeenCalledWith('hr@acme.test', expect.objectContaining({ organization: 'Acme Co', person: 'Eli M' }));
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'retake.requested' });
  });

  it('is idempotent: asking twice returns the open request', async () => {
    const { service, prisma, mail } = setup();
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-0', status: 'requested', expires_at: null });
    await expect(service.request(EMP, 'a-full', ORG)).resolves.toMatchObject({ id: 'rq-0' });
    expect(prisma.retakeRequest.create).not.toHaveBeenCalled();
    expect(mail.sendRetakeRequested).not.toHaveBeenCalled();
  });

  it('refuses outsiders, people who never finished, and unconfirmed emails', async () => {
    const a = setup();
    a.prisma.organizationMember.findFirst.mockResolvedValue(null);
    await expect(a.service.request(EMP, 'a-full', ORG)).rejects.toThrow(ForbiddenException);
    const b = setup();
    b.prisma.assessmentSubmission.count.mockResolvedValue(0);
    await expect(b.service.request(EMP, 'a-full', ORG)).rejects.toMatchObject({ response: { code: 'RETAKE_NOT_NEEDED' } });
    await expect(setup().service.request({ ...EMP, email_verified: false }, 'a-full', ORG)).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
  });

  it('404s for an assessment the company can’t run', async () => {
    const { service, prisma } = setup();
    prisma.assessment.findFirst.mockResolvedValue(null);
    await expect(service.request(EMP, 'other', ORG)).rejects.toThrow(NotFoundException);
  });
});

describe('deciding', () => {
  it('only people who may approve retakes can list, allow, approve, decline or cancel', async () => {
    const { service } = setup([]);
    for (const run of [() => service.list('x', ORG), () => service.allow(HR, ORG, EMP.id, 'a-full'), () => service.approve(HR, ORG, 'rq'), () => service.decline(HR, ORG, 'rq'), () => service.cancel(HR, ORG, 'rq')]) {
      await expect(run()).rejects.toThrow(ForbiddenException);
    }
  });

  it('HR can allow a retake first: a 14-day approval is created and the person is emailed', async () => {
    const { service, prisma, mail } = setup();
    const out: any = await service.allow(HR, ORG, EMP.id, 'a-full');
    expect(out.status).toBe('approved');
    expect(prisma.retakeRequest.create.mock.calls[0][0].data).toMatchObject({ requested_by: 'hr' });
    const days = (prisma.retakeRequest.update.mock.calls[0][0].data.expires_at.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(mail.sendRetakeApproved).toHaveBeenCalledWith(EMP.email, expect.objectContaining({ organization: 'Acme Co' }));
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'retake.approved', actor_id: HR.id, user_id: EMP.id });
  });

  it('allowing when the person never finished is refused; when already approved nothing new is made', async () => {
    const a = setup();
    a.prisma.assessmentSubmission.count.mockResolvedValue(0);
    await expect(a.service.allow(HR, ORG, EMP.id, 'a-full')).rejects.toMatchObject({ response: { code: 'RETAKE_NOT_NEEDED' } });
    const b = setup();
    b.prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-9', status: 'approved', expires_at: future() });
    await expect(b.service.allow(HR, ORG, EMP.id, 'a-full')).resolves.toMatchObject({ id: 'rq-9', status: 'approved' });
    expect(b.prisma.retakeRequest.create).not.toHaveBeenCalled();
    expect(b.mail.sendRetakeApproved).not.toHaveBeenCalled();
  });

  it('approves a waiting request, and refuses one that was already dealt with', async () => {
    const { service, prisma } = setup();
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-1', status: 'requested', user_id: EMP.id, assessment_id: 'a-full' });
    await expect(service.approve(HR, ORG, 'rq-1')).resolves.toMatchObject({ status: 'approved' });
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-1', status: 'used', user_id: EMP.id, assessment_id: 'a-full' });
    await expect(service.approve(HR, ORG, 'rq-1')).rejects.toMatchObject({ response: { code: 'RETAKE_NOT_WAITING' } });
  });

  it('refuses to approve a retake while the plan has ended, and lets it through when payments are off', async () => {
    const { service, prisma } = setup();
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-1', status: 'requested', user_id: EMP.id, assessment_id: 'a-full' });
    prisma.subscription.findUnique.mockResolvedValue({ status: 'active', end_date: new Date(Date.now() - 1000) });
    await expect(service.approve(HR, ORG, 'rq-1')).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_REQUIRED' } });
    prisma.subscription.findUnique.mockResolvedValue(null);
    await expect(service.approve(HR, ORG, 'rq-1')).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_REQUIRED' } });
    expect(prisma.retakeRequest.update).not.toHaveBeenCalled();
  });

  it('declines, and withdraws an approval only while unused', async () => {
    const { service, prisma } = setup();
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-1', status: 'requested', user_id: EMP.id, assessment_id: 'a-full' });
    await expect(service.decline(HR, ORG, 'rq-1')).resolves.toMatchObject({ status: 'declined' });
    prisma.retakeRequest.findFirst.mockResolvedValue({ id: 'rq-1', status: 'approved', user_id: EMP.id, assessment_id: 'a-full' });
    await expect(service.cancel(HR, ORG, 'rq-1')).resolves.toMatchObject({ status: 'cancelled' });
    prisma.retakeRequest.updateMany.mockResolvedValue({ count: 0 }); // used a moment ago
    await expect(service.cancel(HR, ORG, 'rq-1')).rejects.toMatchObject({ response: { code: 'RETAKE_NOT_APPROVED' } });
  });

  it('does not reveal another company’s request', async () => {
    const { service, prisma } = setup();
    prisma.retakeRequest.findFirst.mockResolvedValue(null);
    await expect(service.approve(HR, ORG, 'foreign')).rejects.toThrow(NotFoundException);
    expect(prisma.retakeRequest.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'foreign', organization_id: ORG });
  });
});
