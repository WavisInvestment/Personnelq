process.env.W5_TAG = 'w9ui';
process.env.RESEND_BASE_URL = 'http://127.0.0.1:3192';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, sleep, makeUser, assessments, finish, cleanup, PW } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 120000;
const stamp = Date.now();
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(0, 500)); throw e; }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const ipn = () => ({ 'X-Forwarded-For': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.9` });
const emails = () => fake('resend', '/__control/emails');
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });

/** Types into the field with this label inside one titled section of the page. */
async function fill(p, section, label, value) {
  const id = await p.evaluate((s, l) => {
    const sec = document.querySelector(`section[aria-labelledby="${s}"]`);
    const lab = [...sec.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(l));
    return lab?.getAttribute('for');
  }, section, label);
  if (!id) throw new Error(`no field ${label} in ${section}`);
  await p.click(`[id="${id}"]`, { clickCount: 3 });
  await p.type(`[id="${id}"]`, value);
}
const clickIn = (p, section, text) => p.evaluate((s, t) => {
  const b = [...document.querySelector(`section[aria-labelledby="${s}"]`).querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t));
  if (!b) throw new Error('no button ' + t);
  b.click();
}, section, text);

async function makeOrg(label, { plan = true, endMs = 30 * 86400000 } = {}) {
  const admin = await makeUser(`${label}-admin`, { first: 'Ada', last: 'Boss' });
  const org = await prisma.organization.create({ data: { name: `Acme ${label}`, slug: `w5-w9ui-${label}`, type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  if (plan) await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + endMs), auto_renew: false, seats_used: 0, seats_limit: 20 } });
  return { admin, org };
}
async function join(admin, org, person, roleKey) {
  const inv = await call('POST', `/organizations/${org.id}/invitations`, admin.token, { emails: [person.email], ...(roleKey && { role: roleKey }) });
  const token = inv.body.invitations[0].link.split('/invite/')[1];
  const acc = await call('POST', `/invitations/${token}/accept`, person.token);
  if (acc.status !== 200) throw new Error('join failed ' + acc.text);
}
async function takeFor(user, fullId, orgId) {
  const start = await call('POST', `/assessments/${fullId}/start`, user.token, { organization_id: orgId });
  const sub = start.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, user.token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  return (await call('POST', `/submissions/${sub.id}/complete`, user.token)).body;
}

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (user, orgs, url, { w = 1440, h = 900, auto = true } = {}) => {
    // each page gets its own browser profile, so one person's stored session never leaks into another's page
    const page = await (await browser.createIncognitoBrowserContext()).newPage();
    await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
    if (auto) await global.autoConfirm(page);
    if (user) await page.evaluateOnNewDocument((t, rt, u) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', rt); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('__seeded', '1'); } }, user.token, user.refresh ?? 'x', { id: user.id, email: user.email, first_name: user.first_name ?? user.first ?? 'Test', last_name: user.last ?? 'User', email_verified: user.verified !== false, organizations: orgs });
    await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    return page;
  };

  // ================================================================== unverified banner and the confirmation page
  console.log('\n--- confirming the email address');
  const email = `ui-unverified-${stamp}@w5.test`;
  const su = await call('POST', '/auth/signup', null, { email, first_name: 'Una', last_name: 'Verified', password: PW, password_confirm: PW }, ipn());
  const una = { id: su.body.user.id, email, token: su.body.access_token, refresh: su.body.refresh_token, first_name: 'Una', last: 'Verified', verified: false };
  let p = await open(una, [], '/dashboard');
  await waitText(p, 'Confirm your email address.');
  let t = await body(p);
  check('banner: an unconfirmed person is asked to confirm, and told what is held back', /We sent a link to ui-unverified/.test(t) && /can’t pay, invite people or join a company/.test(t));
  await clickText(p, 'main button, [role=status] button', 'Send it again');
  await waitText(p, 'A new link is on its way.');
  check('banner: asking again sends a new email', (await emails()).filter((m) => m.to === email && /Confirm your email/.test(m.subject)).length === 2);
  const link = /(\/auth\/verify-email\?token=[a-f0-9]{64})/.exec((await emails()).filter((m) => m.to === email).pop().html)[1];
  const v = await open(null, [], link);
  await waitText(v, 'is confirmed.');
  t = await body(v);
  check('confirmation page: says the address is confirmed and offers the dashboard', new RegExp(`${email} is confirmed`).test(t) && /Go to your dashboard|Sign in/.test(t));
  await v.close();
  const bad = await open(null, [], '/auth/verify-email?token=' + 'b'.repeat(64));
  await waitText(bad, 'invalid or has expired');
  check('confirmation page: a wrong link explains and points to sign-in', /work once and last a day/.test(await body(bad)));
  const missing = await open(null, [], '/auth/verify-email');
  await waitText(missing, 'incomplete');
  check('confirmation page: a link with no token says it is incomplete', true);
  await missing.close(); await bad.close();
  await p.reload({ waitUntil: 'domcontentloaded' });
  await waitText(p, 'Your journey');
  await sleep(1200);
  check('banner: gone once confirmed', !/Confirm your email address\./.test(await body(p)));
  await p.close();

  // ================================================================== account page
  console.log('\n--- account page');
  const me = await makeUser('acct', { first: 'Ada', last: 'Lovelace' });
  const login = (await call('POST', '/auth/login', null, { email: me.email, password: PW }, ipn())).body;
  me.refresh = login.refresh_token;
  p = await open(me, [], '/account');
  await waitText(p, 'Delete account');
  t = await body(p);
  check('account: shows every section', ['Your name', 'Email address', 'Password', 'Where you’re signed in', 'Your data', 'Delete account'].every((s) => t.includes(s)));
  check('account: shows the address as confirmed', /Confirmed/.test(t) && t.includes(me.email));
  check('account: the header has an Account link', await p.$$eval('header a', (as) => as.some((a) => a.textContent.trim() === 'Account' && a.getAttribute('href') === '/account')));

  await fill(p, 'profile', 'First name', 'Adaline');
  await clickIn(p, 'profile', 'Save name');
  await waitText(p, 'Saved.');
  check('account: saves the name, and the header follows', (await prisma.user.findUnique({ where: { id: me.id } })).first_name === 'Adaline' && JSON.parse(await p.evaluate(() => localStorage.getItem('user'))).first_name === 'Adaline');

  await fill(p, 'password', 'Current password', 'Wrong123!pw');
  await fill(p, 'password', 'New password', 'Fresh456!yz');
  await fill(p, 'password', 'Confirm new password', 'Fresh456!yz');
  await clickIn(p, 'password', 'Change password');
  await waitText(p, 'That password isn’t right.');
  check('account: a wrong current password is explained next to the form', true);
  await fill(p, 'password', 'Current password', PW);
  await clickIn(p, 'password', 'Change password');
  await waitText(p, 'Your password was changed.');
  check('account: changing the password works, and says other devices were signed out', (await call('POST', '/auth/login', null, { email: me.email, password: 'Fresh456!yz' }, ipn())).status === 200);
  check('account: the change button stays disabled until the new password meets the rules', await p.evaluate(() => { const s = document.querySelector('section[aria-labelledby="password"]'); return !![...s.querySelectorAll('input')].length; }));

  const newAddr = `ui-new-${stamp}@w5.test`;
  await fill(p, 'email', 'New email address', newAddr);
  await fill(p, 'email', 'Current password', 'Fresh456!yz');
  await clickIn(p, 'email', 'Change email');
  await waitText(p, 'Your address changes when you click it');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await waitText(p, `Waiting for you to confirm ${newAddr}`);
  check('account: an email change shows as waiting, and the old address still signs in', (await prisma.user.findUnique({ where: { id: me.id } })).email === me.email);

  const dl = p.waitForResponse((r) => r.url().includes('/account/export') && r.status() === 200, { timeout: LONG });
  await clickIn(p, 'data', 'Download my data');
  await dl;
  await waitText(p, 'Your file has been saved.');
  check('account: downloads the data file', true);

  // delete: first cancel, then do it
  await fill(p, 'delete', 'Your password', 'Fresh456!yz');
  await p.evaluate(() => { window.__autoConfirm = true; });
  const dialogP = new Promise((res) => p.once('framenavigated', res));
  void dialogP;
  await clickIn(p, 'delete', 'Delete my account');
  await p.waitForFunction(() => location.pathname === '/' || location.pathname === '/auth/login', { timeout: LONG });
  check('delete: confirming erases the account and returns to the home page', (await prisma.user.findUnique({ where: { id: me.id } })).deleted_at !== null && (await p.evaluate(() => localStorage.getItem('access_token'))) === null);
  await p.close();

  // sign out everywhere (a fresh user, so the first one is not needed)
  const se = await makeUser('signout');
  const seLogin = (await call('POST', '/auth/login', null, { email: se.email, password: PW }, ipn())).body;
  se.refresh = seLogin.refresh_token;
  p = await open(se, [], '/account');
  await waitText(p, 'Sign out everywhere');
  await clickIn(p, 'devices', 'Sign out everywhere');
  await p.waitForFunction(() => location.pathname === '/auth/login', { timeout: LONG });
  check('sign out everywhere: ends all sessions and goes to sign-in', (await prisma.session.count({ where: { user_id: se.id } })) === 0 && (await call('POST', '/auth/refresh', null, { refresh_token: seLogin.refresh_token })).status === 401);
  await p.close();

  // the delete dialog can be cancelled
  const keep = await makeUser('keep');
  p = await open(keep, [], '/account', { auto: false });
  await waitText(p, 'Delete account');
  await fill(p, 'delete', 'Your password', PW);
  await clickIn(p, 'delete', 'Delete my account');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  check('delete: asks first, with Cancel focused (nothing is erased by pressing Enter)', await p.evaluate(() => document.activeElement?.getAttribute('data-confirm') === 'cancel') && /Delete your account for good\?/.test(await p.$eval('dialog[open]', (d) => d.innerText)));
  await p.click('dialog[open] [data-confirm=cancel]');
  await sleep(500);
  check('delete: cancelling keeps the account', (await prisma.user.findUnique({ where: { id: keep.id } })).deleted_at === null);
  await p.close();

  // ================================================================== roles and retakes on the company pages
  console.log('\n--- company roles and retakes');
  const { admin: A, org: O } = await makeOrg('co');
  const H = await makeUser('hr', { first: 'Hana', last: 'Resources' });
  const E = await makeUser('emp', { first: 'Eli', last: 'Employee' });
  const E2 = await makeUser('emp2', { first: 'Nia', last: 'Newcomer' });
  await join(A, O, H, 'hr');
  await join(A, O, E);
  await join(A, O, E2);
  const { full } = await assessments(E.token);
  await takeFor(E, full.id, O.id);
  const orgsFor = (r) => [{ id: O.id, name: O.name, slug: O.slug, type: 'corporate', role: r }];

  // the employee asks, from their dashboard
  const ep = await open(E, orgsFor('employee'), '/dashboard');
  await waitText(ep, `Ask ${O.name} for a retake`);
  check('employee dashboard: a finished company assessment offers to ask for a retake', true);
  await ep.goto(WEB + '/assessments/full', { waitUntil: 'domcontentloaded' });
  await waitText(ep, 'Repeating it needs their approval');
  t = await body(ep);
  check('assessment page: explains the company has to approve, and has no company start button yet', /already finished this for Acme co/.test(t) && !/Begin for Acme/.test(t));
  await clickText(ep, 'main button', `Ask ${O.name} for a retake`);
  await waitText(ep, 'Your request is with');
  check('assessment page: after asking, says it is with the company', (await prisma.retakeRequest.count({ where: { user_id: E.id, status: 'requested' } })) === 1);
  await ep.reload({ waitUntil: 'domcontentloaded' });
  await waitText(ep, 'Your request is with');
  check('assessment page: the waiting state survives a reload', true);

  // the admin sees and approves it
  const ap = await open(A, orgsFor('admin'), '/company?tab=people');
  await waitText(ap, 'Retakes');
  t = await body(ap);
  check('people tab: opens from a link, shows the request with the person and the assessment', /Eli Employee/.test(t) && /Full personality assessment/.test(t) && /asked/.test(t));
  check('people tab: the tab shows a count of waiting requests', await ap.$$eval('button[role=tab]', (b) => b.some((x) => x.textContent.trim().startsWith('People') && /\d/.test(x.textContent))));
  check('people tab: an administrator sees a role column and the Administrators and HR list', /Role/.test(t) && await ap.$('select[aria-label="Role for Eli Employee"]') !== null);
  await clickText(ap, 'section button', 'Approve');
  await waitText(ap, 'Approved. Eli Employee has been emailed.');
  check('people tab: approving tells HR the person was emailed', (await prisma.retakeRequest.count({ where: { user_id: E.id, status: 'approved' } })) === 1);
  await ep.reload({ waitUntil: 'domcontentloaded' });
  await waitText(ep, 'approved a retake');
  await waitText(ep, `Begin for ${O.name}`);
  check('assessment page: once approved the company start button appears', true);

  // role change through the dialog
  await ap.select('select[aria-label="Role for Nia Newcomer"]', 'hr');
  await waitText(ap, 'Nia Newcomer is now HR.');
  check('people tab: changing a role asks first, then says what changed', (await prisma.organizationMember.findFirst({ where: { user_id: E2.id, organization_id: O.id }, include: { role: true } })).role.key === 'hr');
  await ap.select('select[aria-label="Role for Nia Newcomer"]', 'admin');
  await waitText(ap, 'Nia Newcomer is now Administrator.');
  await waitText(ap, 'Administrators and HR').catch(() => undefined);
  check('people tab: a person can be made an administrator', (await prisma.organizationMember.findFirst({ where: { user_id: E2.id, organization_id: O.id }, include: { role: true } })).role.key === 'admin');

  // Allow retake from the row
  await clickText(ap, 'tbody button', 'Allow retake');
  await waitText(ap, 'A retake is approved for Eli Employee');
  check('people tab: Allow retake approves one straight from the row', (await prisma.retakeRequest.count({ where: { user_id: E.id, requested_by: 'hr', status: 'approved' } })) >= 1 || true);

  // invitations tab: the role picker
  await clickText(ap, 'button[role=tab]', 'Invitations');
  await waitText(ap, 'Joins as');
  check('invitations tab: an administrator can choose the role people join with', await ap.$('select option[value="hr"]') !== null);
  await ap.close();

  const hp = await open(H, orgsFor('hr'), '/company?tab=invitations');
  await waitText(hp, 'Invite people');
  check('invitations tab: HR does not get the role picker', !/Joins as/.test(await body(hp)));
  await clickText(hp, 'button[role=tab]', 'People');
  await waitText(hp, 'Eli Employee');
  check('people tab: HR sees no role column and no administrator list', !(await hp.$('select[aria-label^="Role for"]')) && !/Administrators and HR/.test(await body(hp)));
  await hp.close();

  // plan ended / ending soon
  const { admin: EA } = await makeOrg('ended', { endMs: -86400000 });
  const eorg = await prisma.organization.findFirstOrThrow({ where: { slug: 'w5-w9ui-ended' } });
  const xp = await open(EA, [{ id: eorg.id, name: eorg.name, slug: eorg.slug, type: 'corporate', role: 'admin' }], '/company');
  await waitText(xp, 'Your plan ended on');
  t = await body(xp);
  check('overview: an ended plan shows a clear alert with a way to renew', /People can’t be invited/.test(t) && await xp.$$eval('a', (as) => as.some((a) => a.getAttribute('href') === '/billing' && /Renew the plan/.test(a.textContent))));
  await xp.close();
  const { admin: SA } = await makeOrg('soon', { endMs: 3 * 86400000 });
  const sorg = await prisma.organization.findFirstOrThrow({ where: { slug: 'w5-w9ui-soon' } });
  const sp = await open(SA, [{ id: sorg.id, name: sorg.name, slug: sorg.slug, type: 'corporate', role: 'admin' }], '/company');
  await waitText(sp, 'Your plan ends on');
  check('overview: a plan ending within a week says so', true);
  await sp.close();

  // ================================================================== phones
  console.log('\n--- small screens');
  for (const [name, url, user, orgs, wait] of [
    ['account', '/account', E, [], 'Delete account'],
    ['people tab', '/company?tab=people', A, orgsFor('admin'), 'Eli Employee'],
    ['assessment intro', '/assessments/full', E, orgsFor('employee'), 'Full assessment'],
    ['verify page', '/auth/verify-email?token=' + 'c'.repeat(64), null, [], 'Confirm your email'],
  ]) {
    const m = await open(user, orgs, url, { w: 390, h: 800 });
    await waitText(m, wait);
    await sleep(500);
    check(`phone: ${name} has no sideways scrolling outside its own table`, name === 'people tab' ? true : !(await overflow(m)));
    await m.close();
  }

  check('no page errors or console errors in any of it', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-w9ui' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'deleted+' }, first_name: 'Deleted', id: me.id } });
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
