import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { escapeHtml } from '../html';
import { BRAND, detailRows, emailLayout } from './mail-layout';

export type MailOutcome = 'sent' | 'not_configured' | 'failed';

interface Attachment {
  filename: string;
  content: Buffer;
}

const PLACEHOLDER = /x{3,}|^\s*$|changeme|your[-_]/i;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  isConfigured(): boolean {
    const key = this.configService.get<string>('RESEND_API_KEY');
    return !!key && !PLACEHOLDER.test(key);
  }

  /** "Personnelq <address>", so inboxes show the product name. A FROM_EMAIL that already has a name is left alone. */
  private sender(): string {
    const from = this.configService.get<string>('FROM_EMAIL') || 'noreply@personnelq.local';
    return from.includes('<') ? from : `${BRAND} <${from}>`;
  }

  /**
   * Sends one email. Never throws: callers (payments, reports) must not fail because email did.
   * When no real Resend key is configured it logs what it would have sent and reports 'not_configured'.
   */
  private async deliver(
    options: { to: string; subject: string; html: string; attachments?: Attachment[] },
    devNote: string,
  ): Promise<MailOutcome> {
    if (!this.isConfigured()) {
      this.logger.warn(`RESEND_API_KEY not configured. ${devNote}`);
      return 'not_configured';
    }

    try {
      const resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
      const result: any = await resend.emails.send({
        from: this.sender(),
        to: options.to,
        subject: options.subject,
        html: options.html,
        // The v1 SDK JSON-encodes the payload, which would mangle a raw Buffer. Base64 text is what the API expects.
        attachments: options.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      });

      // Resend v1 does not throw when the API rejects a request: it resolves with the error body.
      // A real success always carries the new email's id.
      if (!result?.id) throw new Error(result?.message || 'Resend did not accept the email');
      return 'sent';
    } catch (err) {
      const from = this.configService.get<string>('FROM_EMAIL') || '';
      const hint = !from || /.local$/i.test(from) ? ' FROM_EMAIL must be on a domain verified in Resend (or onboarding@resend.dev for testing, which only delivers to your own Resend account email).' : '';
      this.logger.error(`Failed to send "${options.subject}" to ${options.to}: ${(err as Error).message}.${hint}`);
      return 'failed';
    }
  }

  async sendPasswordReset(to: string, first_name: string, reset_link: string): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: 'Reset your password',
        html: emailLayout({
          preheader: 'Choose a new password for your Personnelq account.',
          heading: 'Reset your password',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(first_name)},</p><p style="margin:0">We received a request to reset the password on your Personnelq account. Choose a new one with the button below.</p>`,
          button: { label: 'Choose a new password', href: reset_link },
          note: 'This link works for 1 hour. If you didn’t ask for it, ignore this email: your password stays as it is.',
        }),
      },
      `Password reset link for ${to}: ${reset_link}`,
    );
  }

  async sendPaymentReceipt(
    to: string,
    details: { first_name: string; description: string; amount: string; reference: string; paid_at: Date; link: string },
  ): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `Receipt: ${details.description}`,
        html: emailLayout({
          preheader: `We received ${details.amount} for ${details.description}.`,
          heading: 'Payment received',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(details.first_name)}, thank you. Your payment went through.</p>${detailRows([
            ['For', details.description],
            ['Amount', details.amount],
            ['Reference', details.reference],
            ['Date', details.paid_at.toUTCString()],
          ])}`,
          button: { label: 'Continue to Personnelq', href: details.link },
          note: 'Keep this email as your receipt.',
        }),
      },
      `Payment receipt for ${to}: ${details.description} ${details.amount} (${details.reference})`,
    );
  }

  async sendInvitation(
    to: string,
    details: { organization: string; inviter: string; link: string; expires: Date },
  ): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `${details.inviter} invited you to take a personality assessment`,
        html: emailLayout({
          preheader: `${details.organization} has invited you to Personnelq.`,
          heading: `You’re invited to join ${details.organization}`,
          body: `<p style="margin:0 0 12px">${escapeHtml(details.inviter)} from <strong>${escapeHtml(details.organization)}</strong> invited you to take the Personnelq full assessment.</p>
<p style="margin:0 0 6px"><strong>What the organisation sees</strong></p>
<p style="margin:0 0 12px">Results you take through this invitation are visible to the organisation’s administrators and HR team. Your personal results, badges and anything you take on your own stay private.</p>
<p style="margin:0">If you already have an account, you can leave the organisation at any time and it then stops seeing your results. An account created from this invitation stays with the organisation: it can’t leave, be deleted or change its email address until the organisation removes you. To keep full control, sign in with an account you already have.</p>`,
          button: { label: 'Accept the invitation', href: details.link },
          note: `This link works only for ${escapeHtml(to)} and expires on ${escapeHtml(details.expires.toUTCString())}. If you weren’t expecting it, you can ignore this email.`,
        }),
      },
      `Invitation for ${to} from ${details.organization}: ${details.link}`,
    );
  }

  async sendReminder(to: string, details: { first_name: string; organization: string; sender: string; link: string }): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `A reminder from ${details.organization}: your personality assessment`,
        html: emailLayout({
          preheader: 'It takes about 20 minutes and your progress is saved as you go.',
          heading: 'Pick up where you left off',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(details.first_name)},</p><p style="margin:0">${escapeHtml(details.sender)} at <strong>${escapeHtml(details.organization)}</strong> is gently reminding you to finish the Personnelq full assessment. It takes about 20 minutes, your progress saves as you go, and ${escapeHtml(details.organization)} covers the cost.</p>`,
          button: { label: 'Continue the assessment', href: details.link },
          note: `Results you take through ${escapeHtml(details.organization)} are visible to its administrators and HR. If you joined with an existing account you can leave at any time from your dashboard.`,
        }),
      },
      `Reminder for ${to} from ${details.organization}: ${details.link}`,
    );
  }

  async sendResults(
    to: string,
    details: { first_name: string; assessment: string; link: string; pdf?: Buffer; filename?: string },
  ): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `Your ${details.assessment} results`,
        html: emailLayout({
          preheader: 'Your results are ready to read.',
          heading: 'Your results are ready',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(details.first_name)},</p><p style="margin:0">Your ${escapeHtml(details.assessment)} results are ready${details.pdf ? ', and your PDF report is attached' : ''}.</p>`,
          button: { label: 'View your results online', href: details.link },
          note: 'Your results are private to you. You choose if and what to share.',
        }),
        attachments: details.pdf ? [{ filename: details.filename ?? 'personality-report.pdf', content: details.pdf }] : undefined,
      },
      `Results email for ${to}: ${details.link}${details.pdf ? ' (with PDF attached)' : ''}`,
    );
  }

  async sendEmailVerification(to: string, first_name: string, link: string): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: 'Confirm your email address',
        html: emailLayout({
          preheader: 'One quick step to finish setting up Personnelq.',
          heading: 'Confirm your email address',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(first_name)}, welcome to Personnelq.</p><p style="margin:0">Please confirm this address so we know it is yours.</p>`,
          button: { label: 'Confirm my email', href: link },
          note: 'The link works for 24 hours. If you didn’t create an account, you can ignore this email.',
        }),
      },
      `Email verification link for ${to}: ${link}`,
    );
  }

  async sendRetakeRequested(to: string, details: { organization: string; person: string; assessment: string; link: string }): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `${details.person} asked to retake an assessment`,
        html: emailLayout({
          preheader: `${details.person} is waiting for your approval.`,
          heading: 'A retake needs your approval',
          body: `<p style="margin:0"><strong>${escapeHtml(details.person)}</strong> asked to retake <strong>${escapeHtml(details.assessment)}</strong> for <strong>${escapeHtml(details.organization)}</strong>. Retakes through the organisation need your approval.</p>`,
          button: { label: 'Review the request', href: details.link },
        }),
      },
      `Retake request for ${to}: ${details.person} / ${details.assessment}`,
    );
  }

  async sendRetakeApproved(to: string, details: { first_name: string; organization: string; assessment: string; link: string; expires: Date }): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: `${details.organization} approved your retake`,
        html: emailLayout({
          preheader: 'You can start your retake now.',
          heading: 'Your retake is approved',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(details.first_name)},</p><p style="margin:0"><strong>${escapeHtml(details.organization)}</strong> approved a retake of <strong>${escapeHtml(details.assessment)}</strong>. Your earlier result stays in your history.</p>`,
          button: { label: 'Start the retake', href: details.link },
          note: `The approval works until ${escapeHtml(details.expires.toUTCString())}.`,
        }),
      },
      `Retake approved for ${to}: ${details.link}`,
    );
  }

  async sendRefundNotice(to: string, details: { first_name: string; description: string; amount: string }): Promise<MailOutcome> {
    return this.deliver(
      {
        to,
        subject: 'Your payment was refunded',
        html: emailLayout({
          preheader: `We refunded ${details.amount}.`,
          heading: 'Your payment was refunded',
          body: `<p style="margin:0 0 12px">Hi ${escapeHtml(details.first_name)},</p><p style="margin:0">We refunded <strong>${escapeHtml(details.amount)}</strong> for ${escapeHtml(details.description)}. Refunds usually reach your bank or card within a few working days.</p>`,
          note: 'If you didn’t expect this, reply to this email.',
        }),
      },
      `Refund notice for ${to}: ${details.description} ${details.amount}`,
    );
  }

  async sendPlanNotice(to: string, details: { organization: string; plan: string; ends: Date; ended: boolean; link: string }): Promise<MailOutcome> {
    const when = details.ended ? 'has ended' : `ends on ${details.ends.toUTCString()}`;
    return this.deliver(
      {
        to,
        subject: details.ended ? `${details.organization}'s plan has ended` : `${details.organization}'s plan ends soon`,
        html: emailLayout({
          preheader: `The ${details.plan} plan ${when}.`,
          heading: details.ended ? 'Your plan has ended' : 'Your plan ends soon',
          body: `<p style="margin:0 0 12px">The <strong>${escapeHtml(details.plan)}</strong> plan for <strong>${escapeHtml(details.organization)}</strong> ${escapeHtml(when)}.</p><p style="margin:0">${details.ended ? 'Until it is renewed, people can’t be invited and company-covered assessments are paused. Everything already taken is kept.' : 'Renew before then so nothing is interrupted. Time left on the plan is added to the new period.'}</p>`,
          button: { label: 'Open billing', href: details.link },
        }),
      },
      `Plan notice for ${to}: ${details.organization} ${when}`,
    );
  }
}
