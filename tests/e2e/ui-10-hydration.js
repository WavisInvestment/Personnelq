// Loads every kind of page in a real browser, in other time zones and languages, and fails on any React hydration
// complaint (server HTML that differs from what the browser builds) or invalid HTML nesting.
process.env.W5_TAG = 'hyd';
const { prisma, call, check, makeUser, assessments, finish, cleanup, puppeteer, CHROME } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 120000;
const HYDRATION = /hydrat|didn't match|did not match|cannot be a descendant|cannot contain|validateDOMNesting|In HTML,|Text content does not match|Minified React error #(418|419|422|423|425)/i;
const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });

(async () => {
  // ---- data: an administrator with a company, a person with a result and a public badge, and platform staff
  const admin = await makeUser('admin', { first: 'Ada', last: 'Boss' });
  const org = await prisma.organization.create({ data: { name: 'Hydration Co', slug: 'w5-hyd-co', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 5 * 86400000), auto_renew: false, seats_limit: 10 } });
  const person = await makeUser('person', { first: 'Pia', last: 'Person' });
  const inv = await call('POST', `/organizations/${org.id}/invitations`, admin.token, { emails: [`invitee-${Date.now()}@w5.test`] });
  const inviteToken = inv.body.invitations[0].link.split('/invite/')[1];
  const { full } = await assessments(person.token);
  const start = await call('POST', `/assessments/${full.id}/start`, person.token);
  const sub = start.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) await call('PUT', `/submissions/${sub.id}/answers`, person.token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: ((i + j) * 7) % 5 + 1 })) });
  const result = (await call('POST', `/submissions/${sub.id}/complete`, person.token)).body;
  const badge = await call('PUT', `/results/${result.id}/badge`, person.token, { is_public: true, show_scores: true, show_date: true });
  const badgeToken = badge.body.badge?.share_path?.replace('/b/', '') ?? badge.body.share_path?.replace('/b/', '');
  const staff = await makeUser('staff', { first: 'Sam', last: 'Staff' });
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'super_admin' } })).id } });

  const orgs = (r) => [{ id: org.id, name: org.name, slug: org.slug, type: 'corporate', role: r }];
  const session = (u, o = []) => ({ token: u.token, user: { id: u.id, email: u.email, first_name: u.first ?? 'Test', last_name: u.last ?? 'User', email_verified: true, platform_role: u.id === staff.id ? 'super_admin' : undefined, organizations: o } });
  const as = { none: null, person: session({ ...person, first: 'Pia', last: 'Person' }), admin: session({ ...admin, first: 'Ada', last: 'Boss' }, orgs('admin')), staff: session({ ...staff, first: 'Sam', last: 'Staff' }) };

  const PAGES = [
    ['/', 'none'], ['/auth/login', 'none'], ['/auth/signup', 'none'], ['/auth/signup?invite=' + inviteToken, 'none'], ['/auth/forgot-password', 'none'],
    ['/auth/reset-password?token=' + 'a'.repeat(64), 'none'], ['/auth/verify-email?token=' + 'b'.repeat(64), 'none'], ['/privacy', 'none'], ['/terms', 'none'],
    [`/b/${badgeToken}`, 'none'], ['/b/not-a-real-badge', 'none'], [`/invite/${inviteToken}`, 'none'], ['/does-not-exist', 'none'],
    ['/dashboard', 'person'], ['/results', 'person'], [`/results/${result.id}`, 'person'], ['/account', 'person'], ['/payments', 'person'], ['/assessments/snapshot', 'person'], ['/assessments/full', 'person'],
    ['/dashboard', 'admin'], ['/company', 'admin'], ['/company?tab=people', 'admin'], ['/company?tab=assessments', 'admin'], ['/company?tab=invitations', 'admin'], ['/billing', 'admin'],
    ['/admin', 'staff'], ['/admin/companies', 'staff'], ['/admin/individuals', 'staff'], ['/admin/payments', 'staff'], ['/admin/subscriptions', 'staff'], ['/admin/audit-log', 'staff'], ['/admin/roles', 'staff'],
  ];
  // other time zones and languages are what make server and browser disagree about dates, numbers and times
  const SETTINGS = [
    { name: 'Auckland / German / desktop', tz: 'Pacific/Auckland', lang: 'de-DE', w: 1280, h: 900 },
    { name: 'Los Angeles / US English / phone', tz: 'America/Los_Angeles', lang: 'en-US', w: 390, h: 800, mobile: true, publicOnly: true },
  ];

  // The dev server compiles each page the first time it is asked for, which is slow; do that up front, a few at a time.
  const queue = [...new Set(PAGES.map(([u]) => u))];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let u = queue.shift(); u; u = queue.shift()) await fetch(WEB + u).then((r) => r.text()).catch(() => undefined); }));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const found = [];
  for (const s of SETTINGS) {
    for (const [url, who] of PAGES.filter(([, w]) => !s.publicOnly || w === 'none')) {
      const page = await (await browser.createIncognitoBrowserContext()).newPage();
      await page.setViewport({ width: s.w, height: s.h, isMobile: !!s.mobile, hasTouch: !!s.mobile });
      await page.emulateTimezone(s.tz);
      await page.setExtraHTTPHeaders({ 'Accept-Language': s.lang });
      const messages = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && HYDRATION.test(m.text())) messages.push(m.text().replace(/\s+/g, ' ').slice(0, 300)); });
      page.on('pageerror', (e) => { if (HYDRATION.test(e.message)) messages.push(e.message.slice(0, 300)); });
      const a = as[who];
      if (a) await page.evaluateOnNewDocument((t, u) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('__seeded', '1'); } }, a.token, a.user);
      await page.goto(WEB + url, { waitUntil: 'load', timeout: LONG });
      // give the page time to hydrate, load its data and render it
      await page.waitForNetworkIdle({ idleTime: 1200, timeout: 60000 }).catch(() => undefined);
      console.log(`  ${messages.length ? 'MISMATCH' : 'clean   '} ${s.tz} ${who} ${url.slice(0, 60)}`);
      if (messages.length) found.push(`${s.name} | ${who} ${url}\n      ${[...new Set(messages)].join('\n      ')}`);
      await page.close();
    }
  }
  await browser.close();
  check(`no hydration or HTML-nesting complaints on ${PAGES.length} pages in ${SETTINGS.length} time zone and language settings`, found.length === 0, found.length ? `\n      ${found.slice(0, 6).join('\n      ')}` : '');
  if (found.length) console.log(found.join('\n'));

  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'w5-hyd' } } });
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await cleanup(); } catch {} process.exit(2); });
