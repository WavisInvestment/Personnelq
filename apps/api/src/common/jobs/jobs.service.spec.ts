import { JobsService } from './jobs.service';

const DAY = 86400000;

function setup(paymentsEnabled = true) {
  const prisma: any = {
    employeeInvitation: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    retakeRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscription: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    organization: { update: jest.fn().mockResolvedValue({}) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([{ user: { email: 'boss@acme.test' } }]) },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    idempotencyKey: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    webhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const mail: any = { sendPlanNotice: jest.fn().mockResolvedValue('sent') };
  const billing: any = { paymentsEnabled: () => paymentsEnabled, frontendUrl: 'https://app.test' };
  const config: any = { get: jest.fn() };
  return { prisma, mail, service: new JobsService(prisma, mail, billing, config) };
}

const sub = (over: object) => ({ id: 's1', plan_name: 'Team', organization_id: 'org-1', organization: { name: 'Acme Co' }, last_expiry_notice: null, end_date: new Date(Date.now() + 5 * DAY), ...over });

describe('JobsService', () => {
  it('closes expired invitations and approvals', async () => {
    const { service, prisma } = setup();
    await expect(service.expireInvitations()).resolves.toBe(2);
    expect(prisma.employeeInvitation.updateMany).toHaveBeenCalledWith({ where: { status: 'pending', expires_at: { lte: expect.any(Date) } }, data: { status: 'expired', open_key: null } });
    await expect(service.expireRetakes()).resolves.toBe(1);
    expect(prisma.retakeRequest.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'approved' });
  });

  it('warns administrators a week before the plan ends, once', async () => {
    const { service, prisma, mail } = setup();
    prisma.subscription.findMany.mockResolvedValue([sub({})]);
    await expect(service.sendPlanNotices()).resolves.toBe(1);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({ where: { id: 's1', last_expiry_notice: null }, data: { last_expiry_notice: '7d' } });
    expect(mail.sendPlanNotice).toHaveBeenCalledWith('boss@acme.test', expect.objectContaining({ organization: 'Acme Co', ended: false }));

    mail.sendPlanNotice.mockClear();
    prisma.subscription.findMany.mockResolvedValue([sub({ last_expiry_notice: '7d' })]);
    await expect(service.sendPlanNotices()).resolves.toBe(0);
    expect(mail.sendPlanNotice).not.toHaveBeenCalled();
  });

  it('sends the one-day warning even after the week warning, but never goes backwards', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findMany.mockResolvedValue([sub({ last_expiry_notice: '7d', end_date: new Date(Date.now() + 3600000) })]);
    await service.sendPlanNotices();
    expect(prisma.subscription.updateMany.mock.calls[0][0].data).toEqual({ last_expiry_notice: '1d' });
  });

  it('marks a plan that ran out as expired, deactivates the company and says so', async () => {
    const { service, prisma, mail } = setup();
    prisma.subscription.findMany.mockResolvedValue([sub({ end_date: new Date(Date.now() - 1000), last_expiry_notice: '1d' })]);
    await service.sendPlanNotices();
    expect(prisma.subscription.updateMany.mock.calls[0][0].data).toEqual({ last_expiry_notice: 'ended', status: 'expired' });
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { subscription_status: 'inactive' } });
    expect(mail.sendPlanNotice).toHaveBeenCalledWith('boss@acme.test', expect.objectContaining({ ended: true }));
  });

  it('does not email twice when another instance claimed the notice first', async () => {
    const { service, prisma, mail } = setup();
    prisma.subscription.findMany.mockResolvedValue([sub({})]);
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sendPlanNotices()).resolves.toBe(0);
    expect(mail.sendPlanNotice).not.toHaveBeenCalled();
  });

  it('leaves plans alone while payments are switched off', async () => {
    const { service, prisma } = setup(false);
    await expect(service.sendPlanNotices()).resolves.toBe(0);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it('clears stale sessions and links, and one failing task does not stop the rest', async () => {
    const { service, prisma } = setup();
    await expect(service.clearStale()).resolves.toBe(5);
    prisma.employeeInvitation.updateMany.mockRejectedValue(new Error('db down'));
    const report = await service.runAll();
    expect(report.invitations_expired).toBe('failed');
    expect(report.stale_credentials_cleared).toBe(5);
  });
});
