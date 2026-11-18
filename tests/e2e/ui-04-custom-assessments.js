process.env.W5_TAG = 'w7ui';
const path = require('path');
const fs = require('fs');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, check, sleep, makeUser, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const OUT = path.join(require('os').tmpdir(), 'w7-shots');
const DL = path.join(require('os').tmpdir(), 'w7-downloads');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
const LONG = 90000;

const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try {
    await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
  } catch (e) {
    const page = await p.evaluate(() => document.body.innerText);
    console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', page.split(/s+/).join(' ').slice(-900));
    throw e;
  }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const session = (page, u, orgs = []) => page.evaluateOnNewDocument((t, user) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(user)); }, u.token, { id: u.id, email: u.email, first_name: u.first, last_name: u.last, organizations: orgs });

(async () => {
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = { ...(await makeUser('admin', { first: 'Ada', last: 'Boss' })), first: 'Ada', last: 'Boss' };
  const e1 = { ...(await makeUser('e1', { first: 'Eve', last: 'Okafor' })), first: 'Eve', last: 'Okafor' };
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-w7ui-acme', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.organizationMember.create({ data: { user_id: e1.id, organization_id: org.id, role_id: (await role('employee')).id, department: 'Support', consented_at: new Date() } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 1, seats_limit: 10 } });
  const adminOrgs = [{ id: org.id, name: org.name, slug: org.slug, type: 'corporate', role: 'admin' }];
  const empOrgs = [{ id: org.id, name: org.name, slug: org.slug, type: 'corporate', role: 'employee' }];

  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const watch = (p) => { p.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 140)); }); };

  // ---------------------------------------------------------------- administrator writes and publishes one
  const a = await browser.newPage();
  await a.setViewport({ width: 1440, height: 900 });
  watch(a);
  await autoConfirm(a);
  const cdp = await a.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await session(a, admin, adminOrgs);
  await a.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await a.waitForSelector('button[role=tab]', { timeout: LONG });
  await clickText(a, 'button[role=tab]', 'Assessments');
  await waitText(a, 'Create an assessment');
  check('tab: the Assessments tab explains it is the company’s own, not official', /not an official Personnelq one/.test(await body(a)));
  await a.screenshot({ path: path.join(OUT, '1-assessments-tab.png') });
  check('tab: "Start writing" stays off until the name is long enough', await a.$$eval('button', (b) => b.find((x) => x.textContent.trim() === 'Start writing').disabled));
  await a.type('input[placeholder="Customer service fit"]', 'Customer service fit');
  await clickText(a, 'button', 'Start writing');
  await a.waitForFunction(() => /\/company\/assessments\/[a-z0-9]+$/.test(location.pathname), { timeout: LONG });
  await waitText(a, 'Edit assessment');
  const id = new URL(a.url()).pathname.split('/').pop();
  check('editor: opens a blank draft with the guidance about writing statements', /write\s*statements, not questions/i.test((await body(a)).replace(/\s+/g, ' ')) || /statements, not questions/.test(await body(a)));

  await clickText(a, 'button', 'Add a section');
  await a.waitForSelector('section[aria-label="Section 1"]', { timeout: LONG });
  const s1 = 'section[aria-label="Section 1"]';
  await a.type(`${s1} input[placeholder="Empathy"]`, 'Empathy');
  await a.type(`${s1} textarea[aria-label="Statement 1 in section 1"]`, 'I listen before I answer.');
  await clickText(a, `${s1} button`, 'Add a statement');
  await a.type(`${s1} textarea[aria-label="Statement 2 in section 1"]`, 'I get impatient with upset customers.');
  const boxes = await a.$$(`${s1} input[type=checkbox]`);
  await boxes[1].click(); // reverse scored on statement 2
  const interp = await a.$$(`${s1} textarea:not([aria-label])`);
  await interp[0].type('Prefers to keep a distance.'); await interp[1].type('Usually attentive.'); await interp[2].type('Naturally warm and attentive.');
  await clickText(a, 'button', 'Add a section');
  const s2 = 'section[aria-label="Section 2"]';
  await a.waitForSelector(s2, { timeout: LONG });
  await a.type(`${s2} input[placeholder="Empathy"]`, 'Follow-through');
  await a.type(`${s2} textarea[aria-label="Statement 1 in section 2"]`, 'I confirm the problem is solved.');
  await a.screenshot({ path: path.join(OUT, '2-editor.png'), fullPage: true });

  t = await body(a);
  check('editor: shows live counts and unsaved changes', /2 sections, 3 statements/.test(t) && /unsaved changes/.test(t));
  check('editor: nothing is saved yet (the database still has no questions)', (await prisma.assessmentQuestion.count({ where: { assessment_id: id } })) === 0);
  await clickText(a, 'button', 'Save draft');
  await waitText(a, 'Saved at');
  const dbQs = await prisma.assessmentQuestion.findMany({ where: { assessment_id: id }, orderBy: { question_number: 'asc' } });
  check('editor: save stores the three statements in order, with section and reverse flag', dbQs.length === 3 && dbQs[1].ocean_direction === 'reverse' && dbQs[0].section_key === 's1' && dbQs[2].section_key === 's2');

  await a.reload({ waitUntil: 'domcontentloaded' });
  await a.waitForSelector(s1, { timeout: LONG });
  check('editor: reloading brings everything back, including the wording for each band', (await a.$eval(`${s1} input[placeholder="Empathy"]`, (e) => e.value)) === 'Empathy' && (await a.$$eval(`${s1} textarea:not([aria-label])`, (t) => t.map((x) => x.value))).join('|') === 'Prefers to keep a distance.|Usually attentive.|Naturally warm and attentive.');

  // an incomplete publish gives a plain reason: blank out section 2's statement and try
  await a.$eval(`${s2} textarea[aria-label="Statement 1 in section 2"]`, (e) => { e.focus(); });
  await a.click(`${s2} textarea[aria-label="Statement 1 in section 2"]`, { clickCount: 3 });
  await a.keyboard.press('Backspace');
  await clickText(a, 'button', 'Publish');
  await waitText(a, 'needs some text');
  check('publish: an unfinished statement is refused with a plain-words reason, and nothing is published', /Question 1 in “Follow-through” needs some text/.test(await body(a)) && !(await prisma.assessment.findUnique({ where: { id } })).published_at);
  await a.type(`${s2} textarea[aria-label="Statement 1 in section 2"]`, 'I confirm the problem is solved.');
  await clickText(a, 'button', 'Publish');
  await waitText(a, 'This assessment is published');
  t = await body(a);
  check('publish: the page becomes read-only with the new-version, results and archive options', /Create new version/.test(t) && /View results/.test(t) && /Archive/.test(t) && (await a.$$eval('textarea', (t) => t.every((x) => x.disabled))));
  check('publish: stored as published and locked', !!(await prisma.assessment.findUnique({ where: { id } })).published_at && (await prisma.assessment.findUnique({ where: { id } })).is_locked === true);
  await a.screenshot({ path: path.join(OUT, '3-published.png') });

  // ---------------------------------------------------------------- the employee takes it
  const ctx = await browser.createIncognitoBrowserContext();
  const e = await ctx.newPage();
  await e.setViewport({ width: 1440, height: 900 });
  watch(e);
  await session(e, e1, empOrgs);
  await e.goto(`${WEB}/dashboard`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(e, 'From Acme Test Co');
  t = await body(e);
  check('dashboard: the employee sees "From Acme Test Co" with the assessment and a Begin button', /Customer service fit/.test(t) && /3 statements/.test(t) && /company can see the results/.test(t));
  await e.screenshot({ path: path.join(OUT, '4-employee-dashboard.png'), fullPage: true });
  await e.$eval('main a[href^="/company-assessments/"]', (el) => el.click());
  await e.waitForFunction(() => location.pathname.startsWith('/company-assessments/'), { timeout: LONG });
  await waitText(e, 'Company assessment');
  t = await body(e);
  check('intro: says it was written by the company, that HR can see the results, and what to do', /written by\s*Acme Test Co,\s*not by Personnelq/.test(t.replace(/\s+/g, ' ')) && /administrators and HR can see your results/.test(t));
  await e.screenshot({ path: path.join(OUT, '5-intro.png') });
  await clickText(e, 'button', 'Begin');
  await e.waitForSelector('[role=radiogroup]', { timeout: LONG });
  const groups = await e.$$('[role=radiogroup]');
  check('runner: shows the three statements with the five standard answers', groups.length === 3 && (await groups[0].$$('input')).length === 5);
  // answers: 5, 1 (reverse -> 5), 3
  for (const [i, v] of [5, 1, 3].entries()) await groups[i].$eval(`input[value="${v}"]`, (el) => el.closest('label').click());
  await clickText(e, 'button', 'Finish and see results');
  await e.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: LONG });
  await waitText(e, 'Company assessment');
  t = await body(e);
  check('result: shows overall 75 and the two sections with the administrator’s wording', /75/.test(t) && /Empathy/.test(t) && /Follow-through/.test(t) && /Naturally warm and attentive/.test(t) && /Moderate/.test(t));
  check('result: tells the person the company can see it, and carries no radar or insights panels', /administrators and HR can see it/.test(t) && !/Write my insights|Share your badge|Download PDF/.test(t));
  await e.screenshot({ path: path.join(OUT, '6-custom-result.png'), fullPage: true });
  await e.goto(`${WEB}/results`, { waitUntil: 'domcontentloaded' });
  await waitText(e, 'Customer service fit');
  check('my results: lists it as a company assessment with an overall score, not trait bars', /Acme Test Co/.test(await body(e)) && /Overall\s*75/.test(await body(e)));
  await e.goto(`${WEB}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitText(e, 'From Acme Test Co');
  check('dashboard: after finishing, it offers the result instead of Begin; the personality profile is unaffected', /View results/.test(await body(e)) && /appear here after your first assessment/.test(await body(e)));

  // ---------------------------------------------------------------- administrator reads the results
  await a.goto(`${WEB}/company/assessments/${id}/results`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(a, 'By section');
  t = await body(a);
  check('results: 1 of 1 finished, average 75, per-section bars, and the person in the table with their scores', /1 of 1/.test(t) && /75/.test(t) && /Eve Okafor/.test(t) && /Empathy/.test(t) && /100/.test(t) && /50/.test(t));
  await a.screenshot({ path: path.join(OUT, '7-results.png'), fullPage: true });
  await clickText(a, 'button', 'Download CSV');
  let csvFile = null;
  for (let i = 0; i < 40 && !csvFile; i++) { await sleep(400); csvFile = fs.readdirSync(DL).find((f) => f.endsWith('.csv')); }
  check('results: the CSV downloads with a readable name and the person’s scores', /^customer-service-fit-results-\d{4}-\d{2}-\d{2}\.csv$/.test(csvFile || '') && fs.readFileSync(path.join(DL, csvFile), 'utf8').includes('Eve Okafor'), csvFile);

  // the personality team dashboard must not count the custom assessment
  await a.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded' });
  await waitText(a, 'Personality distribution');
  check('isolation: the personality overview still shows 0 finished', /Finished\s*\n?\s*0%/.test(await body(a)));

  // list, new version, archive
  await clickText(a, 'button[role=tab]', 'Assessments');
  await waitText(a, 'Your assessments');
  await waitText(a, 'finished');
  check('tab: the list shows it published with 1 of 1 finished', /Published/.test(await body(a)) && /1 of 1 finished/.test(await body(a)));
  await a.goto(`${WEB}/company/assessments/${id}`, { waitUntil: 'domcontentloaded' });
  await waitText(a, 'Create new version');
  await clickText(a, 'button', 'Create new version');
  await a.waitForFunction((old) => /\/company\/assessments\/[a-z0-9]+$/.test(location.pathname) && !location.pathname.endsWith(old), { timeout: LONG }, id);
  await waitText(a, 'Edit assessment');
  t = await body(a);
  check('new version: opens an editable draft, version 2.0.0, with the content copied', /Version 2\.0\.0/.test(t) && (await a.$$('section[aria-label^="Section"]')).length === 2);
  await a.screenshot({ path: path.join(OUT, '8-new-version.png') });

  // ---------------------------------------------------------------- phone widths
  for (const [label, who, orgs, url] of [['editor', admin, adminOrgs, `/company/assessments/${id}`], ['results', admin, adminOrgs, `/company/assessments/${id}/results`], ['employee dashboard', e1, empOrgs, '/dashboard'], ['custom result', e1, empOrgs, null]]) {
    const m = await browser.newPage();
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await session(m, who, orgs);
    let target = url;
    if (!target) { const r = (await call('GET', '/results', e1.token)).body.data[0]; target = `/results/${r.id}`; }
    await m.goto(WEB + target, { waitUntil: 'domcontentloaded', timeout: LONG });
    await sleep(3000);
    check(`phone: ${label} has no sideways page scroll`, !(await overflow(m)));
    if (label === 'editor') await m.screenshot({ path: path.join(OUT, '9-phone-editor.png') });
    await m.close();
  }

  check('no page errors or console errors during the whole run', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  console.log('screenshots in', OUT);
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });

var t;
