import { createHash } from 'crypto';
import { AuthService } from './auth.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const TOKEN = 'a'.repeat(64);

function setup(user: Record<string, unknown> | null = { id: 'u1', email: 'old@x.test', first_name: 'Ada', pending_email: null, email_verified: false, deleted_at: null }) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue(user),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const mail: any = { sendEmailVerification: jest.fn().mockResolvedValue('sent') };
  const config: any = { get: jest.fn((k: string) => (k === 'FRONTEND_URL' ? 'https://app.test' : undefined)) };
  return { prisma, mail, service: new AuthService(prisma, {} as any, config, mail) };
}

describe('email verification', () => {
  it('confirms the address from a valid, unexpired link and uses the link up', async () => {
    const { service, prisma } = setup();
    await expect(service.verifyEmail(TOKEN)).resolves.toEqual({ verified: true, email: 'old@x.test' });
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({ email_verify_token: hash(TOKEN), deleted_at: null });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ email_verified: true, email_verify_token: null, email_verify_expires: null, pending_email: null });
  });

  it('rejects a link that is unknown or has expired', async () => {
    const { service } = setup(null);
    await expect(service.verifyEmail(TOKEN)).rejects.toMatchObject({ response: { code: 'EMAIL_LINK_INVALID' } });
  });

  it('an email change only takes effect when the new address is confirmed', async () => {
    const { service, prisma } = setup({ id: 'u1', email: 'old@x.test', first_name: 'Ada', pending_email: 'new@x.test', email_verified: true, deleted_at: null });
    await expect(service.verifyEmail(TOKEN)).resolves.toEqual({ verified: true, email: 'new@x.test' });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ email: 'new@x.test', pending_email: null });
  });

  it('drops the change if someone else took the address in the meantime', async () => {
    const { service, prisma } = setup({ id: 'u1', email: 'old@x.test', first_name: 'Ada', pending_email: 'new@x.test', email_verified: true, deleted_at: null });
    prisma.user.findUnique.mockResolvedValue({ id: 'someone-else' });
    await expect(service.verifyEmail(TOKEN)).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ pending_email: null });
    expect(prisma.user.update.mock.calls[0][0].data.email).toBeUndefined();
  });

  it('stores only a hash of the emailed token, and the link points at the website', async () => {
    const { service, prisma, mail } = setup();
    await service.sendVerification('u1', 'ada@x.test', 'Ada');
    const stored = prisma.user.update.mock.calls[0][0].data;
    const link: string = mail.sendEmailVerification.mock.calls[0][2];
    const sent = link.split('token=')[1];
    expect(link.startsWith('https://app.test/auth/verify-email?token=')).toBe(true);
    expect(stored.email_verify_token).toBe(hash(sent));
    expect(stored.email_verify_token).not.toBe(sent);
    expect(stored.email_verify_expires.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
  });

  it('resending goes to the pending address when there is one, and does nothing for a confirmed account', async () => {
    const pending = setup({ id: 'u1', email: 'old@x.test', first_name: 'Ada', pending_email: 'new@x.test', email_verified: true, deleted_at: null });
    await pending.service.resendVerification('u1');
    expect(pending.mail.sendEmailVerification.mock.calls[0][0]).toBe('new@x.test');

    const done = setup({ id: 'u1', email: 'old@x.test', first_name: 'Ada', pending_email: null, email_verified: true, deleted_at: null });
    await expect(done.service.resendVerification('u1')).resolves.toEqual({ already_verified: true, email_status: null });
    expect(done.mail.sendEmailVerification).not.toHaveBeenCalled();
  });
});
