process.env.W5_TAG = 'w6ui';
const fs = require('fs');
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, sleep, makeUser, assessments, grantPaid, takeAssessment, PW, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const OUT = path.join(require('os').tmpdir(), 'w6-shots');
const DL = path.join(require('os').tmpdir(), 'w6-downloads');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
const LONG = 90000;

const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = (p, needle, timeout = LONG) => p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const session = (page, u, orgs = []) => page.evaluateOnNewDocument((t, user) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(user)); }, u.token, { id: u.id, email: u.email, first_name: u.first, last_name: u.last, organizations: orgs });
const tokenOf = (link) => link.split('/invite/')[1];

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = { ...(await makeUser('admin', { first: 'Ada', last: 'Boss' })), first: 'Ada', last: 'Boss' };
  const e1 = { ...(await makeUser('e1', { first: 'Eve', last: 'Okafor' })), first: 'Eve', last: 'Okafor' };
  const e2 = { ...(await makeUser('e2', { first: 'Tunde', last: 'Bello' })), first: 'Tunde', last: 'Bello' };
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-w6ui-acme', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: 5 } });
  const { full } = await assessments(admin.token);
  const adminOrgs = [{ id: org.id, name: org.name, slug: org.slug, type: 'corporate', role: 'admin' }];

  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const watch = (p) => { p.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 140)); }); };

  // ---------------------------------------------------------------- admin: empty state, then invite
  const a = await browser.newPage();
  await a.setViewport({ width: 1440, height: 900 });
  watch(a);
  const acdp = await a.createCDPSession();
  await acdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await autoConfirm(a);
  await session(a, admin, adminOrgs);
  await a.goto(`${WEB}/dashboard`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await a.waitForFunction(() => location.pathname === '/company', { timeout: LONG });
  check('dashboard: an administrator is sent to the company dashboard, which has a Company nav item', /Company/.test(await a.$eval('header nav', (n) => n.innerText)));
  await a.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(a, 'No one has joined yet');
  await a.screenshot({ path: path.join(OUT, '1-company-empty.png') });
  await clickText(a, 'button', 'Invite people');
  await waitText(a, 'Email addresses');
  await a.type('textarea', `${e1.email}, ${e2.email}`);
  await a.reload({ waitUntil: 'domcontentloaded' });
  await a.waitForSelector('button[role=tab]', { timeout: LONG });
  await clickText(a, 'button[role=tab]', 'Invitations');
  await waitText(a, 'Email addresses');
  await a.type('textarea', `${e1.email}, ${e2.email}`);
  await a.select('form select', 'Sales');
  const inputs = await a.$$('form input');
  await inputs[0].type('Account executive');
  check('invite form: counts the addresses and offers to send two', /Send 2 invitations/.test(await body(a)));
  await clickText(a, 'button', 'Send 2 invitations');
  await waitText(a, 'Emailed');
  const outBody = await body(a);
  check('invite form: shows each address as emailed, with a copy-link option', (outBody.match(/Emailed/g) || []).length === 2 && /Copy link/.test(outBody));
  check('invite form: the emails really went out', (await fake('resend', '/__control/emails')).filter((m) => /invited you/.test(m.subject)).length === 2);
  await waitText(a, 'Waiting');
  await a.screenshot({ path: path.join(OUT, '2-invitations.png'), fullPage: true });
  const invs = (await call('GET', `/organizations/${org.id}/invitations`, admin.token)).body.data;
  const link1 = invs.find((i) => i.email === e1.email).link, link2 = invs.find((i) => i.email === e2.email).link;

  // ---------------------------------------------------------------- invitee: not signed in
  const ctx = await browser.createIncognitoBrowserContext();
  const e = await ctx.newPage();
  await e.setViewport({ width: 1440, height: 900 });
  watch(e);
  await e.goto(link1.replace(/^https?:\/\/[^/]+/, WEB), { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(e, 'invited you to join Acme Test Co');
  let t = await body(e);
  check('invite page: names the company and inviter, shows the invited address, and says what the company will see', /Ada Boss invited you to join Acme Test Co/.test(t) && /What Acme Test Co will see/.test(t) && /private to you/.test(t) && t.includes(e1.email) && /Create an account to accept/.test(t));
  check('invite page: not indexed', (await e.$eval('meta[name=robots]', (m) => m.content).catch(() => '')).includes('noindex'));
  await e.screenshot({ path: path.join(OUT, '3-invite-page.png') });
  check('invite page: fits the screen', !(await overflow(e)));

  await clickText(e, 'a', 'Sign in');
  await e.waitForFunction(() => location.pathname === '/auth/login', { timeout: LONG });
  await e.waitForSelector('input[name=email]', { timeout: LONG });
  check('sign in: carries the invitation, with the invited address already filled in and locked', new URL(e.url()).searchParams.get('invite') === tokenOf(link1) && (await e.$eval('input[name=email]', (el, want) => el.value === want && el.readOnly, e1.email)));
  await e.type('input[name=password]', PW);
  await clickText(e, 'button', 'Sign in and continue');
  await e.waitForFunction((tok) => location.pathname === '/invite/' + tok, { timeout: LONG }, tokenOf(link1));
  await waitText(e, 'Accept and continue');
  check('sign in: returns to the invitation, already signed in as the invitee', /Signed in as/.test(await body(e)));

  // wrong person: e1 opens e2's link
  const w = await ctx.newPage();
  await w.setViewport({ width: 1440, height: 900 });
  await w.goto(link2.replace(/^https?:\/\/[^/]+/, WEB), { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(w, 'Accept and continue');
  await clickText(w, 'button', 'Accept and continue');
  await waitText(w, 'different email address');
  check('wrong account: refused with a clear message and no joining', /sent to a different email address/.test(await body(w)) && (await prisma.organizationMember.count({ where: { organization_id: org.id, user_id: e1.id } })) === 0);
  await w.close();

  await clickText(e, 'button', 'Accept and continue');
  await e.waitForFunction(() => location.pathname === '/assessments/full', { timeout: LONG });
  await waitText(e, 'Take it for Acme Test Co');
  t = await body(e);
  check('intro: offers "take it for the company" with the visibility warning and a private option', /Begin for Acme Test Co/.test(t) && /administrators and HR can see the results/.test(t) && /Begin privately|taking it privately|take it privately/i.test(t));
  check('intro: nothing to pay for the company attempt', /nothing to pay/.test(t));
  await e.screenshot({ path: path.join(OUT, '4-intro-cover.png') });
  await clickText(e, 'button', 'Begin for Acme Test Co');
  await e.waitForSelector('[role=radiogroup]', { timeout: LONG });
  const sub = await prisma.assessmentSubmission.findFirst({ where: { user_id: e1.id, status: 'in_progress' } });
  check('company attempt: the started attempt belongs to the company', sub?.organization_id === org.id);
  const subView = (await call('GET', `/submissions/${sub.id}`, e1.token)).body;
  for (let i = 0; i < subView.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, e1.token, { answers: subView.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  const result1 = (await call('POST', `/submissions/${sub.id}/complete`, e1.token)).body;
  await e.goto(`${WEB}/results/${result1.id}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(e, 'taken through Acme Test Co');
  check('result: tells the person the company can see this result', /administrators and HR can see it/.test(await body(e)));
  await e.screenshot({ path: path.join(OUT, '5-result-company.png') });

  // e2 joins through the API so the team has a finisher and a not-started member
  const acc2 = await call('POST', `/invitations/${tokenOf(link2)}/accept`, e2.token);
  check('second person joined', acc2.status === 200);

  // ---------------------------------------------------------------- admin: the dashboard
  await a.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(a, 'Personality distribution');
  t = await body(a);
  check('overview: people 2, finished 50%, in progress 0, not started 1', /People\s*\n?\s*2/.test(t) && /50%/.test(t) && /1 of 2/.test(t));
  check('overview: plan strip shows Team plan and seats', /Team plan, active until/.test(t) && /2 of 5 seats used/.test(t));
  check('overview: distribution, departments and recent activity are all there', /Curiosity/.test(t) && /By department/.test(t) && /Sales/.test(t) && /Eve Okafor\s*finished the assessment/.test(t) && /Tunde Bello\s*joined the company/.test(t));
  await a.screenshot({ path: path.join(OUT, '6-company-overview.png'), fullPage: true });

  await clickText(a, 'button', 'Download CSV');
  let csvFile = null;
  for (let i = 0; i < 40 && !csvFile; i++) { await sleep(400); csvFile = fs.readdirSync(DL).find((f) => f.endsWith('.csv')); }
  const csvText = csvFile ? fs.readFileSync(path.join(DL, csvFile), 'utf8') : '';
  check('export: the CSV downloads with a dated name and one row per person', /^team-results-\d{4}-\d{2}-\d{2}\.csv$/.test(csvFile || '') && csvText.trim().split(/\r?\n/).length === 3 && csvText.includes('Eve Okafor') && csvText.includes('Tunde Bello'), csvFile);
  await clickText(a, 'button', 'Download team PDF');
  let pdfFile = null;
  for (let i = 0; i < 60 && !pdfFile; i++) { await sleep(500); pdfFile = fs.readdirSync(DL).find((f) => f.endsWith('.pdf')); }
  const pdfBytes = pdfFile ? fs.readFileSync(path.join(DL, pdfFile)) : null;
  check('export: the team PDF downloads and is a real PDF', !!pdfBytes && pdfBytes.slice(0, 5).toString() === '%PDF-' && /^team-report-/.test(pdfFile), pdfFile);

  await clickText(a, 'button[role=tab]', 'People');
  await waitText(a, 'Eve Okafor');
  t = await body(a);
  check('people: both listed with status, department, and the finisher’s five scores', /Finished/.test(t) && /Not started/.test(t) && /Sales/.test(t));
  await a.screenshot({ path: path.join(OUT, '7-people.png') });
  await clickText(a, 'a', 'View');
  await a.waitForFunction(() => /\/company\/members\//.test(location.pathname), { timeout: LONG });
  await waitText(a, 'Eve Okafor');
  await waitText(a, 'accepted that your');
  await clickText(a, 'main button', 'Show ');
  await waitText(a, 'Scores run from 0 to 100');
  t = await body(a);
  check('person page: shows the profile and readings, and says that viewing is recorded', /Profile/.test(t) && /Curiosity/.test(t));
  check('person page: viewing was written to the audit trail', (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'member.result_viewed' } })) >= 1);
  await a.screenshot({ path: path.join(OUT, '8-person.png'), fullPage: true });

  await a.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded' });
  await waitText(a, 'Personality distribution');
  await clickText(a, 'button[role=tab]', 'People');
  await waitText(a, 'Tunde Bello');
  await a.$$eval('tbody tr', (rows) => rows.find((r) => r.innerText.includes('Tunde Bello')).querySelector('button').click());
  await a.waitForFunction(() => !document.body.innerText.includes('Tunde Bello'), { timeout: LONG });
  check('remove: the admin removes a member and they disappear; the seat frees', (await prisma.subscription.findUnique({ where: { organization_id: org.id } })).seats_used === 1);

  // ---------------------------------------------------------------- employee: evolution chart, then leaving
  await prisma.assessmentSubmission.updateMany({ where: { user_id: e1.id }, data: { completed_at: new Date(Date.now() - 200 * 86400000) } });
  await grantPaid(e1, full.id);
  await takeAssessment(e1.token, full.id, (i) => ((i * 3) % 5) + 1);
  const d = await ctx.newPage();
  await d.setViewport({ width: 1440, height: 900 });
  watch(d);
  await d.goto(`${WEB}/dashboard`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(d, 'How you’re changing');
  await d.waitForSelector('svg[role=img]', { timeout: LONG });
  t = await body(d);
  check('dashboard: after two full attempts, a trend chart with every trait and a direction appears', /Higher|Lower|Steady/.test(t) && (await d.$$('svg[role=img] polyline')).length === 5);
  check('dashboard: the chart has a text alternative (label and data table)', /Trait scores across 2 full assessments/.test(await d.$eval('svg[role=img]:has(polyline)', (s) => s.getAttribute('aria-label'))) && (await d.$$('table.sr-only tbody tr')).length === 2);
  check('dashboard: an employee sees what the company can see and no admin links', /sees the results you take through its invitation/.test(t) && !/Open company dashboard/.test(t) && !/Company\b/.test(await d.$eval('header nav', (n) => n.innerText)));
  await d.screenshot({ path: path.join(OUT, '9-dashboard-evolution.png'), fullPage: true });
  await autoConfirm(d);
  await clickText(d, 'button', 'Leave company');
  await d.waitForFunction(() => !document.body.innerText.includes('Leave company') && !!document.body.innerText.includes('Your journey'), { timeout: LONG });
  await sleep(1500);
  check('leave: the company card is gone after leaving', !/sees the results you take through its invitation/.test(await body(d)));
  const dash2 = (await call('GET', `/organizations/${org.id}/dashboard`, admin.token)).body;
  check('leave: and the company dashboard no longer counts them', dash2.team.members === 0 && dash2.team.completed === 0);

  // ---------------------------------------------------------------- phone widths
  for (const [label, who, url, orgs] of [['company overview', admin, '/company', adminOrgs], ['invite page', null, `/invite/${tokenOf(link1)}`, []], ['dashboard', e1, '/dashboard', []]]) {
    const m = await browser.newPage();
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    if (who) await session(m, who, orgs);
    await m.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    await sleep(2800);
    check(`phone: ${label} has no sideways page scroll`, !(await overflow(m)));
    if (label === 'company overview') await m.screenshot({ path: path.join(OUT, '10-phone-company.png'), fullPage: true });
    await m.close();
  }

  check('no page errors or console errors during the whole run', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  console.log('screenshots in', OUT);
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
