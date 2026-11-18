process.env.W5_TAG = 'rb';
const fs = require('fs');
const path = require('path');
const { prisma, call, fake, check, sleep, makeUser, assessments, grantPaid, takeAssessment, finish } = require('./lib');

const emails = () => fake('resend', '/__control/emails');
const publicBadge = (token) => fetch(`http://localhost:3101/api/v1/public/badges/${token}`).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));
const tokenOf = (badge) => badge.share_path.replace('/b/', '');

(async () => {
  await fake('resend', '/__control/reset', 'POST'); await fake('claude', '/__control/reset', 'POST');

  const hostileFirst = '<b>Eve</b>';
  const a = await makeUser('a', { first: hostileFirst, last: 'O\'Neil & "Co"' });
  const b = await makeUser('b');
  const { snap, full } = await assessments(a.token);
  const snapResult = await takeAssessment(a.token, snap.id);
  await grantPaid(a, full.id);
  const resultA = await takeAssessment(a.token, full.id);
  await call('POST', `/results/${resultA.id}/insights`, a.token);

  // ---------------------------------------------------------------- the PDF
  check('PDF: needs a login (401)', (await call('GET', `/results/${resultA.id}/report`)).status === 401);
  check('PDF: someone else cannot download my report (404)', (await call('GET', `/results/${resultA.id}/report`, b.token)).status === 404);
  const prev = await call('GET', `/results/${snapResult.id}/report`, a.token);
  check('PDF: the free snapshot has no report (400 REPORT_NOT_AVAILABLE)', prev.status === 400 && prev.body.code === 'REPORT_NOT_AVAILABLE');

  const pdf = await call('GET', `/results/${resultA.id}/report`, a.token);
  const buf = pdf.buffer;
  check('PDF: owner gets application/pdf', pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('application/pdf'));
  check('PDF: downloaded as a dated file name', /attachment; filename="[A-Za-z0-9-]+-personality-report-\d{4}-\d{2}-\d{2}\.pdf"/.test(pdf.headers.get('content-disposition') || ''), pdf.headers.get('content-disposition'));
  check('PDF: never cached (private, no-store)', /private/.test(pdf.headers.get('cache-control') || '') && /no-store/.test(pdf.headers.get('cache-control') || ''));
  check('PDF: a real PDF document of a sensible size', buf && buf.slice(0, 5).toString() === '%PDF-' && buf.slice(-8).toString().includes('%%EOF') && buf.length > 20000, `${buf?.length} bytes`);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF: several pages (profile, trait readings and the eight insight sections)', pages >= 3, `${pages} pages`);
  fs.writeFileSync(path.join(require('os').tmpdir(), 'w5-report.pdf'), buf);

  const c = await makeUser('c');
  await grantPaid(c, full.id);
  const resultC = await takeAssessment(c.token, full.id);
  const noInsightsPdf = await call('GET', `/results/${resultC.id}/report`, c.token);
  const pagesNo = (noInsightsPdf.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF: works without insights, and is shorter', noInsightsPdf.status === 200 && pagesNo >= 1 && pagesNo < pages, `${pagesNo} vs ${pages} pages`);

  // ---------------------------------------------------------------- emailing it
  const sentBefore = (await emails()).length;
  const mailed = await call('POST', `/results/${resultA.id}/email`, a.token);
  check('email: reports it was sent, with the PDF attached', mailed.status === 200 && mailed.body.status === 'sent' && mailed.body.attached === true, mailed.text);
  const mails = await emails();
  const m = mails[mails.length - 1];
  check('email: went only to the account holder’s own address', mails.length === sentBefore + 1 && m.to === a.email, JSON.stringify(m.to));
  check('email: subject names the assessment', m.subject === 'Your Full personality assessment results', m.subject);
  check('email: the attachment is a real PDF', m.attachments.length === 1 && /^[A-Za-z0-9-]+-personality-report-\d{4}-\d{2}-\d{2}\.pdf$/.test(m.attachments[0].filename) && m.attachments[0].startsWithPdf && m.attachments[0].base64Length > 20000);
  check('email: links to the results page on the website', m.html.includes('http://localhost:3100/results/' + resultA.id));
  check('email: the person’s name is escaped, so a hostile name cannot inject markup', !m.html.includes('<b>Eve</b>') && m.html.includes('&lt;b&gt;Eve&lt;/b&gt;'));
  check('email: someone else cannot email my report (404) and the snapshot has none (400)', (await call('POST', `/results/${resultA.id}/email`, b.token)).status === 404 && (await call('POST', `/results/${snapResult.id}/email`, a.token)).status === 400);
  await fake('resend', '/__control/mode', 'POST', { mode: 'error' });
  const failedMail = await call('POST', `/results/${resultA.id}/email`, a.token);
  check('email: if Resend is down the request still answers calmly with status "failed"', failedMail.status === 200 && failedMail.body.status === 'failed');
  await fake('resend', '/__control/mode', 'POST', { mode: 'ok' });

  // ---------------------------------------------------------------- the badge
  check('badge: none exists yet', (await call('GET', `/results/${resultA.id}/badge`, a.token)).body.badge === null);
  check('badge: the free snapshot cannot become a badge (400)', (await call('PUT', `/results/${snapResult.id}/badge`, a.token, { is_public: true })).body.code === 'BADGE_NOT_AVAILABLE');
  check('badge: someone else cannot read, change or revoke mine (404)', (await call('GET', `/results/${resultA.id}/badge`, b.token)).status === 404 && (await call('PUT', `/results/${resultA.id}/badge`, b.token, { is_public: true })).status === 404 && (await call('DELETE', `/results/${resultA.id}/badge`, b.token)).status === 404);

  for (const [label, body] of [
    ['a name over 60 characters', { is_public: true, display_name: 'x'.repeat(61) }],
    ['a message over 280 characters', { is_public: true, custom_message: 'x'.repeat(281) }],
    ['an expiry that is not offered', { is_public: true, expires_in_days: 7 }],
    ['a missing on/off switch', { display_name: 'Eve' }],
    ['an unknown field', { is_public: true, user_id: 'someone-else' }],
    ['a non-boolean switch', { is_public: 'yes' }],
  ]) check(`badge: ${label} -> 400`, (await call('PUT', `/results/${resultA.id}/badge`, a.token, body)).status === 400);

  const created = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true });
  const badge = created.body.badge;
  const token1 = tokenOf(badge);
  check('badge: sharing on gives an unguessable link', created.status === 200 && /^\/b\/[A-Za-z0-9_-]{43}$/.test(badge.share_path) && badge.is_live === true);
  check('badge: private-by-default choices (first name only, scores and date on, readings off)', badge.display_name === hostileFirst && JSON.stringify(badge.shared_elements) === JSON.stringify({ scores: true, descriptions: false, date: true, class: true }) && badge.custom_message === null && badge.expires_at === null);

  const seen = await publicBadge(token1);
  check('badge: anyone with the link can view it, with no login', seen.status === 200 && seen.body.assessment_name === 'Full personality assessment' && seen.body.display_name === hostileFirst);
  check('badge: shows five traits with level and score, no written readings', seen.body.traits.length === 5 && seen.body.traits.every((t) => typeof t.score === 'number' && t.level_label && t.description === null));
  check('badge: never cached, so revoking is immediate', /no-store/.test(seen.headers.get('cache-control') || ''));
  check('badge: exposes nothing about the account (no ids, email, token or result id)', !new RegExp(`${a.id}|${a.email}|${resultA.id}|${token1}|user_id|result_id|share_token`).test(JSON.stringify(seen.body)), Object.keys(seen.body).join(','));
  const counted = await call('GET', `/results/${resultA.id}/badge`, a.token);
  check('badge: the owner sees how many times it was viewed', counted.body.badge.view_count === 1 && !!counted.body.badge.last_viewed_at);

  const edited = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true, show_scores: false, show_descriptions: true, show_date: false, custom_message: 'Open to <i>mentoring</i>', display_name: 'Eve O.' });
  check('badge: editing keeps the same link', tokenOf(edited.body.badge) === token1);
  const seen2 = await publicBadge(token1);
  check('badge: the public view follows the owner’s choices exactly', seen2.body.traits.every((t) => t.score === null && typeof t.description === 'string') && seen2.body.completed_at === null && seen2.body.display_name === 'Eve O.' && seen2.body.message === 'Open to <i>mentoring</i>');

  // expiry
  const timed = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true, expires_in_days: 30 });
  const days = (new Date(timed.body.badge.expires_at) - Date.now()) / 86400000;
  check('badge: a 30-day expiry is recorded', days > 29 && days < 31, `${days.toFixed(1)} days`);
  await prisma.shareableBadge.update({ where: { result_id: resultA.id }, data: { expires_at: new Date(Date.now() - 60000) } });
  check('badge: once expired the link stops working (404)', (await publicBadge(token1)).status === 404);
  const expired = (await call('GET', `/results/${resultA.id}/badge`, a.token)).body.badge;
  check('badge: the owner is told it expired', expired.expired === true && expired.is_live === false);

  // re-opening and revoking
  const reopened = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true });
  const token2 = tokenOf(reopened.body.badge);
  check('badge: switching sharing back on issues a brand-new link', token2 !== token1 && reopened.body.badge.expires_at === null && reopened.body.badge.is_live);
  check('badge: the old (expired) link stays dead; the new one works', (await publicBadge(token1)).status === 404 && (await publicBadge(token2)).status === 200);

  const off = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: false });
  check('badge: turning sharing off kills the link at once and hides the address', (await publicBadge(token2)).status === 404 && off.body.badge.share_path === null);
  const reon = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true });
  const token3 = tokenOf(reon.body.badge);
  check('badge: and turning it on again never revives the old link', token3 !== token2 && (await publicBadge(token2)).status === 404 && (await publicBadge(token3)).status === 200);
  const revoked = await call('DELETE', `/results/${resultA.id}/badge`, a.token);
  check('badge: revoking stops sharing and retires the link', revoked.body.badge.is_public === false && (await publicBadge(token3)).status === 404);

  for (const bad of ['short', 'a'.repeat(43), 'a'.repeat(100), "' OR 1=1 --", '..%2F..%2Fetc%2Fpasswd', '%00']) {
    const r = await fetch(`http://localhost:3101/api/v1/public/badges/${bad}`);
    if (r.status !== 404) check(`badge: bad token "${bad}" -> 404`, false, String(r.status));
  }
  check('badge: guessed, malformed and hostile tokens are all 404', true);

  // deletion
  const live = await call('PUT', `/results/${resultA.id}/badge`, a.token, { is_public: true });
  const liveToken = tokenOf(live.body.badge);
  check('badge: live before the account is deleted', (await publicBadge(liveToken)).status === 200);
  await prisma.user.delete({ where: { id: a.id } });
  check('badge: deleting the account removes the public badge immediately', (await publicBadge(liveToken)).status === 404);

  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
