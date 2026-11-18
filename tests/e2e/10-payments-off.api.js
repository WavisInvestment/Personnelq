process.env.W5_TAG = 'w7np';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, makeUser, assessments, takeAssessment, finish } = require('./lib');

const emails = () => fake('resend', '/__control/emails');
const paymentsFor = (userId) => prisma.payment.count({ where: { user_id: userId } });

(async () => {
  await fake('resend', '/__control/reset', 'POST');
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const person = await makeUser('person', { first: 'Pat', last: 'Person' });
  const admin = { ...(await makeUser('admin', { first: 'Ada', last: 'Boss' })), first: 'Ada', last: 'Boss' };
  const e1 = await makeUser('e1', { first: 'Eve', last: 'One' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Two' });
  const e3 = await makeUser('e3', { first: 'Kemi', last: 'Three' });
  // a company that never bought a plan: no Subscription row at all
  const org = await prisma.organization.create({ data: { name: 'Free Co', slug: 'w5-w7np-free', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  const O = org.id;
  
  const { full } = await assessments(person.token);

  // ---------------------------------------------------------------- people: the full assessment is free
  const list = (await call('GET', '/assessments', person.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('assessments: with keys, a price and the payment gate all configured, switched off means free: no price, nothing blocked', list.price === null && list.blocked_reason === null && list.can_start === true, JSON.stringify({ p: list.price, b: list.blocked_reason }));
  const result = await takeAssessment(person.token, full.id);
  check('assessments: a person takes the full assessment with no payment at all', !!result.id && (await paymentsFor(person.id)) === 0);

  // ---------------------------------------------------------------- the checkout endpoints refuse
  const tx0 = (await fake('paystack', '/__control/state')).initializeCalls;
  const co = await call('POST', '/payments/checkout', person.token, { assessment_id: full.id });
  check('checkout: refused with 503 PAYMENTS_DISABLED and an honest message', co.status === 503 && co.body.code === 'PAYMENTS_DISABLED' && /switched off/.test(co.body.message), co.text);
  const sc = await call('POST', '/payments/subscription-checkout', admin.token, { organization_id: O, plan: 'team' });
  check('subscription checkout: refused the same way', sc.status === 503 && sc.body.code === 'PAYMENTS_DISABLED', sc.text);
  check('checkout: nothing was created and Paystack was never called', (await paymentsFor(person.id)) === 0 && (await paymentsFor(admin.id)) === 0 && (await fake('paystack', '/__control/state')).initializeCalls === tx0);
  check('checkout: still needs a login (401)', (await call('POST', '/payments/checkout', null, { assessment_id: full.id })).status === 401);

  const bill = await call('GET', `/payments/billing/${O}`, admin.token);
  check('billing: the admin is told payments are off on purpose, with no plans to buy', bill.status === 200 && bill.body.payments_enabled === false && bill.body.payments_disabled === true && bill.body.plans.length === 0 && bill.body.subscription === null, bill.text);
  check('billing: the payment history still loads', (await call('GET', '/payments', person.token)).status === 200);

  // ---------------------------------------------------------------- a payment already in flight still settles
  const ref = 'pb_inflight' + Date.now().toString(16);
  await fetch('http://127.0.0.1:3190/transaction/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk_test_fakefakefake1234' }, body: JSON.stringify({ reference: ref, amount: 500000, currency: 'NGN', email: person.email, callback_url: 'http://localhost:3100/payments/callback', metadata: {} }) });
  await prisma.payment.create({ data: { user_id: person.id, organization_id: null, amount: 5000, currency: 'NGN', status: 'pending', payment_method: 'paystack', provider_reference: ref, paystack_reference: ref, payment_type: 'assessment', assessment_id: full.id, description: 'Full personality assessment' } });
  await fake('paystack', '/__control/set', 'POST', { reference: ref, patch: { status: 'success', paid_at: new Date().toISOString(), channel: 'card' } });
  const wh = await fake('paystack', '/__control/webhook', 'POST', { event: 'charge.success', reference: ref });
  const settled = await prisma.payment.findUnique({ where: { provider_reference: ref } });
  check('in flight: a signed webhook for an earlier payment still settles it, and the receipt is emailed', wh.status === 200 && settled.status === 'success' && (await emails()).some((m) => /Receipt/.test(m.subject) && m.to === person.email));
  const forged = await fetch('http://localhost:3101/api/webhooks/paystack', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'bad' }, body: '{"event":"charge.success","data":{"reference":"x"}}' });
  check('webhook: a forged signature is still refused (401)', forged.status === 401);

  // ---------------------------------------------------------------- companies need no plan
  const dash0 = (await call('GET', `/organizations/${O}/dashboard`, admin.token)).body;
  check('company: the dashboard shows a Free plan with no end date and the free seat limit (3 in this test)', dash0.plan.name === 'Free' && dash0.plan.active === true && dash0.plan.end_date === null && dash0.plan.seats_limit === 3, JSON.stringify(dash0.plan));
  const inv = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: [e1.email, e2.email], department: 'Support' });
  check('company: a company with no plan can invite people', inv.status === 200 && inv.body.invitations.every((i) => i.status === 'invited'), inv.text);
  const over = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: [e3.email, 'extra@w5.test'] });
  check('company: the free seat limit still applies (3 seats, 2 invited, so 2 more is refused)', over.status === 409 && over.body.code === 'SEATS_FULL' && over.body.remaining === 1, over.text);
  const link = (i) => i.link.split('/invite/')[1];
  const a1 = await call('POST', `/invitations/${link(inv.body.invitations[0])}/accept`, e1.token);
  const a2 = await call('POST', `/invitations/${link(inv.body.invitations[1])}/accept`, e2.token);
  check('company: invitations can be accepted without any plan', a1.status === 200 && a2.status === 200, a1.text);
  const one = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: [e3.email] });
  const a3 = await call('POST', `/invitations/${link(one.body.invitations[0])}/accept`, e3.token);
  check('company: the third seat fills the free limit', a3.status === 200 && (await call('GET', `/organizations/${O}/dashboard`, admin.token)).body.team.members === 3);
  const four = await call('POST', `/organizations/${O}/invitations`, admin.token, { emails: ['fourth@w5.test'] });
  check('company: a fourth person is refused, so the limit really holds', four.status === 409 && four.body.code === 'SEATS_FULL', four.text);

  const cover = (await call('GET', '/assessments', e1.token)).body.data.find((a) => a.slug === 'ocean-full');
  check('company: members get the company cover with no plan', cover.company_cover?.name === 'Free Co');
  const startCo = await call('POST', `/assessments/${full.id}/start`, e1.token, { organization_id: O });
  check('company: they can start a company attempt', startCo.status === 200 && startCo.body.submission.questions.length === 50);
  check('company: HR reminders work with no plan', (await call('POST', `/organizations/${O}/reminders`, admin.token)).body.sent >= 1);

  // custom assessment with no plan
  const caId = (await call('POST', `/organizations/${O}/assessments`, admin.token, { name: 'Free Co culture' })).body.id;
  await call('PUT', `/organizations/${O}/assessments/${caId}`, admin.token, { name: 'Free Co culture', description: null, allow_retake: false, retake_interval_days: 90, sections: [{ name: 'Teamwork', description: null, weight: 1, interpretation: { low: '', medium: '', high: '' }, questions: [{ text: 'I enjoy working in a team.', reverse: false, weight: 1 }] }] });
  const pub = await call('POST', `/organizations/${O}/assessments/${caId}/publish`, admin.token);
  const taken = await (async () => { const s = (await call('POST', `/assessments/${caId}/start`, e2.token, {})).body.submission; await call('PUT', `/submissions/${s.id}/answers`, e2.token, { answers: [{ question_id: s.questions[0].id, value: 5 }] }); return call('POST', `/submissions/${s.id}/complete`, e2.token); })();
  check('company: a custom assessment can be published and taken with no plan', pub.status === 200 && taken.status === 200 && taken.body.custom.overall.score === 100);

  // ---------------------------------------------------------------- the pages
  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(m.text().slice(0, 140)); });
  const u = { id: admin.id, email: admin.email, first_name: 'Ada', last_name: 'Boss', organizations: [{ id: O, name: org.name, slug: org.slug, type: 'corporate', role: 'admin' }] };
  await page.evaluateOnNewDocument((t, user) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(user)); }, admin.token, u);
  await page.goto('http://localhost:3100/billing', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.body.innerText.includes('switched off'), { timeout: 90000 }).catch(() => undefined);
  let t = await page.evaluate(() => document.body.innerText);
  check('page: billing says plans and payments are switched off and offers nothing to buy', /Plans and payments are switched off/.test(t) && !/Choose Team|Choose a plan|Current plan/.test(t));
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'w7-billing-off.png') });
  await page.goto('http://localhost:3100/company', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.body.innerText.includes('Free plan'), { timeout: 90000 }).catch(() => undefined);
  t = await page.evaluate(() => document.body.innerText);
  check('page: the company dashboard says "Free plan, no charge. 3 of 3 seats used" and has no renewal link', /Free\s*plan, no charge\.\s*3 of 3 seats used/.test(t) && !/Manage plan|Renew plan/.test(t), t.match(/Free[^\n]*/)?.[0]);
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'w7-company-free.png') });
  check('page: no page or console errors', problems.length === 0, problems.slice(0, 2).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
