// In a browser: a company administrator sees the team by personality class, filters the people list, and compares two people.
process.env.W5_TAG = 'ui13';
const path = require('path');
const { prisma, call, check, makeUser, assessments, puppeteer, CHROME, finish } = require('./lib');
const WEB = 'http://localhost:3100';
const LONG = 120000;
const OUT = path.join(require('os').tmpdir(), 'w10-shots');
require('fs').mkdirSync(OUT, { recursive: true });
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = (p, needle) => p.waitForFunction((n) => document.body.innerText.includes(n), { timeout: LONG }, needle);

(async () => {
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const e1 = await makeUser('e1', { first: 'Eve', last: 'Okafor' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Bello' });
  const e3 = await makeUser('e3', { first: 'Nia', last: 'Waiting' });
  const org = await prisma.organization.create({ data: { name: 'Class Co', slug: 'w5-ui13-co', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email, subscription_plan: 'team', subscription_status: 'active' } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'admin' } })).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 25 * 86400000), auto_renew: false, seats_limit: 10 } });
  const O = `/organizations/${org.id}`;
  for (const u of [e1, e2, e3]) {
    const inv = await call('POST', `${O}/invitations`, admin.token, { emails: [u.email] });
    await call('POST', `/invitations/${inv.body.invitations[0].link.split('/invite/')[1]}/accept`, u.token);
  }
  const { full } = await assessments(e1.token);
  for (const [u, value] of [[e1, 4], [e2, 2]]) {
    const start = await call('POST', `/assessments/${full.id}/start`, u.token, { organization_id: org.id });
    const sub = start.body.submission;
    for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, u.token, { answers: sub.questions.slice(i, i + 10).map((q) => ({ question_id: q.id, value })) });
    await call('POST', `/submissions/${sub.id}/complete`, u.token);
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  const p = await browser.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  p.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
  await p.evaluateOnNewDocument((t, u) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(u)); }, admin.token, { id: admin.id, email: admin.email, first_name: 'Ada', last_name: 'Boss', email_verified: true, organizations: [{ id: org.id, name: 'Class Co', slug: org.slug, type: 'corporate', role: 'admin' }] });

  await p.goto(`${WEB}/company?tab=classes`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(p, 'Your team by class');
  let t = await body(p);
  require('fs').writeFileSync(path.join(OUT, 't1.txt'), t);
  check('the Classes tab lists all eight classes, with how many people are in each', ['CL-01', 'CL-02', 'CL-03', 'CL-04', 'CL-05', 'CL-06', 'CL-07', 'CL-08'].every((c) => t.includes(c)) && /2 of 3 people have a class/.test(t), t.replace(/s+/g, ' ').slice(0, 700));
  check('it shows who has not finished yet', /No class yet \(\d\)/.test(t) && /Nia Waiting/.test(t));
  check('and the shape of the team, with the classes nobody has', /The shape of your team/.test(t) && /No one is/.test(t));
  check('no scores or numbers out of 100 appear on this tab', !/\/100|score/i.test(t.replace(/Classes describe[^.]*\./, '')));

  // open a class that has people in it
  await p.$$eval('section button[aria-expanded]', (bs) => bs.find((x) => !x.disabled).click());
  await new Promise((r) => setTimeout(r, 1500));
  require('fs').writeFileSync(path.join(OUT, 't2.txt'), await body(p));
  await p.waitForFunction(() => !!document.querySelector('a[href^="/company/members/"]'), { timeout: 20000 });
  t = await body(p);
  check('opening a class lists its people (linking to their page) and who it pairs well with', /Pairs well with/.test(t) && /Eve Okafor|Tunde Bello/.test(t));
  await p.screenshot({ path: path.join(OUT, 'classes-1.png'), fullPage: true });

  // compare two people
  const selects = await p.$$('select');
  await selects[0].select(await selects[0].$$eval('option', (o) => o.find((x) => /Eve Okafor/.test(x.textContent)).value));
  await selects[1].select(await selects[1].$$eval('option', (o) => o.find((x) => /Tunde Bello/.test(x.textContent)).value));
  await new Promise((r) => setTimeout(r, 2000));
  require('fs').writeFileSync(path.join(OUT, 't3.txt'), await body(p));
  await p.waitForFunction(() => document.body.innerText.includes('Working with Eve'), { timeout: 15000 });
  t = await body(p);
  check('comparing two people shows both classes and a verdict on how they fit', /Strong match|Good match|Different styles|Same class/.test(t) && /Working with Tunde/.test(t));
  check('someone who has not finished cannot be picked for a comparison', !(await selects[0].$$eval('option', (o) => o.some((x) => /Nia Waiting/.test(x.textContent)))));
  await p.screenshot({ path: path.join(OUT, 'classes-2.png'), fullPage: true });

  // auto-match
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.$$eval('button', (bs) => bs.find((x) => x.textContent.trim() === 'Match staff').click());
  await p.waitForFunction(() => /1 group for 2 people/.test(document.body.innerText), { timeout: 30000 });
  t = await body(p);
  check('Match staff shows the suggested group, with the fit, and says it is only a suggestion', /Strong match|Good match|Same class|Different styles/.test(t) && /nothing is saved/i.test(t));
  check('and the button changes to Shuffle matches', await p.$$eval('button', (bs) => bs.some((x) => x.textContent.trim() === 'Shuffle matches')));
  await p.$$eval('button', (bs) => bs.find((x) => x.textContent.trim() === 'Shuffle matches').click());
  await p.waitForFunction(() => /1 group for 2 people/.test(document.body.innerText), { timeout: 30000 });
  await p.screenshot({ path: path.join(OUT, 'classes-3.png'), fullPage: true });

  // the people tab: a class column and a filter
  await p.goto(`${WEB}/company?tab=people`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(p, 'Eve Okafor');
  t = await body(p);
  check('the People tab shows each person’s class under their name', /CL-0[1-8]/.test(t));
  const filterIndex = await p.$$eval('select', (ss) => [...ss].findIndex((x) => [...x.options].some((o) => o.textContent === 'Everyone')));
  const filter = (await p.$$('select'))[filterIndex];
  await filter.select(await filter.$eval('option:nth-child(2)', (o) => o.value));
  await p.waitForFunction(() => /\d of \d/.test(document.body.innerText), { timeout: 20000 });
  t = await body(p);
  check('filtering by a class narrows the list', /[12] of 3/.test(t) && !/Nia Waiting/.test(t));

  // phone width
  await p.setViewport({ width: 390, height: 800 });
  await p.goto(`${WEB}/company?tab=classes`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(p, 'Your team by class');
  await new Promise((r) => setTimeout(r, 500));
  check('phone: the Classes tab does not scroll sideways', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await prisma.subscription.deleteMany({ where: { organization_id: org.id } });
  await finish();
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
