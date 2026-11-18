import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StaffActionsService } from './staff-actions.service';

const ACTOR = { id: 'staff1', first_name: 'Sam', last_name: 'Staff' };

function setup(user: object | null = { id: 'u1', email: 'a@x.test', platform_role_id: null, suspended_at: null, suspended_reason: null, failed_login_attempts: 3, locked_until: new Date(Date.now() + 1e6) }) {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    organization: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    staffAction: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn((ops: any[]) => Promise.all(ops));
  const auth: any = { forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }) };
  const payments: any = { refund: jest.fn().mockResolvedValue({ id: 'p1', status: 'refunded', refund_status: 'pending' }) };
  return { prisma, auth, payments, service: new StaffActionsService(prisma, auth, payments) };
}
const recorded = (prisma: any) => prisma.staffAction.create.mock.calls.map((c: any) => c[0].data);

describe('people', () => {
  it('unlocks a person and records it', async () => {
    const { service, prisma } = setup();
    await expect(service.unlock('u1', ACTOR)).resolves.toEqual({ unlocked: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { failed_login_attempts: 0, locked_until: null } });
    expect(recorded(prisma)[0]).toMatchObject({ action: 'user.unlocked', target_type: 'user', target_id: 'u1', actor_id: 'staff1', actor_name: 'Sam Staff' });
  });

  it('sends the normal password reset email and changes nothing else', async () => {
    const { service, auth, prisma } = setup();
    await service.sendPasswordReset('u1', ACTOR);
    expect(auth.forgotPassword).toHaveBeenCalledWith('a@x.test');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(recorded(prisma)[0].action).toBe('user.reset_sent');
  });

  it('suspends: blocks the account, ends every session, and keeps the reason', async () => {
    const { service, prisma } = setup();
    await expect(service.suspendUser('u1', ACTOR, 'Abuse reports')).resolves.toEqual({ suspended: true });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ suspended_reason: 'Abuse reports', suspended_at: expect.any(Date) });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'u1' } });
    expect(recorded(prisma)[0]).toMatchObject({ action: 'user.suspended', reason: 'Abuse reports' });
  });

  it('refuses to suspend yourself, staff, or someone already suspended; 404s for nobody', async () => {
    await expect(setup().service.suspendUser('staff1', ACTOR, 'reason here')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ id: 'u2', platform_role_id: 'r1', suspended_at: null }).service.suspendUser('u2', ACTOR, 'reason here')).rejects.toMatchObject({ response: { code: 'STAFF_ACCOUNT' } });
    await expect(setup({ id: 'u2', platform_role_id: null, suspended_at: new Date() }).service.suspendUser('u2', ACTOR, 'reason here')).rejects.toMatchObject({ response: { code: 'ALREADY_SUSPENDED' } });
    await expect(setup(null).service.suspendUser('nobody', ACTOR, 'reason here')).rejects.toBeInstanceOf(NotFoundException);
    const none = setup();
    await expect(setup({ id: 'u2', platform_role_id: 'r1', suspended_at: null }).service.suspendUser('u2', ACTOR, 'reason here').catch(() => 'x')).resolves.toBe('x');
    expect(none.prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('reactivates a suspended person (and clears any lock), and refuses one who is not suspended', async () => {
    const { service, prisma } = setup({ id: 'u1', suspended_at: new Date(), suspended_reason: 'Abuse reports' });
    await expect(service.reactivateUser('u1', ACTOR)).resolves.toEqual({ suspended: false });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ suspended_at: null, suspended_reason: null, failed_login_attempts: 0, locked_until: null });
    expect(recorded(prisma)[0]).toMatchObject({ action: 'user.reactivated', details: { was_suspended_for: 'Abuse reports' } });
    await expect(setup({ id: 'u1', suspended_at: null }).service.reactivateUser('u1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('companies', () => {
  const org = (status: string) => ({ id: 'o1', name: 'Acme', status, suspended_reason: status === 'suspended' ? 'Unpaid' : null });

  it('suspends a company, and writes it to the company’s own audit trail', async () => {
    const { service, prisma } = setup();
    prisma.organization.findFirst.mockResolvedValue(org('active'));
    await service.suspendOrganization('o1', ACTOR, 'Chargeback dispute');
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ status: 'suspended', suspended_reason: 'Chargeback dispute', suspended_at: expect.any(Date) });
    expect(recorded(prisma)[0]).toMatchObject({ action: 'organization.suspended', target_type: 'organization', reason: 'Chargeback dispute' });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ organization_id: 'o1', actor_id: 'staff1', action: 'platform.company_suspended', changes: { reason: 'Chargeback dispute' } });
  });

  it('reactivates only a suspended company', async () => {
    const a = setup();
    a.prisma.organization.findFirst.mockResolvedValue(org('suspended'));
    await expect(a.service.reactivateOrganization('o1', ACTOR)).resolves.toEqual({ status: 'active' });
    expect(a.prisma.organization.update.mock.calls[0][0].data).toMatchObject({ status: 'active', suspended_at: null, suspended_reason: null });
    expect(a.prisma.auditLog.create.mock.calls[0][0].data.action).toBe('platform.company_reactivated');

    const b = setup();
    b.prisma.organization.findFirst.mockResolvedValue(org('active'));
    await expect(b.service.reactivateOrganization('o1', ACTOR)).rejects.toMatchObject({ response: { code: 'NOT_SUSPENDED' } });
    await expect(b.service.suspendOrganization('o1', ACTOR, 'reason here')).resolves.toBeDefined();
    b.prisma.organization.findFirst.mockResolvedValue(org('suspended'));
    await expect(b.service.suspendOrganization('o1', ACTOR, 'reason here')).rejects.toMatchObject({ response: { code: 'ALREADY_SUSPENDED' } });
    b.prisma.organization.findFirst.mockResolvedValue(null);
    await expect(b.service.suspendOrganization('nope', ACTOR, 'reason here')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('payments', () => {
  it('refunds through the payments service and records who and why', async () => {
    const { service, payments, prisma } = setup();
    await expect(service.refund('p1', ACTOR, 'Charged twice')).resolves.toMatchObject({ status: 'refunded' });
    expect(payments.refund).toHaveBeenCalledWith('p1', 'Charged twice');
    expect(recorded(prisma)[0]).toMatchObject({ action: 'payment.refunded', target_type: 'payment', target_id: 'p1', reason: 'Charged twice' });
  });

  it('records nothing when the refund is refused', async () => {
    const { service, payments, prisma } = setup();
    payments.refund.mockRejectedValue(new ConflictException('no'));
    await expect(service.refund('p1', ACTOR, 'Charged twice')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.staffAction.create).not.toHaveBeenCalled();
  });
});
