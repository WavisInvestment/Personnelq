import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';

const USER = 'u1';

function setup(over: Record<string, unknown> = {}) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: USER, email: 'me@x.test', first_name: 'Me', password_hash: bcrypt.hashSync('Old-pass1!', 4), platform_role_id: null, ...over }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }), count: jest.fn().mockResolvedValue(1) },
    organizationMember: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), deleteMany: jest.fn() },
    organization: { updateMany: jest.fn() },
    employeeInvitation: { updateMany: jest.fn() },
    shareableBadge: { deleteMany: jest.fn() },
    assessmentResult: { deleteMany: jest.fn() },
    assessmentSubmission: { deleteMany: jest.fn() },
    personalityProfile: { deleteMany: jest.fn() },
    retakeRequest: { deleteMany: jest.fn() },
    idempotencyKey: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const auth: any = { sendVerification: jest.fn().mockResolvedValue('sent') };
  return { prisma, auth, service: new AccountService(prisma, auth) };
}

describe('password', () => {
  const dto = { current_password: 'Old-pass1!', password: 'New-pass2!', password_confirm: 'New-pass2!' };

  it('changes it, and signs out every other device but keeps this one', async () => {
    const { service, prisma } = setup();
    await expect(service.changePassword(USER, { ...dto, refresh_token: 'mine' })).resolves.toEqual({ changed: true });
    expect(await bcrypt.compare('New-pass2!', prisma.user.update.mock.calls[0][0].data.password_hash)).toBe(true);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER, refresh_token: { not: 'mine' } } });
  });

  it('needs the current password, matching confirmation, and a different password', async () => {
    const { service, prisma } = setup();
    await expect(service.changePassword(USER, { ...dto, current_password: 'Wrong-pass1!' })).rejects.toMatchObject({ response: { code: 'WRONG_PASSWORD' } });
    await expect(service.changePassword(USER, { ...dto, password_confirm: 'Different1!' })).rejects.toThrow('Passwords do not match');
    await expect(service.changePassword(USER, { ...dto, password: 'Old-pass1!', password_confirm: 'Old-pass1!' })).rejects.toMatchObject({ response: { code: 'SAME_PASSWORD' } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('an account created from a company invitation', () => {
  const managed = { joined_via_organization_id: 'org-1' };

  it('cannot change its email address or be deleted while the person is in that company', async () => {
    const { service, prisma } = setup(managed);
    prisma.organizationMember.findFirst.mockResolvedValue({ organization: { name: 'Acme Co' } });
    await expect(service.changeEmail(USER, { email: 'new@x.test', password: 'Old-pass1!' })).rejects.toMatchObject({ response: { code: 'ACCOUNT_MANAGED' } });
    await expect(service.deleteAccount(USER, 'Old-pass1!')).rejects.toMatchObject({ response: { code: 'ACCOUNT_MANAGED' } });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect((await service.get(USER))).toMatchObject({ managed: true, managed_by: 'Acme Co' });
  });

  it('is the person’s own again once the company has removed them', async () => {
    const { service, prisma } = setup(managed); // no active membership left
    await expect(service.changeEmail(USER, { email: 'new@x.test', password: 'Old-pass1!' })).resolves.toMatchObject({ pending_email: 'new@x.test' });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(await service.get(USER)).toMatchObject({ managed: false, managed_by: null });
  });
});

describe('email', () => {
  it('keeps the old address until the new one is confirmed, and sends the link to the new one', async () => {
    const { service, prisma, auth } = setup();
    await expect(service.changeEmail(USER, { email: 'new@x.test', password: 'Old-pass1!' })).resolves.toMatchObject({ pending_email: 'new@x.test' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: USER }, data: { pending_email: 'new@x.test' } });
    expect(auth.sendVerification).toHaveBeenCalledWith(USER, 'new@x.test', 'Me');
  });

  it('refuses a wrong password, the same address, and one that belongs to someone else', async () => {
    const { service, prisma } = setup();
    await expect(service.changeEmail(USER, { email: 'new@x.test', password: 'nope' })).rejects.toMatchObject({ response: { code: 'WRONG_PASSWORD' } });
    await expect(service.changeEmail(USER, { email: 'me@x.test', password: 'Old-pass1!' })).rejects.toMatchObject({ response: { code: 'SAME_EMAIL' } });
    prisma.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(service.changeEmail(USER, { email: 'taken@x.test', password: 'Old-pass1!' })).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
  });
});

describe('deleting the account', () => {
  it('needs the password', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteAccount(USER, 'nope')).rejects.toMatchObject({ response: { code: 'WRONG_PASSWORD' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes the person’s content and anonymises the account so nobody can sign in to it', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteAccount(USER, 'Old-pass1!')).resolves.toEqual({ deleted: true });
    for (const t of ['organizationMember', 'shareableBadge', 'assessmentResult', 'assessmentSubmission', 'personalityProfile', 'retakeRequest', 'session']) {
      expect(prisma[t].deleteMany).toHaveBeenCalledWith({ where: { user_id: USER } });
    }
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'deleted+u1@deleted.invalid', first_name: 'Deleted', email_verified: false, deleted_at: expect.any(Date) });
    expect(await bcrypt.compare('Old-pass1!', data.password_hash)).toBe(false);
  });

  it('will not leave a company with people in it and no administrator', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany
      .mockResolvedValueOnce([{ organization_id: 'org-1', organization: { name: 'Acme Co' } }]) // I administer this
      .mockResolvedValueOnce([{ role: { key: 'employee' } }]); // and others depend on it
    await expect(service.deleteAccount(USER, 'Old-pass1!')).rejects.toMatchObject({ response: { code: 'SOLE_ADMIN', organizations: ['Acme Co'] } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('closes a company that has nobody else, and allows leaving when another administrator exists', async () => {
    const alone = setup();
    alone.prisma.organizationMember.findMany.mockResolvedValueOnce([{ organization_id: 'org-1', organization: { name: 'Acme Co' } }]).mockResolvedValueOnce([]);
    await alone.service.deleteAccount(USER, 'Old-pass1!');
    expect(alone.prisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['org-1'] } }, data: expect.objectContaining({ status: 'inactive', deleted_at: expect.any(Date) }) });

    const shared = setup();
    shared.prisma.organizationMember.findMany.mockResolvedValueOnce([{ organization_id: 'org-1', organization: { name: 'Acme Co' } }]).mockResolvedValueOnce([{ role: { key: 'admin' } }]);
    await shared.service.deleteAccount(USER, 'Old-pass1!');
    expect(shared.prisma.organization.updateMany).not.toHaveBeenCalled();
  });

  it('platform staff accounts are not self-service', async () => {
    const { service } = setup({ platform_role_id: 'r1' });
    await expect(service.deleteAccount(USER, 'Old-pass1!')).rejects.toMatchObject({ response: { code: 'STAFF_ACCOUNT' } });
  });
});

describe('export', () => {
  it('returns the person’s data without any badge link secret', async () => {
    const { service, prisma } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([]);
    for (const t of ['assessmentSubmission', 'assessmentResult', 'payment', 'auditLog']) prisma[t] = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.shareableBadge.findMany = jest.fn().mockResolvedValue([{ share_token: 'secret', is_public: true }]);
    const out: any = await service.exportData(USER);
    expect(out.account.email).toBe('me@x.test');
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(out.badges[0]).toEqual({ is_public: true });
  });
});
