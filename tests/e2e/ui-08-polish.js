process.env.W5_TAG = 'w8ui';
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, check, sleep, makeUser, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const LONG = 90000;
const body = (p) => p.evaluate(() => document.body.innerText);
const waitText = async (p, needle, timeout = LONG) => {
  try { await p.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle); }
  catch (e) { console.log('TIMEOUT waiting for', JSON.stringify(needle), 'PAGE:', (await body(p)).split(/\s+/).join(' ').slice(-400)); throw e; }
};
const clickText = (p, selector, label) => p.$$eval(selector, (els, l) => { const el = els.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no ' + l); el.click(); }, label);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const dialogOpen = (p) => p.evaluate(() => !!document.querySelector('dialog[open]'));
const inCompany = (userId, orgId) => prisma.organizationMember.count({ where: { user_id: userId, organization_id: orgId, status: 'active', deleted_at: null } });

(async () => {
  const role = (key) => prisma.role.findFirstOrThrow({ where: { scope: 'organization', key } });
  const admin = { ...(await makeUser('admin', { first: 'Ada', last: 'Boss' })), first: 'Ada', last: 'Boss' };
  const e1 = await makeUser('e1', { first: 'Eve', last: 'Okafor' });
  const e2 = await makeUser('e2', { first: 'Tunde', last: 'Bello' });
  const e3 = await makeUser('e3', { first: 'Kemi', last: 'Ade' });
  const staff = { ...(await makeUser('staff', { first: 'Sam', last: 'Staff' })), first: 'Sam', last: 'Staff' };
  await prisma.user.update({ where: { id: staff.id }, data: { platform_role_id: (await prisma.role.findFirstOrThrow({ where: { scope: 'platform', key: 'super_admin' } })).id } });
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-w8ui-acme', type: 'corporate', admin_name: 'Ada Boss', admin_email: admin.email } });
  await prisma.organizationMember.create({ data: { user_id: admin.id, organization_id: org.id, role_id: (await role('admin')).id } });
  for (const u of [e1, e2, e3]) await prisma.organizationMember.create({ data: { user_id: u.id, organization_id: org.id, role_id: (await role('employee')).id, consented_at: new Date() } });
  await prisma.subscription.create({ data: { organization_id: org.id, plan_name: 'Team', status: 'active', billing_cycle: 'monthly', amount: 50000, currency: 'NGN', start_date: new Date(), end_date: new Date(Date.now() + 30 * 86400000), auto_renew: false, seats_used: 3, seats_limit: 10 } });
  const adminOrgs = [{ id: org.id, name: org.name, slug: org.slug, type: 'corporate', role: 'admin' }];

  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const problems = [];
  let nativeDialogs = 0;
  const open = async (user, orgs, url, { w = 1440, h = 900, mobile = false, reduce = false } = {}) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
    if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('dialog', async (d) => { nativeDialogs++; await d.dismiss(); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 140)); });
    if (user) await page.evaluateOnNewDocument((t, u) => { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', 'x'); localStorage.setItem('user', JSON.stringify(u)); }, user.token, { id: user.id, email: user.email, first_name: user.first_name ?? user.first ?? 'Test', last_name: user.last ?? 'User', platform_role: user.platform ? 'super_admin' : undefined, organizations: orgs });
    await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    return page;
  };

  // ---------------------------------------------------------------- the confirm dialog, on "Remove" in People
  const p = await open(admin, adminOrgs, '/company');
  await p.waitForSelector('button[role=tab]', { timeout: LONG });
  await clickText(p, 'button[role=tab]', 'People');
  await waitText(p, 'Tunde Bello');
  const rowRemove = (name) => p.$$eval('tbody tr', (rows, n) => { rows.find((r) => r.innerText.includes(n)).querySelector('button').click(); }, name);

  await rowRemove('Tunde Bello');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  let t = await p.$eval('dialog[open]', (d) => d.innerText);
  check('dialog: appears in the page (not a browser box) and says what will happen, with a specific button', /Remove Tunde Bello\?/.test(t) && /keep their own results/.test(t) && /\nRemove$|Remove\s*$/.test(t.trim()));
  check('dialog: it is a modal with an accessible name and description', await p.$eval('dialog[open]', (d) => d.matches(':modal') && !!d.getAttribute('aria-labelledby') && !!d.getAttribute('aria-describedby')));
  check('dialog: for a destructive action focus starts on Cancel, so Enter cannot remove anyone by accident', await p.evaluate(() => document.activeElement?.getAttribute('data-confirm') === 'cancel'));
  await p.screenshot({ path: path.join(require('os').tmpdir(), 'w8-confirm-dialog.png') });
  await p.keyboard.press('Escape');
  await sleep(400);
  check('dialog: Escape closes it and nothing is removed', !(await dialogOpen(p)) && (await inCompany(e2.id, org.id)) === 1);

  await rowRemove('Tunde Bello');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  await p.mouse.click(8, 8); // the dimmed area outside the box
  await sleep(400);
  check('dialog: clicking outside closes it and nothing is removed', !(await dialogOpen(p)) && (await inCompany(e2.id, org.id)) === 1);

  await rowRemove('Tunde Bello');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  await p.click('dialog[open] [data-confirm=cancel]');
  await sleep(400);
  check('dialog: Cancel closes it and nothing is removed', !(await dialogOpen(p)) && (await inCompany(e2.id, org.id)) === 1);

  await rowRemove('Tunde Bello');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  await p.click('dialog[open] [data-confirm=accept]');
  await p.waitForFunction(() => !document.body.innerText.includes('Tunde Bello'), { timeout: LONG });
  check('dialog: the confirm button does it, and the dialog is gone', !(await dialogOpen(p)) && (await inCompany(e2.id, org.id)) === 0);

  // a non-destructive one: focus goes to the main action
  await clickText(p, 'button[role=tab]', 'Overview');
  await waitText(p, 'Remind');
  await clickText(p, 'button', 'Remind');
  await p.waitForSelector('dialog[open]', { timeout: LONG });
  check('dialog: a non-destructive question puts focus on its main button', await p.evaluate(() => document.activeElement?.getAttribute('data-confirm') === 'accept') && /Remind 2 people\?/.test(await p.$eval('dialog[open]', (d) => d.innerText)));
  await p.click('dialog[open] [data-confirm=cancel]');
  check('no browser-native confirm box appeared at any point', nativeDialogs === 0, String(nativeDialogs));

  // ---------------------------------------------------------------- viewport units, grain, icons, motion
  check('layout: the page frame uses dynamic viewport height, so phones do not jump when the address bar moves', await p.evaluate(() => !!document.querySelector('[class*="min-h-[100dvh]"]')));
  const grain = await p.evaluate(() => { const s = getComputedStyle(document.body, '::before'); return { opacity: s.opacity, events: s.pointerEvents, position: s.position }; });
  check('surface: a faint fixed grain layer that never intercepts clicks', grain.position === 'fixed' && grain.events === 'none' && parseFloat(grain.opacity) > 0 && parseFloat(grain.opacity) <= 0.1, JSON.stringify(grain));
  check('motion: the stat tiles cascade in', await p.evaluate(() => { const els = [...document.querySelectorAll('.stagger > *')]; return els.length >= 4 && getComputedStyle(els[0]).animationName === 'rise' && getComputedStyle(els[3]).animationDelay === '0.18s'; }));
  const calm = await open(admin, adminOrgs, '/company', { reduce: true });
  await calm.waitForSelector('.stagger > *', { timeout: LONG });
  check('motion: with "reduce motion" on, nothing animates', await calm.evaluate(() => [...document.querySelectorAll('.stagger > *')].every((el) => getComputedStyle(el).animationName === 'none')));
  await calm.close();

  const signup = await open(null, [], '/auth/signup');
  await signup.waitForSelector('input[name=password]', { timeout: LONG });
  check('icons: sign-up shows a proper icon on each account type, and the password eye toggles', (await signup.$$('label svg')).length >= 4 && await (async () => { await signup.click('button[aria-label="Show password"]'); return !!(await signup.$('button[aria-label="Hide password"] svg')); })());
  const bad = await open(null, [], '/auth/login');
  await bad.waitForSelector('input[name=email]', { timeout: LONG });
  await bad.type('input[name=email]', 'nobody@example.test');
  await bad.type('input[name=password]', 'WrongPass123!x');
  await clickText(bad, 'button', 'Sign in');
  await bad.waitForSelector('[role=alert]', { timeout: LONG });
  check('icons: an error message carries its icon from the icon set', !!(await bad.$('[role=alert] svg')));

  const adm = await open({ ...staff, platform: true }, [], '/admin');
  await waitText(adm, 'Overview');
  check('icons: the admin navigation has an icon for each of its pages', (await adm.$$('aside nav svg, nav[aria-label] svg')).length >= 6);
  await adm.screenshot({ path: path.join(require('os').tmpdir(), 'w8-admin.png') });

  // ---------------------------------------------------------------- legal pages and links
  const home = await open(null, [], '/');
  await waitText(home, 'Understand your personality');
  check('legal: the home page footer links to Privacy and Terms', (await home.$$eval('footer a', (a) => a.map((x) => x.getAttribute('href')))).filter((h) => h === '/privacy' || h === '/terms').length === 2);
  const meta = await home.evaluate(() => ({
    title: document.querySelector('meta[property="og:title"]')?.content,
    image: document.querySelector('meta[property="og:image"]')?.content,
    card: document.querySelector('meta[name="twitter:card"]')?.content,
  }));
  check('sharing: Open Graph title, image and a large-image Twitter card are set', !!meta.title && /\/og\.png$/.test(meta.image || '') && meta.card === 'summary_large_image', JSON.stringify(meta));
  const og = await fetch(WEB + '/og.png');
  const ogBytes = Buffer.from(await og.arrayBuffer());
  check('sharing: the picture is a real 1200 x 630 PNG', og.status === 200 && /image\/png/.test(og.headers.get('content-type')) && ogBytes.length > 5000 && ogBytes.readUInt32BE(16) === 1200 && ogBytes.readUInt32BE(20) === 630, `${og.status} ${ogBytes.length} bytes`);

  const priv = await open(null, [], '/privacy');
  await waitText(priv, 'Who can see your results');
  const pt = await body(priv);
  check('privacy: says who sees results, which services get which data, and that there is no tracking', /Anthropic/.test(pt) && /only your five dimension scores/i.test(pt) && /Paystack/.test(pt) && /Resend/.test(pt) && /advertising or analytics trackers/.test(pt) && /Your company/.test(pt));
  check('privacy: has its title, a date and a link back to the rest of the site', (await priv.title()).includes('Privacy') && /Last updated/.test(pt) && (await priv.$$eval('footer a', (a) => a.some((x) => x.getAttribute('href') === '/terms'))));
  const terms = await open(null, [], '/terms');
  await waitText(terms, 'What the results are');
  const tt = await body(terms);
  check('terms: covers what results are not, companies, payments and badges, and links to Privacy', /not a diagnosis/.test(tt) && /Companies and the people they invite/.test(tt) && /Paystack/.test(tt) && /Sharing your badge/.test(tt) && !!(await terms.$('article a[href="/privacy"]')));
  const dash = await open(e1, [], '/dashboard');
  await waitText(dash, 'Your journey');
  check('legal: signed-in pages end with a footer carrying the same two links', (await dash.$$eval('footer nav[aria-label=Legal] a', (a) => a.map((x) => x.getAttribute('href')))).join() === '/privacy,/terms');
  await dash.screenshot({ path: path.join(require('os').tmpdir(), 'w8-dashboard.png'), fullPage: true });

  for (const [label, url] of [['privacy', '/privacy'], ['terms', '/terms'], ['sign-up', '/auth/signup'], ['home', '/']]) {
    const m = await open(null, [], url, { w: 390, h: 844, mobile: true });
    await sleep(2500);
    check(`phone: ${label} has no sideways page scroll`, !(await overflow(m)));
    await m.close();
  }

  check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
