process.env.W5_TAG = 'w6rem';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, makeUser, assessments, takeAssessment, grantPaid, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 90000;
const emails = () => fake('resend', '/__control/emails');

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = { ...(await makeUser('head', { first: 'Ngozi', last: 'Head' })), first: 'Ngozi', last: 'Head' };
  const done = await makeUser('done', { first: 'Dayo', last: 'Done' });
  const idle = await makeUser('idle', { first: 'Ife', last: 'Idle' });
  const busy = await makeUser('busy', { first: 'Bayo', last: 'Busy' });
  const org = await prisma.organization.create({ data: { name: 'Westfield Secondary', slug: 'w5-w6rem-school', type: 'school', admin_name: 'Ngozi Head', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  for (const [u, dept] of [[done, 'Year 9'], [idle, 'Year 9'], [busy, 'Year 10']]) {
    await prisma.organizationMember.create({ data: { user_id: u.id, organization_id: org.id, role_id: (await role('employee')).id, department: dept, consented_at: new Date() } });
  }
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 3, seats_limit: 10 } });
  const { full } = await assessments(admin.token);

  // Dayo finishes for the school; Bayo starts and stops halfway
  const s1 = (await call('POST', `/assessments/${full.id}/start`, done.token, { organization_id: org.id })).body.submission;
  for (let i = 0; i < s1.questions.length; i += 10) await call('PUT', `/submissions/${s1.id}/answers`, done.token, { answers: s1.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  await call('POST', `/submissions/${s1.id}/complete`, done.token);
  const s2 = (await call('POST', `/assessments/${full.id}/start`, busy.token, { organization_id: org.id })).body.submission;
  await call('PUT', `/submissions/${s2.id}/answers`, busy.token, { answers: s2.questions.slice(0, 10).map((q) => ({ question_id: q.id, value: 3 })) });

  // ---------------------------------------------------------------- API
  check('reminders: an employee cannot send them (403)', (await call('POST', `/organizations/${org.id}/reminders`, idle.token)).status === 403);
  check('reminders: no login (401)', (await call('POST', `/organizations/${org.id}/reminders`)).status === 401);
  const r1 = await call('POST', `/organizations/${org.id}/reminders`, admin.token);
  const mails = (await emails()).filter((m) => /reminder/i.test(m.subject));
  check('reminders: sent to the two who have not finished, not the finisher', r1.status === 200 && r1.body.sent === 2 && r1.body.waiting === 2 && mails.length === 2 && mails.some((m) => m.to === idle.email) && mails.some((m) => m.to === busy.email) && !mails.some((m) => m.to === done.email), r1.text);
  check('reminders: the email names the school and the sender, links to the assessment and repeats the visibility note', mails.every((m) => /Westfield Secondary/.test(m.html) && /Ngozi Head/.test(m.html) && m.html.includes('/assessments/full') && /visible to its administrators and HR/.test(m.html)));
  const r2 = await call('POST', `/organizations/${org.id}/reminders`, admin.token);
  check('reminders: asking again straight away sends nothing (3-day limit)', r2.body.sent === 0 && r2.body.skipped_recent === 2 && (await emails()).filter((m) => /reminder/i.test(m.subject)).length === 2, r2.text);
  await prisma.auditLog.updateMany({ where: { organization_id: org.id, user_id: idle.id, action: 'member.reminded' }, data: { created_at: new Date(Date.now() - 4 * 86400000) } });
  const r3 = await call('POST', `/organizations/${org.id}/reminders`, admin.token);
  check('reminders: after 4 days one person is reminded again, the other is still skipped', r3.body.sent === 1 && r3.body.skipped_recent === 1, r3.text);
  check('reminders: each one is in the audit trail', (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'member.reminded' } })) === 3);

  // ---------------------------------------------------------------- the school wording in the browser
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(m.text().slice(0, 120)); });
  await autoConfirm(page);
  const u = { id: admin.id, email: admin.email, first_name: 'Ngozi', last_name: 'Head', organizations: [{ id: org.id, name: org.name, slug: org.slug, type: 'school', role: 'admin' }] };
  await page.evaluateOnNewDocument((t, user) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(user)); }, admin.token, u);
  await page.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await page.waitForFunction(() => document.body.innerText.includes('Personality distribution'), { timeout: LONG });
  let t = await page.evaluate(() => document.body.innerText);
  check('school wording: "School dashboard", "Students and staff", "By class or team"', /School dashboard/.test(t) && /Students and staff/.test(t) && /By class or team/.test(t) && /Class or team/.test(t) && !/Company dashboard|By department/.test(t));
  check('school wording: the nav item says School', /School/.test(await page.$eval('header nav', (n) => n.innerText)));
  check('school wording: classes are grouped (Year 9 has 2, Year 10 has 1)', /Year 9/.test(t) && /Year 10/.test(t));
  check('reminder button: offers to remind the 2 who have not finished', /Remind 2 people by email/.test(t));
  await page.$$eval('button', (b) => b.find((x) => x.textContent.trim().startsWith('Remind 2')).click());
  await page.waitForFunction(() => /Reminder sent|Everyone waiting|skipped/.test(document.body.innerText), { timeout: LONG });
  t = await page.evaluate(() => document.body.innerText);
  check('reminder button: tells the administrator what happened (one new, one skipped)', /Reminder sent to 1 person/.test(t) && /1 skipped because they were reminded recently/.test(t) || /Everyone waiting was reminded/.test(t), t.match(/Reminder sent[^\n]*|Everyone waiting[^\n]*/)?.[0]);
  await page.$$eval('button[role=tab]', (b) => b.find((x) => x.textContent.trim().startsWith('Invitations')).click());
  await page.waitForFunction(() => document.body.innerText.includes('Email addresses'), { timeout: LONG });
  t = await page.evaluate(() => document.body.innerText);
  check('school wording on the invite form: "Class or team (optional)" and "your school will see"', /Class or team \(optional\)/.test(t) && /your school will see/.test(t));
  check('no page errors or console errors', problems.length === 0, problems.slice(0, 2).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
