// In a browser: platform staff land in the admin console and nowhere else, and can click through from the lists to
// one individual and one company, and between them.
process.env.W5_TAG = 'admui';
const { prisma, call, check, sleep, makeUser, assessments, finish, cleanup, puppeteer, CHROME, PW } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 120000;
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(0, 400)); throw e; }
};
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });

(async () => {
  const boss = await makeUser('boss', { first: 'Sam', last: 'Staff' });
  await prisma.user.update({ where: { id: boss.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'super_admin' } })).id } });
  const ada = await makeUser('ada', { first: 'Ada', last: 'Okafor' });
  const owner = await makeUser('owner', { first: 'Ngozi', last: 'Eze' });
  const org = await prisma.organization.create({ data: { name: 'Browser Detail Co', slug: 'w5-admui-co', type: 'corporate', admin_name: 'Ngozi Eze', admin_email: owner.email } });
  await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 20 * 86400000), auto_renew: false, seats_used: 1, seats_limit: 10 } });
  const inv = await call('POST', `/organizations/${org.id}/invitations`, owner.token, { emails: [ada.email], department: 'Finance' });
  await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, ada.token);
  const { full } = await assessments(ada.token);
  const start = await call('POST', `/assessments/${full.id}/start`, ada.token, { organization_id: org.id });
  for (let i = 0; i < start.body.submission.questions.length; i += 10) await call('PUT', `/submissions/${start.body.submission.id}/answers`, ada.token, { answers: start.body.submission.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: 4 })) });
  await call('POST', `/submissions/${start.body.submission.id}/complete`, ada.token);
  await prisma.payment.create({ data: { user_id: ada.id, amount: 5000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `w5-grant-admui-${Date.now()}`, payment_type: 'assessment', description: 'Assessment payment', processed_at: new Date() } });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (url, { w = 1366, h = 900 } = {}) => {
    const page = await (await browser.createIncognitoBrowserContext()).newPage();
    await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
    await page.evaluateOnNewDocument((t, rt, u) => { if (!localStorage.getItem('__s')) { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', rt); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('__s', '1'); } },
      boss.token, 'x', { id: boss.id, email: boss.email, first_name: 'Sam', last_name: 'Staff', email_verified: true, platform_role: 'super_admin', organizations: [] });
    await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    return page;
  };

  // ---- staff cannot sit in the user app
  for (const url of ['/dashboard', '/assessments/full', '/account', '/results', '/payments']) {
    const p = await open(url);
    await p.waitForFunction(() => location.pathname.startsWith('/admin'), { timeout: LONG });
    await waitText(p, 'Overview').catch(() => undefined);
    check(`staff opening ${url} end up in the admin console`, new URL(p.url()).pathname.startsWith('/admin'), p.url());
    check(`staff never see the personal navigation on ${url}`, !(await p.$$eval('header a', (as) => as.some((a) => ['My results', 'Payments'].includes(a.textContent.trim()) && !a.getAttribute('href').startsWith('/admin')))));
    await p.close();
  }

  const shell = await open('/admin');
  await waitText(shell, 'Roles & permissions');
  check('the admin menu has no "Back to app" button (staff have no app to go back to)', !/Back to app/.test(await body(shell)) && !(await shell.$('a[href="/dashboard"]')));
  check('the admin menu still has Sign out', /Sign out/.test(await body(shell)));
  await shell.close();

  // ---- from the individuals list to one person
  let p = await open('/admin/individuals');
  await waitText(p, 'Ada Okafor');
  await p.$$eval('table a', (as) => as.find((a) => a.textContent.trim() === 'Ada Okafor').click());
  await p.waitForFunction((id) => location.pathname === `/admin/individuals/${id}`, { timeout: LONG }, ada.id);
  await waitText(p, 'Shareable badge');
  let t = await body(p);
  check('individual: the name links through to a detail page', /Ada Okafor/.test(t) && t.includes(ada.email));
  check('individual: shows account, companies, assessments, payments and badge sections', ['Account', 'Companies', 'Assessments', 'Payments', 'Shareable badge'].every((s) => t.includes(s)));
  check('individual: shows the company, department, finished assessment and the payment', /Browser Detail Co/.test(t) && /Finance/.test(t) && /Completed/.test(t) && /Assessment payment/.test(t) && /NGN|₦/.test(t));
  check('individual: says what support can and cannot see, and shows no scores', /not what it said|not.*what it said/i.test(t) && !/openness|neuroticism|extraversion/i.test(t));
  await p.$$eval('main a', (as) => as.find((a) => a.textContent.trim() === 'Browser Detail Co').click());
  await p.waitForFunction((id) => location.pathname === `/admin/companies/${id}`, { timeout: LONG }, org.id);
  await waitText(p, 'Contact and plan');
  t = await body(p);
  check('individual → company: the company link opens that company', /Browser Detail Co/.test(t) && /Team/.test(t) && /Ngozi Eze/.test(t));
  check('company: shows seats, people with progress, invitations and activity', /seats/i.test(t) && /Ada Okafor/.test(t) && /Completed/i.test(t) && /Invitations/i.test(t) && /Recent activity/i.test(t));
  check('company: shows people without scores', /never with their scores/.test(t) && !/openness|neuroticism|extraversion/i.test(t));
  await p.$$eval('main a', (as) => as.find((a) => a.textContent.trim() === 'Ada Okafor').click());
  await p.waitForFunction((id) => location.pathname === `/admin/individuals/${id}`, { timeout: LONG }, ada.id);
  check('company → individual: a person in the list opens their own page', true);
  await p.$$eval('main a', (as) => as.find((a) => a.textContent.includes('Individuals')).click());
  await p.waitForFunction(() => location.pathname === '/admin/individuals', { timeout: LONG });
  check('the back link returns to the list', true);
  await p.close();

  // ---- from the companies list
  p = await open('/admin/companies');
  await waitText(p, 'Browser Detail Co');
  await p.$$eval('table a', (as) => as.find((a) => a.textContent.trim() === 'Browser Detail Co').click());
  await p.waitForFunction((id) => location.pathname === `/admin/companies/${id}`, { timeout: LONG }, org.id);
  await waitText(p, 'Company assessments');
  check('companies list: the name links through to the company', /Contact and plan/.test(await body(p)));
  await p.close();

  // ---- something that does not exist
  p = await open('/admin/individuals/not-a-real-id');
  await waitText(p, 'couldn’t find that record');
  check('an unknown person shows a clear message and a way back', /Individuals/.test(await body(p)));
  await p.close();
  p = await open('/admin/companies/not-a-real-id');
  await waitText(p, 'couldn’t find that record');
  check('an unknown company shows a clear message and a way back', /Companies/.test(await body(p)));
  await p.close();

  // ---- phone width
  for (const [name, url] of [['individual', `/admin/individuals/${ada.id}`], ['company', `/admin/companies/${org.id}`]]) {
    const m = await open(url, { w: 390, h: 800 });
    await waitText(m, name === 'company' ? 'Contact and plan' : 'Shareable badge');
    await sleep(400);
    check(`phone: the ${name} page does not scroll sideways (tables scroll inside their own box)`, !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await m.close();
  }

  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-admui' } } });
  await prisma.payment.deleteMany({ where: { provider_reference: { startsWith: 'w5-grant-admui' } } });
  void PW; void cleanup;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
