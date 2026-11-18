process.env.W5_TAG = 'w7dp';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, check, sleep, makeUser, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 90000;
let ip = 0;
const withIp = (method, p, token, body) => call(method, p, token, body, { 'X-Forwarded-For': `10.7.6.${++ip}` });
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(-500)); throw e; }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const options = (p, selector) => p.$$eval(`${selector} option`, (o) => o.map((x) => x.textContent.trim()));
const CORPORATE = ['Administration', 'Customer Support', 'Engineering', 'Executive and Management', 'Finance', 'Human Resources', 'IT', 'Legal and Compliance', 'Logistics', 'Marketing', 'Operations', 'Procurement', 'Product', 'Quality Assurance', 'Research and Development', 'Sales', 'Security', 'Other'];

(async () => {
  // ---------------------------------------------------------------- one person, however the address is capitalised
  const base = { first_name: 'Dupe', last_name: 'Probe', password: 'Secure123!x', password_confirm: 'Secure123!x' };
  const first = await withIp('POST', '/auth/signup', null, { ...base, email: 'Eve.Dupe@W5.test' });
  check('email: signing up with capitals stores the address in lower case', first.status === 201 && first.body.user.email === 'eve.dupe@w5.test');
  const second = await withIp('POST', '/auth/signup', null, { ...base, email: '  EVE.DUPE@W5.TEST ' });
  check('email: the same address in other capitals is "already registered" (409), never a second person', second.status === 409 && (await prisma.user.count({ where: { email: { equals: 'eve.dupe@w5.test', mode: 'insensitive' } } })) === 1);
  check('email: signing in works with any capitals', (await withIp('POST', '/auth/login', null, { email: 'EVE.Dupe@w5.TEST', password: 'Secure123!x' })).status === 200);

  // ---------------------------------------------------------------- a company, and a school
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = { ...(await makeUser('admin', { first: 'Ada', last: 'Boss' })), first: 'Ada', last: 'Boss' };
  const hr = await makeUser('hr');
  const e1 = await makeUser('e1', { first: 'Eve', last: 'Okafor' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Bello' });
  const e3 = await makeUser('e3', { first: 'Kemi', last: 'Ade' });
  const head = { ...(await makeUser('head', { first: 'Ngozi', last: 'Head' })), first: 'Ngozi', last: 'Head' };
  const mkOrg = async (slug, name, type, owner) => {
    const o = await prisma.organization.create({ data: { name, slug, type, admin_name: 'x', admin_email: owner.email } });
    await prisma.organizationMember.create({ data: { user_id: owner.id, organization_id: o.id, role_id: (await role('admin')).id } });
    await prisma.subscription.create({ data: { organization_id: o.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 0, seats_limit: 20 } });
    return o;
  };
  const org = await mkOrg('w5-w7dp-acme', 'Acme Test Co', 'corporate', admin);
  const school = await mkOrg('w5-w7dp-school', 'Westfield School', 'school', head);
  await prisma.organizationMember.create({ data: { user_id: hr.id, organization_id: org.id, role_id: (await role('hr')).id } });
  await prisma.organizationMember.create({ data: { user_id: e1.id, organization_id: org.id, role_id: (await role('employee')).id, consented_at: new Date() } });
  await prisma.organizationMember.create({ data: { user_id: e2.id, organization_id: org.id, role_id: (await role('employee')).id, consented_at: new Date(), department: 'MARKETING' } }); // typed before the list existed
  await prisma.organizationMember.create({ data: { user_id: e3.id, organization_id: org.id, role_id: (await role('employee')).id, consented_at: new Date(), department: 'Legacy Dept' } });
  const O = org.id;

  // ---------------------------------------------------------------- the server stores the value; it serves no list
  check('server: there is no department list endpoint any more (404)', (await call('GET', `/organizations/${O}/departments`, admin.token)).status === 404 && (await call('POST', `/organizations/${O}/departments`, admin.token, { name: 'X' })).status === 404);
  const inv = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['inv1-w7dp@w5.test', 'inv2-w7dp@w5.test', 'inv3-w7dp@w5.test'], department: '  Logistics ' });
  check('server: an invitation stores the chosen department, spaces tidied', inv.status === 200 && (await prisma.employeeInvitation.findFirst({ where: { recipient_email: 'inv1-w7dp@w5.test' } })).department === 'Logistics', inv.text);
  const blank = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['inv4-w7dp@w5.test'], department: '   ' });
  check('server: a blank department means none', blank.status === 200 && (await prisma.employeeInvitation.findFirst({ where: { recipient_email: 'inv4-w7dp@w5.test' } })).department === null);
  check('server: a department over 80 characters is refused (400)', (await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['inv5-w7dp@w5.test'], department: 'x'.repeat(81) })).status === 400);

  const mv = await call('PATCH', `/organizations/${O}/members/${e1.id}`, hr.token, { department: ' Finance ' });
  check('people: HR changes a person’s department', mv.status === 200 && mv.body.department === 'Finance' && (await prisma.organizationMember.findFirst({ where: { user_id: e1.id, organization_id: O } })).department === 'Finance');
  check('people: null clears it', (await call('PATCH', `/organizations/${O}/members/${e1.id}`, hr.token, { department: null })).body.department === null);
  check('people: employees cannot (403); a stranger to the company is a 404; over 80 characters is a 400', (await call('PATCH', `/organizations/${O}/members/${e1.id}`, e2.token, { department: 'Finance' })).status === 403 && (await call('PATCH', `/organizations/${O}/members/${head.id}`, hr.token, { department: 'Finance' })).status === 404 && (await call('PATCH', `/organizations/${O}/members/${e1.id}`, hr.token, { department: 'x'.repeat(81) })).status === 400);
  await call('PATCH', `/organizations/${O}/members/${e1.id}`, hr.token, { department: 'marketing' });
  const dash = (await call('GET', `/organizations/${O}/dashboard`, admin.token)).body;
  const marketing = dash.departments.filter((d) => d.department.toLowerCase() === 'marketing');
  check('dashboard: "marketing" and "MARKETING" count as one department of two people', marketing.length === 1 && marketing[0].members === 2, JSON.stringify(dash.departments.map((d) => [d.department, d.members])));
  check('audit: changing a person’s department is recorded', (await prisma.auditLog.count({ where: { organization_id: O, action: 'member.department_changed' } })) >= 3);

  // ---------------------------------------------------------------- the screens
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const open = async (user, orgRow, type, w = 1440, h = 900, mobile = false) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(m.text().slice(0, 140)); });
    const u = { id: user.id, email: user.email, first_name: user.first, last_name: user.last, organizations: [{ id: orgRow.id, name: orgRow.name, slug: orgRow.slug, type, role: 'admin' }] };
    await page.evaluateOnNewDocument((t, x) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(x)); }, user.token, u);
    await page.goto(`${WEB}/company`, { waitUntil: 'domcontentloaded', timeout: LONG });
    await page.waitForSelector('button[role=tab]', { timeout: LONG });
    return page;
  };

  const page = await open(admin, org, 'corporate');
  await clickText(page, 'button[role=tab]', 'Invitations');
  await waitText(page, 'Email addresses');
  const opts = (await options(page, 'form select')).filter((o) => !['Employee', 'HR', 'Administrator'].includes(o));
  check('invitations: department is a select whose options come from the website: "No department" then the company list (incl. Logistics and Finance)', opts[0] === 'No department' && JSON.stringify(opts.slice(1)) === JSON.stringify(CORPORATE) && opts.includes('Logistics') && opts.includes('Finance'), opts.join('|'));
  check('invitations: no free-text department box and no "add a department" step', (await page.$$('form input')).length === 1 && !/Add a new department|Manage departments/.test(await body(page)));
  await page.select('form select', 'Logistics');
  await page.type('textarea', 'inv6-w7dp@w5.test');
  await clickText(page, 'button', 'Send invitation');
  await waitText(page, 'inv6-w7dp@w5.test');
  await sleep(800);
  check('invitations: the invitation sent from the form carries the chosen department', (await prisma.employeeInvitation.findFirst({ where: { recipient_email: 'inv6-w7dp@w5.test' } }))?.department === 'Logistics');
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'w7-departments-invite.png'), fullPage: true });

  await clickText(page, 'button[role=tab]', 'People');
  await waitText(page, 'Eve Okafor');
  check('people: no list manager, just a select on each row', !/Add, rename or remove|Nothing on the list yet/.test(await body(page)) && (await page.$('select[aria-label="Department for Eve Okafor"]')) !== null);
  const rowOpts = await options(page, 'select[aria-label="Department for Eve Okafor"]');
  check('people: each row offers None plus the same list', rowOpts[0] === 'None' && JSON.stringify(rowOpts.slice(1)) === JSON.stringify(CORPORATE));
  check('people: a spelling typed earlier ("marketing") is shown as the listed "Marketing"', (await page.$eval('select[aria-label="Department for Tunde Bello"]', (s) => s.value)) === 'Marketing');
  const legacy = await options(page, 'select[aria-label="Department for Kemi Ade"]');
  check('people: a value not on the list is still shown, marked "(not on the list)", not silently dropped', legacy.includes('Legacy Dept (not on the list)') && (await page.$eval('select[aria-label="Department for Kemi Ade"]', (s) => s.value)) === 'Legacy Dept');
  await page.select('select[aria-label="Department for Eve Okafor"]', 'Finance');
  await sleep(1500);
  check('people: choosing one saves it', (await prisma.organizationMember.findFirst({ where: { user_id: e1.id, organization_id: O } })).department === 'Finance');
  await page.select('select[aria-label="Department for Eve Okafor"]', '');
  await sleep(1500);
  check('people: choosing None clears it', (await prisma.organizationMember.findFirst({ where: { user_id: e1.id, organization_id: O } })).department === null);
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'w7-departments-people.png'), fullPage: true });

  // a school gets its own list and wording
  const sp = await open(head, school, 'school');
  await clickText(sp, 'button[role=tab]', 'Invitations');
  await waitText(sp, 'Class or team');
  const schoolOpts = await options(sp, 'form select');
  check('school: the select says "Class or team" and offers a school list', /Class or team \(optional\)/.test(await body(sp)) && schoolOpts[0] === 'No class or team' && schoolOpts.includes('Nursery') && schoolOpts.includes('Teaching Staff') && !schoolOpts.includes('Logistics'), schoolOpts.join('|'));

  const m = await open(admin, org, 'corporate', 390, 844, true);
  await clickText(m, 'button[role=tab]', 'People');
  await sleep(2500);
  check('phone: the people tab has no sideways page scroll', !(await overflow(m)));
  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
