// In a browser: platform staff suspend and restore a person and a company and refund a payment; company administrators
// open one member in full, pause and restore people, and edit the company's details.
process.env.W5_TAG = 'ui12';
const lib = require('./lib');
const { prisma, fake, check, sleep, makeUser, assessments, finish, cleanup, puppeteer, CHROME } = lib;

const WEB = 'http://localhost:3100';
const LONG = 120000;
const fresh = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` });
const call = (method, path, token, body, headers = {}) => lib.call(method, path, token, body, { ...fresh(), ...headers });
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(0, 450)); throw e; }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
const staffRole = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'platform', key } });

/** Types a reason into the open dialog and presses its main button. */
async function answerReason(p, text, expectDisabledFirst = true) {
  await p.waitForSelector('dialog[open] textarea', { timeout: LONG });
  if (expectDisabledFirst) check('the dialog will not accept an empty reason: the button is disabled', await p.$eval('dialog[open] [data-confirm=accept]', (b) => b.disabled));
  await p.type('dialog[open] textarea', text);
  await p.waitForFunction(() => !document.querySelector('dialog[open] [data-confirm=accept]')?.disabled, { timeout: 5000 });
  await p.click('dialog[open] [data-confirm=accept]');
}
async function settle(path, token, bodyJson) {
  const co = await call('POST', path, token, bodyJson);
  await fake('paystack', '/__control/set', 'POST', { reference: co.body.reference, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
  await call('GET', `/payments/verify?reference=${co.body.reference}`, token);
  return prisma.payment.findUniqueOrThrow({ where: { provider_reference: co.body.reference } });
}

(async () => {
  await fake('paystack', '/__control/reset', 'POST');
  const boss = await makeUser('boss', { first: 'Sam', last: 'Staff' });
  const reader = await makeUser('reader', { first: 'Rae', last: 'Reader' });
  await prisma.user.update({ where: { id: boss.id }, data: { platform_role_id: (await staffRole('super_admin')).id } });
  await prisma.user.update({ where: { id: reader.id }, data: { platform_role_id: (await staffRole('support')).id } });
  const owner = await makeUser('owner', { first: 'Ngozi', last: 'Eze' });
  const hr = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const emp = await makeUser('emp', { first: 'Eli', last: 'Employee' });
  const target = await makeUser('target', { first: 'Tara', last: 'Target' });
  const org = await prisma.organization.create({ data: { name: 'Click Co', slug: 'w5-ui12-co', type: 'corporate', admin_name: 'Ngozi Eze', admin_email: owner.email } });
  await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 25 * 86400000), auto_renew: false, seats_limit: 10 } });
  const O = `/organizations/${org.id}`;
  for (const [u, r] of [[hr, 'hr'], [emp, undefined]]) {
    const inv = await call('POST', `${O}/invitations`, owner.token, { emails: [u.email], ...(r && { role: r }) });
    await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, u.token);
  }
  const { full } = await assessments(emp.token);
  const start = await call('POST', `/assessments/${full.id}/start`, emp.token, { organization_id: org.id });
  for (let i = 0; i < start.body.submission.questions.length; i += 10) await call('PUT', `/submissions/${start.body.submission.id}/answers`, emp.token, { answers: start.body.submission.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value: 4 })) });
  await call('POST', `/submissions/${start.body.submission.id}/complete`, emp.token);
  const payment = await settle('/payments/checkout', target.token, { assessment_id: full.id });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (user, session, url, { w = 1366, h = 900 } = {}) => {
    const page = await (await browser.createIncognitoBrowserContext()).newPage();
    await page.setViewport({ width: w, height: h });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
    await page.evaluateOnNewDocument((t, u) => { if (!localStorage.getItem('__s')) { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('__s', '1'); } },
      user.token, { id: user.id, email: user.email, first_name: user.first ?? 'Test', last_name: user.last ?? 'User', email_verified: true, ...session });
    await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    return page;
  };
  const staff = (u, first, last, roleKey) => ({ ...u, first, last, _s: { platform_role: roleKey, organizations: [] } });
  const bossS = { platform_role: 'super_admin', organizations: [] };
  const readerS = { platform_role: 'support', organizations: [] };
  const orgs = (r) => ({ organizations: [{ id: org.id, name: 'Click Co', slug: org.slug, type: 'corporate', role: r }] });
  void staff;

  // ================================================================== staff: a person
  console.log('\n--- staff: a person');
  let p = await open({ ...boss, first: 'Sam', last: 'Staff' }, bossS, `/admin/individuals/${target.id}`);
  await waitText(p, 'Actions');
  let t = await body(p);
  check('a person’s page offers the actions to full staff', /Send password reset email/.test(t) && /Suspend account/.test(t) && !/Restore account/.test(t));
  await clickText(p, 'button', 'Suspend account');
  await answerReason(p, 'Repeated abuse reports');
  await waitText(p, 'Account suspended.');
  await waitText(p, 'This account is suspended');
  t = await body(p);
  check('suspending needs a reason, then says so and shows the reason', /This account is suspended: Repeated abuse reports/.test(t) && /Restore account/.test(t) && !/Suspend account\b/.test(t.replace(/Account suspended\./, '')));
  check('the database agrees, and the record shows who and why', !!(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspended_at && /User suspended/.test(t) && /Sam Staff/.test(t) && /Repeated abuse reports/.test(t));
  check('the person can no longer sign in (403 ACCOUNT_SUSPENDED)', (await call('POST', '/auth/login', null, { email: target.email, password: lib.PW })).body?.code === 'ACCOUNT_SUSPENDED');
  await clickText(p, 'button', 'Restore account');
  await p.waitForSelector('dialog[open] [data-confirm=accept]', { timeout: LONG });
  await p.click('dialog[open] [data-confirm=accept]');
  await waitText(p, 'Account restored.');
  check('restoring asks first, then the account works again', (await call('POST', '/auth/login', null, { email: target.email, password: lib.PW })).status === 200 && !(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspended_at);
  await p.close();

  // ================================================================== staff: a refund
  console.log('\n--- staff: a refund');
  p = await open({ ...boss, first: 'Sam', last: 'Staff' }, bossS, `/admin/individuals/${target.id}`);
  await p.waitForFunction(() => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Refund'), { timeout: LONG });
  await clickText(p, 'main button', 'Refund');
  await answerReason(p, 'Charged twice by mistake');
  await waitText(p, 'Refund requested.');
  await waitText(p, 'Refunded');
  check('refunding asks for a reason, then the payment shows as refunded', (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status === 'refunded' && !(await p.$$eval('main button', (b) => b.some((x) => x.textContent.trim() === 'Refund'))));
  await p.close();

  // ================================================================== staff: a company
  console.log('\n--- staff: a company');
  p = await open({ ...boss, first: 'Sam', last: 'Staff' }, bossS, `/admin/companies/${org.id}`);
  await waitText(p, 'Actions');
  await clickText(p, 'button', 'Suspend company');
  await answerReason(p, 'Unpaid invoice, chargeback');
  await waitText(p, 'Company suspended.');
  await waitText(p, 'This company is suspended');
  check('suspending a company needs a reason, and the page shows it', /This company is suspended: Unpaid invoice, chargeback/.test(await body(p)) && (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status === 'suspended');
  await p.close();
  const own = await open(owner, orgs('admin'), '/company');
  await waitText(own, 'is suspended');
  t = await body(own);
  check('its administrators see the suspension and the reason on their dashboard', /This company is suspended: Unpaid invoice, chargeback/.test(t));
  await own.close();
  p = await open({ ...boss, first: 'Sam', last: 'Staff' }, bossS, `/admin/companies/${org.id}`);
  await waitText(p, 'Restore company');
  await clickText(p, 'button', 'Restore company');
  await p.waitForSelector('dialog[open] [data-confirm=accept]', { timeout: LONG });
  await p.click('dialog[open] [data-confirm=accept]');
  await waitText(p, 'Company restored.');
  check('restoring the company asks first and works', (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status === 'active');
  await p.close();

  // ================================================================== staff: read-only support sees no actions
  p = await open({ ...reader, first: 'Rae', last: 'Reader' }, readerS, `/admin/individuals/${target.id}`);
  await waitText(p, 'What staff have done');
  t = await body(p);
  check('read-only support sees the page and the record, but no actions and no refund button', !/Suspend account|Send password reset|Unlock/.test(t) && !(await p.$$eval('main button', (b) => b.some((x) => /Refund|Suspend/.test(x.textContent)))));
  await p.close();

  // ================================================================== company administrators
  console.log('\n--- company administrators');
  p = await open({ ...owner, first: 'Ngozi', last: 'Eze' }, orgs('admin'), '/dashboard');
  await p.waitForFunction(() => location.pathname === '/company', { timeout: LONG });
  await waitText(p, 'Company dashboard');
  const nav = await p.$$eval('header nav a', (as) => as.map((a) => a.textContent.trim()));
  check('opening the personal dashboard sends a company administrator to their company', new URL(p.url()).pathname === '/company');
  check('their menu has the company and payments, and none of the personal pages', nav.includes('Company') && nav.includes('Payments') && !nav.includes('My results') && !nav.includes('Dashboard'), nav.join(', '));
  for (const url of ['/results', '/assessments/full']) {
    await p.goto(WEB + url, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => location.pathname === '/company', { timeout: LONG });
  }
  check('so do the results and assessment pages', true);

  await p.goto(WEB + '/company?tab=people', { waitUntil: 'domcontentloaded' });
  await waitText(p, 'Eli Employee');
  await p.$$eval('table a', (as) => as.find((a) => a.textContent.trim() === 'Eli Employee').click());
  await p.waitForFunction((id) => location.pathname === `/company/members/${id}`, { timeout: LONG }, emp.id);
  await waitText(p, 'Assessments taken through the company');
  t = await body(p);
  check('a name in the people list opens that person in full', /Eli Employee/.test(t) && /About/.test(t) && /Retakes/.test(t) && /Shares results with the company/i.test(t) && /Yes, they agreed/.test(t), t.split(/s+/).join(' ').slice(0, 500));
  check('the page shows the assessment they finished, and no scores yet', /Finished/.test(t) && !/openness|extraversion/i.test(t) && /Show Eli’s result/.test(t));
  await clickText(p, 'main button', 'Show Eli');
  await waitText(p, 'Scores run from 0 to 100');
  check('the result is a separate step: it appears only after asking', /Profile/.test(await body(p)) && (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'member.result_viewed' } })) === 1);

  await clickText(p, 'main button', 'Pause access');
  await p.waitForSelector('dialog[open] textarea', { timeout: LONG });
  check('pausing asks for an optional note, and the button is not blocked without one', !(await p.$eval('dialog[open] [data-confirm=accept]', (b) => b.disabled)));
  await p.type('dialog[open] textarea', 'On leave until January');
  await p.click('dialog[open] [data-confirm=accept]');
  await waitText(p, 'access is paused');
  await waitText(p, 'Restore access');
  t = await body(p);
  check('the page says access is paused with the note, hides the result and offers to restore', /Access paused/.test(t) && /On leave until January/.test(t) && !/Show Eli/.test(t) && /Restore access/.test(t));
  check('the database agrees', (await prisma.organizationMember.findFirstOrThrow({ where: { user_id: emp.id, organization_id: org.id } })).status === 'suspended');

  await p.goto(WEB + '/company?tab=people', { waitUntil: 'domcontentloaded' });
  await waitText(p, 'Access paused');
  t = await body(p);
  check('the people tab lists them under "Access paused", not in the team table', /Access paused/.test(t) && /On leave until January/.test(t) && !(await p.$$eval('tbody a', (as) => as.some((a) => a.textContent.trim() === 'Eli Employee'))));
  await clickText(p, 'section button', 'Restore access');
  await waitText(p, 'is back in the team');
  await p.waitForFunction(() => !document.body.innerText.includes('Access paused'), { timeout: LONG });
  check('restoring puts them back in the team', (await prisma.organizationMember.findFirstOrThrow({ where: { user_id: emp.id, organization_id: org.id } })).status === 'active' && !/Access paused/.test(await body(p)));

  // ---- the company tab
  await clickText(p, 'button[role=tab]', 'Company');
  await waitText(p, 'Administrators and HR');
  t = await body(p);
  check('the Company tab shows the details, plan and who the leaders are', /Click Co/.test(t) && /Team/.test(t) && /Hana Resources/.test(t) && /Ngozi Eze/.test(t));
  await clickText(p, 'main button', 'Edit');
  await p.waitForSelector('main form input', { timeout: LONG });
  const nameField = (await p.$$('main form input'))[0];
  await nameField.click({ clickCount: 3 });
  await nameField.type('Click Group');
  await clickText(p, 'main form button', 'Save');
  await waitText(p, 'Saved.');
  await waitText(p, 'Click Group');
  check('an administrator edits the company name, and it is saved and audited', (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).name === 'Click Group' && (await prisma.auditLog.count({ where: { organization_id: org.id, action: 'organization.updated' } })) === 1);
  await p.close();

  const h = await open({ ...hr, first: 'Hana', last: 'Resources' }, orgs('hr'), '/company?tab=company');
  await waitText(h, 'Administrators and HR');
  check('HR sees the company details but no Edit button', !(await h.$$eval('main button', (b) => b.some((x) => x.textContent.trim() === 'Edit'))));
  await h.goto(WEB + `/company/members/${emp.id}`, { waitUntil: 'domcontentloaded' });
  await waitText(h, 'Assessments taken through the company');
  check('HR can pause an employee from their page', await h.$$eval('main button', (b) => b.some((x) => x.textContent.trim() === 'Pause access')));
  await h.close();

  // ---- small screens
  for (const [name, url, user, session, wait] of [
    ['member page', `/company/members/${emp.id}`, owner, orgs('admin'), 'About'],
    ['company tab', '/company?tab=company', owner, orgs('admin'), 'Administrators and HR'],
    ['staff person page', `/admin/individuals/${target.id}`, boss, bossS, 'Actions'],
  ]) {
    const m = await open(user, session, url, { w: 390, h: 800 });
    await waitText(m, wait);
    await sleep(400);
    check(`phone: the ${name} does not scroll sideways`, !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), await m.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { if (e.getBoundingClientRect().right <= innerWidth + 1) return false; for (let n = e.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'hidden' || o === 'scroll') return false; } return true; }).slice(0, 4).map((e) => e.tagName + '.' + String(e.className).slice(0, 40) + ':' + Math.round(e.getBoundingClientRect().right)).join(' | ')));
    await m.close();
  }

  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await prisma.staffAction.deleteMany({ where: { actor_id: boss.id } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-ui12' } } });
  void cleanup;
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
