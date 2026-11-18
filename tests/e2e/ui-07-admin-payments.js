process.env.W5_TAG = 'w7ap';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, check, makeUser, assessments, finish } = require('./lib');

(async () => {
  const staff = await makeUser('staff', { first: 'Sam', last: 'Staff' });
  const platform = await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'super_admin' } });
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: platform.id } });
  const person = await makeUser('person', { first: 'Eve', last: 'Okafor' });
  const buyer = await makeUser('buyer', { first: 'Bola', last: 'Buyer' });
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-w7ap-acme', type: 'corporate', admin_name: 'Bola Buyer', admin_email: buyer.email } });
  const { full } = await assessments(person.token);

  const base = { currency: 'NGN', status: 'success', payment_method: 'card', payment_type: 'assessment', processed_at: new Date() };
  await prisma.payment.create({ data: { ...base, organization_id: null, user_id: person.id, amount: 5000, provider_reference: 'w5-grant-ap-person', assessment_id: full.id, description: 'Full personality assessment' } });
  await prisma.payment.create({ data: { ...base, organization_id: org.id, user_id: buyer.id, amount: 50000, payment_type: 'subscription', subscription_plan: 'team', provider_reference: 'w5-grant-ap-company', description: 'Team plan for Acme Test Co' } });
  // a payment whose person was later deleted keeps its record, with neither company nor person
  const ghost = await makeUser('ghost', { first: 'Gone', last: 'Person' });
  await prisma.payment.create({ data: { ...base, organization_id: null, user_id: ghost.id, amount: 5000, provider_reference: 'w5-grant-ap-ghost', description: 'Full personality assessment' } });
  await prisma.user.delete({ where: { id: ghost.id } });

  // ---------------------------------------------------------------- API
  const all = await call('GET', '/admin/payments?limit=50', staff.token);
  const rows = all.body.data.filter((r) => r.provider_reference.startsWith('w5-grant-ap'));
  const byRef = Object.fromEntries(rows.map((r) => [r.provider_reference, r]));
  check('api: the list loads (200) with all three kinds of payment', all.status === 200 && rows.length === 3, all.text.slice(0, 160));
  check('api: a personal payment has no company but names the person', byRef['w5-grant-ap-person'].organization === null && byRef['w5-grant-ap-person'].user.email === person.email);
  check('api: a company payment names the company and the person who paid', byRef['w5-grant-ap-company'].organization.name === 'Acme Test Co' && byRef['w5-grant-ap-company'].user.first_name === 'Bola');
  check('api: a payment whose account was deleted is kept, with neither', byRef['w5-grant-ap-ghost'].organization === null && byRef['w5-grant-ap-ghost'].user === null);
  check('api: no gateway secrets or password data are returned', !/authorization_url|access_code|password|metadata/i.test(all.text));
  const byName = await call('GET', '/admin/payments?search=Okafor', staff.token);
  const byEmail = await call('GET', `/admin/payments?search=${encodeURIComponent(person.email)}`, staff.token);
  const byCompany = await call('GET', '/admin/payments?search=Acme%20Test', staff.token);
  check('api: search finds a personal payment by the person’s name, by email, and a company payment by company', byName.body.data.some((r) => r.provider_reference === 'w5-grant-ap-person') && byEmail.body.data.some((r) => r.provider_reference === 'w5-grant-ap-person') && byCompany.body.data.some((r) => r.provider_reference === 'w5-grant-ap-company'));
  check('api: only platform staff can read it (403 for a normal user, 401 without login)', (await call('GET', '/admin/payments', person.token)).status === 403 && (await call('GET', '/admin/payments')).status === 401);

  // ---------------------------------------------------------------- the page
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(m.text().slice(0, 140)); });
  await page.evaluateOnNewDocument((t, u) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(u)); }, staff.token, { id: staff.id, email: staff.email, first_name: 'Sam', last_name: 'Staff', platform_role: 'super_admin', organizations: [] });
  await page.goto('http://localhost:3100/admin/payments', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.body.innerText.includes('Acme Test Co'), { timeout: 90000 }).catch(() => undefined);
  const t = await page.evaluate(() => document.body.innerText);
  check('page: it renders instead of crashing', /Payments/.test(t) && !/Application error|Cannot read properties/.test(t));
  check('page: a personal payment shows the person and "Individual"', /Eve Okafor/.test(t) && /Individual · /.test(t));
  check('page: a company payment shows the company', /Acme Test Co/.test(t) && /Company/.test(t));
  check('page: a deleted account shows a calm label', /Deleted account/.test(t));
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'w7-admin-payments.png') });
  check('page: no page or console errors', problems.length === 0, problems.slice(0, 2).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
