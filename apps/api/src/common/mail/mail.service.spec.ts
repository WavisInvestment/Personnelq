const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }));

import { MailService } from './mail.service';

const make = (env: Record<string, string | undefined> = { RESEND_API_KEY: 're_realkey1234567890', FROM_EMAIL: 'noreply@example.com' }) =>
  new MailService({ get: (k: string) => env[k] } as any);

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ id: 'em_123' });
});

describe('MailService', () => {
  describe('when Resend is not configured', () => {
    it.each([[undefined], [''], ['re_xxxxx']])('reports "not_configured" and sends nothing (key: %p)', async (key) => {
      const mail = make({ RESEND_API_KEY: key });
      expect(mail.isConfigured()).toBe(false);
      expect(await mail.sendPasswordReset('a@b.com', 'Ada', 'http://x/reset')).toBe('not_configured');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('delivery outcome', () => {
    it('is "sent" when Resend returns the new email’s id', async () => {
      expect(await make().sendPasswordReset('a@b.com', 'Ada', 'http://x/reset')).toBe('sent');
    });

    it('is "failed" when Resend rejects the request, even though the v1 SDK resolves with the error instead of throwing', async () => {
      send.mockResolvedValue({ name: 'validation_error', message: 'Domain not verified', statusCode: 403 });
      expect(await make().sendPasswordReset('a@b.com', 'Ada', 'http://x/reset')).toBe('failed');
    });

    it('is "failed" for an empty or odd reply', async () => {
      for (const reply of [undefined, null, {}, { message: 'nope' }]) {
        send.mockResolvedValue(reply);
        expect(await make().sendPaymentReceipt('a@b.com', receipt)).toBe('failed');
      }
    });

    it('is "failed" (and does not throw) when the network call itself throws', async () => {
      send.mockRejectedValue(new Error('socket hang up'));
      await expect(make().sendPasswordReset('a@b.com', 'Ada', 'http://x/reset')).resolves.toBe('failed');
    });
  });

  describe('contents', () => {
    it('sends from the configured address to exactly one recipient', async () => {
      await make().sendPasswordReset('a@b.com', 'Ada', 'http://x/reset');
      expect(send.mock.calls[0][0]).toMatchObject({ from: 'Personnelq <noreply@example.com>', to: 'a@b.com', subject: 'Reset your password' });
    });

    it('escapes names and links so nothing a user typed can inject markup', async () => {
      await make().sendPasswordReset('a@b.com', '<script>alert(1)</script>', 'http://x/?a="1"&b=<2>');
      const html: string = send.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('"1"');
    });

    it('puts the amount, reference and a link in a receipt', async () => {
      await make().sendPaymentReceipt('a@b.com', receipt);
      const { subject, html } = send.mock.calls[0][0];
      expect(subject).toBe('Receipt: Full personality assessment');
      expect(html).toContain('₦5,000');
      expect(html).toContain('pb_ref123');
      expect(html).toContain('http://localhost:3000/assessments/full');
    });

    it('attaches a PDF as base64 text, not a raw buffer the SDK would mangle', async () => {
      const pdf = Buffer.from('%PDF-1.4 fake pdf bytes');
      await make().sendResults('a@b.com', { first_name: 'Ada', assessment: 'Full Big Five', link: 'http://x/results/1', pdf });
      const attachment = send.mock.calls[0][0].attachments[0];
      expect(attachment.filename).toBe('personality-report.pdf');
      expect(typeof attachment.content).toBe('string');
      expect(Buffer.from(attachment.content, 'base64').toString()).toBe('%PDF-1.4 fake pdf bytes');
    });

    it('sends no attachment list at all when there is no PDF', async () => {
      await make().sendResults('a@b.com', { first_name: 'Ada', assessment: 'Full Big Five', link: 'http://x/results/1' });
      expect(send.mock.calls[0][0].attachments).toBeUndefined();
      expect(send.mock.calls[0][0].html).not.toContain('attached');
    });
  });
});

const receipt = {
  first_name: 'Ada',
  description: 'Full personality assessment',
  amount: '₦5,000',
  reference: 'pb_ref123',
  paid_at: new Date('2026-10-01T10:00:00Z'),
  link: 'http://localhost:3000/assessments/full',
};
