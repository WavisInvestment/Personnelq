import { escapeHtml } from '../html';

/** The product name as it appears in every email. */
export const BRAND = 'Personnelq';

const INK = '#1b211e';
const MUTED = '#575d57';
const GREEN = '#254d38';
const ACCENT = '#dd5a33';
const PAPER = '#f3f0e8';
const LINE = '#dcd7c9';

export interface EmailParts {
  /** The grey preview line some inboxes show beside the subject. */
  preheader: string;
  heading: string;
  /** Trusted HTML for the body: callers escape anything that came from a person. */
  body: string;
  button?: { label: string; href: string };
  /** A quieter line under the button (why you got this, when a link expires). Trusted HTML. */
  note?: string;
}

/** One branded frame for every email: wordmark, a heading, the message, one clear button, and a quiet footer. */
export function emailLayout(p: EmailParts): string {
  const button = p.button
    ? `<tr><td style="padding:8px 0 4px">
        <a href="${escapeHtml(p.button.href)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:10px">${escapeHtml(p.button.label)}</a>
      </td></tr>
      <tr><td style="padding:14px 0 0;font-size:13px;line-height:1.5;color:${MUTED}">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(p.button.href)}" style="color:${GREEN};word-break:break-all">${escapeHtml(p.button.href)}</a></td></tr>`
    : '';
  const note = p.note ? `<tr><td style="padding:22px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">${p.note}</td></tr>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(p.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
    <tr><td style="padding:0 4px 18px;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${GREEN}">${BRAND}<span style="color:${ACCENT}">.</span></td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:32px 30px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;padding-bottom:14px">${escapeHtml(p.heading)}</td></tr>
        <tr><td style="font-size:16px;line-height:1.65;color:${INK};padding-bottom:18px">${p.body}</td></tr>
        ${button}
        ${note}
      </table>
    </td></tr>
    <tr><td style="padding:18px 6px 0;font-size:12px;line-height:1.6;color:${MUTED}">Sent by ${BRAND}. If this email wasn’t meant for you, you can safely ignore it.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Table of label/value rows (receipts). Values are escaped here. */
export function detailRows(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${LINE};margin:6px 0 4px">${rows
    .map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${MUTED};width:38%">${escapeHtml(k)}</td><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:15px;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;
}
