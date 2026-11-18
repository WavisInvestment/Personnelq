process.env.W5_TAG = 'w7in';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, sleep, makeUser, PW, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 90000;
const OUT = require('os').tmpdir();
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(-500)); throw e; }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const tokenOf = (link) => link.split('/invite/')[1];
let ipCounter = 0;
// Each API sign-up comes from its own (proxy-reported) address so the 5-per-hour limit, which is real, doesn't get in the way.
const signup = (b) => call('POST', '/auth/signup', null, { first_name: 'Test', last_name: 'Person', password: 'Secure123!x', password_confirm: 'Secure123!x', ...b }, { 'X-Forwarded-For': `10.9.8.${++ipCounter}` });

(async () => {
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const existing = await makeUser('existing', { first: 'Tunde', last: 'Bello' });
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-w7in-acme', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: 10 } });
  const O = org.id;
  
  const newEmail = 'new.invitee-w7in@w5.test', revokedEmail = 'cancelled-w7in@w5.test', apiEmail = 'api.invitee-w7in@w5.test';
  const inv = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: [newEmail, existing.email, revokedEmail, apiEmail], department: 'Support', job_title: 'Agent' });
  const links = Object.fromEntries(inv.body.invitations.map((i) => [i.email, i.link.split('/invite/')[1]]));
  const revokedRow = (await call('GET', `/organizations/${O}/invitations`, admin.token)).body.data.find((i) => i.email === revokedEmail);
  await call('DELETE', `/organizations/${O}/invitations/${revokedRow.id}`, admin.token);

  // ---------------------------------------------------------------- API rules
  const info = (await call('GET', `/invitations/${links[newEmail]}`)).body;
  check('api: the link gives the address, the role and the company (no login needed)', info.email === newEmail && info.role.key === 'employee' && info.role.name === 'Employee' && info.organization_name === 'Acme Test Co' && info.department === 'Support');
  const wrong = await signup({ email: 'someone.else@w5.test', invitation_token: links[apiEmail] });
  check('api: signing up with a token but another address is refused (400)', wrong.status === 400 && wrong.body.code === 'INVITATION_EMAIL_MISMATCH', wrong.text);
  check('api: …and no account was created', (await prisma.user.count({ where: { email: 'someone.else@w5.test' } })) === 0);
  const corp = await signup({ email: apiEmail, invitation_token: links[apiEmail], account_type: 'corporate', organization_name: 'Sneaky Co' });
  check('api: an invited person cannot sign up as a company (400), and no company is created', corp.status === 400 && corp.body.code === 'INVITATION_ACCOUNT_TYPE' && (await prisma.organization.count({ where: { name: 'Sneaky Co' } })) === 0, corp.text);
  const dead = await signup({ email: revokedEmail, invitation_token: links[revokedEmail] });
  check('api: a cancelled invitation cannot be used to sign up (400)', dead.status === 400 && dead.body.code === 'INVITATION_INVALID');
  check('api: a made-up or malformed token is refused (400)', (await signup({ email: apiEmail, invitation_token: 'x'.repeat(43) })).body.code === 'INVITATION_INVALID' && (await signup({ email: apiEmail, invitation_token: 'short' })).status === 400);
  const okApi = await signup({ email: apiEmail.toUpperCase(), invitation_token: links[apiEmail] });
  check('api: the right address works (any letter case) and is stored exactly as invited, as an individual', okApi.status === 201 && okApi.body.user.email === apiEmail && okApi.body.user.organizations.length === 0, okApi.text.slice(0, 200));
  const acceptApi = await call('POST', `/invitations/${links[apiEmail]}/accept`, okApi.body.access_token);
  check('api: that new person can then accept and joins as an employee', acceptApi.status === 200 && (await prisma.organizationMember.findFirst({ where: { organization_id: O, user: { email: apiEmail } }, include: { role: true } })).role.key === 'employee');
  const plain = await signup({ email: 'plain-w7in@w5.test' });
  check('api: ordinary sign-up without an invitation is unchanged', plain.status === 201);

  // ---------------------------------------------------------------- the browser: a new person
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const watch = (p) => { p.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 140)); }); };
  const ctx = await browser.createIncognitoBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  watch(p);
  await p.goto(`${WEB}/invite/${links[newEmail]}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(p, 'invited you to join Acme Test Co');
  let t = await body(p);
  check('invite page: shows the full address and the role it is for', t.includes(newEmail) && /join as\s*employee/.test(t.replace(/\s+/g, ' ')) && /can’t be changed/.test(t));
  await clickText(p, 'a', 'Create an account to accept');
  await p.waitForFunction(() => location.pathname === '/auth/signup' && location.search.includes('invite='), { timeout: LONG });
  await p.waitForSelector('input[name=email]', { timeout: LONG });
  t = await body(p);
  check('sign-up: names the company and inviter and shows the role as fixed', /Join Acme Test Co/.test(t) && /Ada Boss/.test(t) && /Role\s*\n?\s*Employee/.test(t) && /Support/.test(t) && /Agent/.test(t));
  check('sign-up: there is no "who are you signing up as" choice and no organisation name field', !/A company|A school|A church or community|Just me/.test(t) && (await p.$('input[name=organization_name]')) === null);
  const email = await p.$('input[name=email]');
  check('sign-up: the email is already filled in with the invited address, and is read-only', (await p.$eval('input[name=email]', (e) => e.value)) === newEmail && (await p.$eval('input[name=email]', (e) => e.readOnly)));
  await email.click();
  await p.keyboard.type('hacker@evil.test');
  check('sign-up: typing in the email field changes nothing', (await p.$eval('input[name=email]', (e) => e.value)) === newEmail);
  await p.screenshot({ path: path.join(OUT, 'w7-invite-signup.png'), fullPage: true });
  await p.type('input[name=first_name]', 'Nia');
  await p.type('input[name=last_name]', 'Invitee');
  await p.type('input[name=password]', 'Secure123!x');
  await p.type('input[name=password_confirm]', 'Secure123!x');
  // tamper: unlock the field in the browser and put another address in; the form still sends the invited one
  await p.$eval('input[name=email]', (e) => { e.readOnly = false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, 'tampered@evil.test'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickText(p, 'button', 'Create account and continue');
  await p.waitForFunction((tok) => location.pathname === '/invite/' + tok, { timeout: LONG }, links[newEmail]);
  const created = await prisma.user.findFirst({ where: { email: { in: [newEmail, 'tampered@evil.test'] } } });
  check('sign-up: even with the field tampered with, the account uses the invited address', created?.email === newEmail && (await prisma.user.count({ where: { email: 'tampered@evil.test' } })) === 0);
  await waitText(p, 'Accept and continue');
  check('sign-up: lands back on the invitation, signed in as the invited address, ready to accept', new RegExp('Signed in as ' + newEmail.replace(/\./g, '\\.')).test(await body(p)));
  await clickText(p, 'button', 'Accept and continue');
  await p.waitForFunction(() => location.pathname === '/assessments/full', { timeout: LONG });
  await waitText(p, 'Take it for Acme Test Co');
  const member = await prisma.organizationMember.findFirst({ where: { user_id: created.id, organization_id: O }, include: { role: true } });
  check('accepting: joined as an employee with department and title from the invitation, and the company cover shows', member.role.key === 'employee' && member.department === 'Support' && member.job_title === 'Agent' && member.consented_at !== null);

  // ---------------------------------------------------------------- the browser: someone who already has an account
  const ctx2 = await browser.createIncognitoBrowserContext();
  const q = await ctx2.newPage();
  await q.setViewport({ width: 1440, height: 900 });
  watch(q);
  await q.goto(`${WEB}/invite/${links[existing.email]}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(q, 'invited you to join Acme Test Co');
  await clickText(q, 'a', 'Sign in');
  await q.waitForFunction(() => location.pathname === '/auth/login' && location.search.includes('invite='), { timeout: LONG });
  await q.waitForSelector('input[name=email]', { timeout: LONG });
  t = await body(q);
  check('sign-in: shows the company and the fixed role, with the email pre-filled and read-only', /Sign in to join Acme Test Co/.test(t) && /Employee/.test(t) && (await q.$eval('input[name=email]', (e) => e.value)) === existing.email && (await q.$eval('input[name=email]', (e) => e.readOnly)));
  await q.screenshot({ path: path.join(OUT, 'w7-invite-login.png') });
  await q.type('input[name=password]', PW);
  await clickText(q, 'button', 'Sign in and continue');
  await q.waitForFunction((tok) => location.pathname === '/invite/' + tok, { timeout: LONG }, links[existing.email]);
  await waitText(q, 'Accept and continue');
  check('sign-in: returns to the invitation signed in, with no need to type the email', /Signed in as/.test(await body(q)));

  // an existing account trying to "create" one through the invitation is pointed to sign in
  const ctx3 = await browser.createIncognitoBrowserContext();
  const r = await ctx3.newPage();
  await r.setViewport({ width: 1440, height: 900 });
  watch(r);
  await r.goto(`${WEB}/auth/signup?invite=${links[existing.email]}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await r.waitForSelector('input[name=first_name]', { timeout: LONG });
  await r.type('input[name=first_name]', 'Tunde'); await r.type('input[name=last_name]', 'Bello');
  await r.type('input[name=password]', 'Secure123!x'); await r.type('input[name=password_confirm]', 'Secure123!x');
  await clickText(r, 'button', 'Create account and continue');
  await waitText(r, 'There is already an account with this email address');
  check('sign-up for an address that already has an account: says so and offers "Sign in instead"', /Sign in instead/.test(await body(r)));

  // a cancelled invitation shows a clear dead end instead of a form
  await r.goto(`${WEB}/auth/signup?invite=${links[revokedEmail]}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(r, 'This invitation can’t be used');
  t = await body(r);
  check('cancelled invitation: a plain message and no form', /was cancelled/.test(t) && (await r.$('input[name=password]')) === null);
  await r.goto(`${WEB}/auth/login?invite=not-a-real-token-at-all-nope`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(r, 'This invitation can’t be used');
  check('a malformed invitation link is a dead end too', /isn’t valid/.test(await body(r)));

  // ---------------------------------------------------------------- ordinary pages still work, and phones
  await r.goto(`${WEB}/auth/signup`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(r, 'Create your account');
  t = await body(r);
  check('ordinary sign-up is unchanged: account type choice, editable email', /A company/.test(t) && (await r.$eval('input[name=email]', (e) => !e.readOnly)));
  await r.goto(`${WEB}/auth/login`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(r, 'Welcome back');
  check('ordinary sign-in is unchanged: editable email', await r.$eval('input[name=email]', (e) => !e.readOnly));

  const m = await ctx3.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await m.goto(`${WEB}/auth/signup?invite=${links[existing.email]}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await m.waitForSelector('input[name=email]', { timeout: LONG });
  await sleep(1500);
  check('phone: the invited sign-up has no sideways scrolling', !(await overflow(m)));
  await m.screenshot({ path: path.join(OUT, 'w7-invite-signup-phone.png') });

  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
