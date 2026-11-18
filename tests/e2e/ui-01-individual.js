process.env.W5_TAG = 'ui';
const fs = require('fs');
const path = require('path');
const puppeteer = require('./lib').puppeteer;
const { prisma, call, fake, check, sleep, makeUser, assessments, takeAssessment, finish } = require('./lib');

const WEB = 'http://localhost:3100';
const OUT = path.join(require('os').tmpdir(), 'w5-shots');
const DL = path.join(require('os').tmpdir(), 'w5-downloads');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
const LONG = 90000;

const body = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, needle, timeout = LONG) => page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
const clickButton = (page, label) => page.$$eval('button', (b, l) => { const el = b.find((x) => x.textContent.trim().startsWith(l)); if (!el) throw new Error('no button: ' + l); el.click(); }, label);
const hasButton = (page, label) => page.$$eval('button', (b, l) => b.some((x) => x.textContent.trim().startsWith(l)), label);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

async function login(page, user, first = 'Test', last = 'User') {
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('access_token', t);
    localStorage.setItem('refresh_token', 'unused');
    localStorage.setItem('user', JSON.stringify(u));
  }, user.token, { id: user.id, email: user.email, first_name: first, last_name: last, organizations: user.organizations ?? [] });
}

(async () => {
  await fake('resend', '/__control/reset', 'POST'); await fake('claude', '/__control/reset', 'POST');
  const ada = await makeUser('ada', { first: 'Ada', last: 'Uzo' });
  const { full } = await assessments(ada.token);

  const browser = await puppeteer.launch({ executablePath: require('./lib').CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await login(page, ada, 'Ada', 'Uzo');

  // ---------------------------------------------------------------- pay
  await page.goto(`${WEB}/assessments/full`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(page, 'Pay ');
  let t = await body(page);
  check('intro: shows the price on the pay button', /Pay ₦5,000 and begin/.test(t), t.match(/Pay [^\n]*/)?.[0]);
  check('intro: no "Begin" button before paying', !(await hasButton(page, 'Begin')));
  await page.screenshot({ path: path.join(OUT, '1-intro-pay.png') });

  await clickButton(page, 'Pay ');
  await page.waitForFunction(() => location.host === 'localhost:3190', { timeout: LONG });
  check('checkout: sent to the Paystack hosted page', /\/pay\/pb_/.test(page.url()));
  const amountText = await page.$eval('#amount', (e) => e.textContent);
  check('checkout: Paystack shows the server-set amount (NGN 5,000)', /5,000/.test(amountText), amountText);

  await page.click('#pay');
  await page.waitForFunction(() => location.host === 'localhost:3100' && location.pathname === '/payments/callback', { timeout: LONG });
  await waitText(page, 'Payment received');
  t = await body(page);
  check('callback: confirms the payment with amount and reference', /Payment received/.test(t) && /₦5,000/.test(t) && /pb_[0-9a-f]{24}/.test(t));
  check('callback: offers to begin the assessment', /Begin the assessment/.test(t));
  await page.screenshot({ path: path.join(OUT, '2-callback-success.png') });
  const receipts = (await fake('resend', '/__control/emails')).filter((m) => /Receipt/.test(m.subject));
  check('callback: a receipt was emailed to the payer', receipts.length === 1 && receipts[0].to === ada.email);

  // refreshing the callback is harmless
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Payment received');
  check('callback: reloading it still shows success and sends no second receipt', (await fake('resend', '/__control/emails')).filter((m) => /Receipt/.test(m.subject)).length === 1);

  await page.goto(`${WEB}/assessments/full`, { waitUntil: 'domcontentloaded' });
  await waitText(page, 'Begin');
  check('intro: after paying the button is "Begin"', await hasButton(page, 'Begin'));

  // cancelled payment path
  const cancelUser = await makeUser('cancel', { first: 'Cy', last: 'Cancel' });
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1440, height: 900 });
  await login(p2, cancelUser, 'Cy', 'Cancel');
  await p2.goto(`${WEB}/assessments/full`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(p2, 'Pay ');
  await clickButton(p2, 'Pay ');
  await p2.waitForFunction(() => location.host === 'localhost:3190', { timeout: LONG });
  await p2.click('#cancel');
  await p2.waitForFunction(() => location.pathname === '/payments/callback', { timeout: LONG });
  // verify stays "pending" for an abandoned payment, so the page waits, then reassures
  await waitText(p2, 'Confirming your payment'); // the first visit compiles the page in development, which can take a while
  await sleep(1500);
  t = await body(p2);
  check('callback: an unpaid return shows "confirming", not a false success', /Confirming your payment/.test(t) && !/Payment received/.test(t), t.replace(/\s+/g, ' ').slice(0, 300));
  await fake('paystack', '/__control/set', 'POST', { reference: new URL(p2.url()).searchParams.get('reference'), patch: { status: 'failed' } });
  await waitText(p2, 'didn’t go through', 30000);
  check('callback: a failed payment says so and that nothing was charged', /haven’t been charged/.test(await body(p2)));
  await p2.screenshot({ path: path.join(OUT, '3-callback-failed.png') });
  await p2.close();

  // ---------------------------------------------------------------- history
  await page.goto(`${WEB}/payments`, { waitUntil: 'domcontentloaded' });
  await waitText(page, 'Payment history');
  await waitText(page, 'Paid');
  t = await body(page);
  check('history: lists the payment as Paid with amount', /Paid/.test(t) && /₦5,000/.test(t) && /Full personality|Full/.test(t));
  check('history: never shows the gateway url or access code', !/localhost:3190|ac_[0-9a-f]{8}|authorization/i.test(await page.content()));
  await page.screenshot({ path: path.join(OUT, '4-payments.png') });

  // ---------------------------------------------------------------- result: insights, pdf, email, badge
  const result = await takeAssessment(ada.token, full.id);
  await page.goto(`${WEB}/results/${result.id}`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(page, 'Your written insights');
  check('result: offers to write insights (none yet)', await hasButton(page, 'Write my insights'));
  check('result: shows report and badge panels', /Your report/.test(await body(page)) && /Share your badge/.test(await body(page)));
  await page.screenshot({ path: path.join(OUT, '5-result-before.png'), fullPage: true });

  await clickButton(page, 'Write my insights');
  await waitText(page, 'How you communicate', LONG);
  t = await body(page);
  const sections = ['Your personality', 'How you communicate', 'How you lead', 'How you work', 'How you relate to others', 'Your strengths', 'Possible blind spots', 'Where to go from here'];
  check('insights: all eight sections appear', sections.every((s) => t.includes(s)));
  check('insights: labelled as AI-generated and not a diagnosis', /not a diagnosis/.test(t));
  await page.screenshot({ path: path.join(OUT, '6-result-insights.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'How you communicate');
  check('insights: still there after reload (saved, not regenerated)', (await fake('claude', '/__control/calls')).calls === 1, JSON.stringify((await fake('claude', '/__control/calls')).calls));

  await clickButton(page, 'Download PDF');
  let file = null;
  for (let i = 0; i < 60 && !file; i++) { await sleep(500); file = fs.readdirSync(DL).find((f) => f.endsWith('.pdf')); }
  const pdfBytes = file ? fs.readFileSync(path.join(DL, file)) : null;
  check('pdf: the button downloads a dated PDF file', !!file && /^Ada-Uzo-personality-report-\d{4}-\d{2}-\d{2}\.pdf$/.test(file), file);
  check('pdf: and it is a real PDF', !!pdfBytes && pdfBytes.slice(0, 5).toString() === '%PDF-' && pdfBytes.length > 20000, String(pdfBytes?.length));

  await clickButton(page, 'Email it to me');
  await waitText(page, 'Sent. Check your inbox', 60000);
  const mail = (await fake('resend', '/__control/emails')).filter((m) => /results/.test(m.subject)).pop();
  check('email: the report went to the account email with a PDF attached', mail?.to === ada.email && mail.attachments?.length === 1);

  // badge
  check('badge: starts private', /Private/.test(await body(page)));
  await clickButton(page, 'Turn sharing on');
  await waitText(page, 'Your badge is live');
  const link = await page.$eval('input[aria-label="Badge link"]', (i) => i.value);
  check('badge: a share link is shown', /\/b\/[A-Za-z0-9_-]{43}$/.test(link), link);
  await page.screenshot({ path: path.join(OUT, '7-badge-panel.png') });

  const anon = await browser.createIncognitoBrowserContext();
  const pub = await anon.newPage();
  await pub.setViewport({ width: 1440, height: 900 });
  pub.on('pageerror', (e) => problems.push('public pageerror: ' + e.message));
  await pub.goto(link.replace('localhost:3100', 'localhost:3100'), { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(pub, 'Ada');
  t = await body(pub);
  check('public badge: anyone (no login) sees the name and the class, and no trait scores', /Ada/.test(t) && /CL-0[1-8]/.test(t) && !['Curiosity', 'Discipline', 'Energy', 'Warmth', 'Sensitivity'].some((x) => t.includes(x)) && !/\/100/.test(t));
  check('public badge: shows no email, no insights, no account details', !t.includes(ada.email) && !/How you lead/.test(t));
  check('public badge: marked noindex', (await pub.$eval('meta[name=robots]', (m) => m.content).catch(() => '')).includes('noindex'));
  await pub.screenshot({ path: path.join(OUT, '8-public-badge.png'), fullPage: true });
  check('public badge: fits the screen', !(await overflow(pub)));

  // hide scores and show descriptions, add a message
  await page.$eval('textarea', (el) => { el.focus(); });
  await page.type('textarea', 'Open to mentoring');
  const boxes = await page.$$('fieldset input[type=checkbox]');
  await boxes[0].click(); // scores off
  await boxes[1].click(); // readings on
  await clickButton(page, 'Save changes');
  await waitText(page, 'Saved. Your badge is live.');
  await pub.reload({ waitUntil: 'domcontentloaded' });
  await waitText(pub, 'Open to mentoring');
  t = await body(pub);
  check('public badge: follows the owner’s new choices (message shown, scores hidden)', !/\/100/.test(t) && /Open to mentoring/.test(t));

  // off, then confirm the link is dead
  await clickButton(page, 'Turn sharing off');
  await waitText(page, 'Sharing is off');
  await pub.reload({ waitUntil: 'domcontentloaded' });
  await waitText(pub, 'This badge isn’t available');
  check('public badge: once sharing is off the link shows a calm "not available" page', true);
  await pub.screenshot({ path: path.join(OUT, '9-public-gone.png') });
  const bogus = await anon.newPage();
  await bogus.goto(`${WEB}/b/${'a'.repeat(43)}`, { waitUntil: 'domcontentloaded' });
  await waitText(bogus, 'This badge isn’t available');
  check('public badge: a made-up link shows the same page (reveals nothing)', true);
  await anon.close();

  // ---------------------------------------------------------------- phone widths
  for (const [label, url] of [['result', `/results/${result.id}`], ['payments', '/payments'], ['intro', '/assessments/snapshot']]) {
    const m = await browser.newPage();
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await login(m, ada, 'Ada', 'Uzo');
    await m.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: LONG });
    await sleep(2500);
    check(`phone: ${label} has no sideways scrolling`, !(await overflow(m)));
    if (label === 'result') await m.screenshot({ path: path.join(OUT, '10-phone-result.png'), fullPage: true });
    await m.close();
  }

  // ---------------------------------------------------------------- company billing
  const orgAdmin = await makeUser('boss', { first: 'Bola', last: 'Boss' });
  const adminRole = await prisma.role.findFirstOrThrow({ where: { scope: 'organization', key: 'admin' } });
  const org = await prisma.organization.create({ data: { name: 'Acme Test Co', slug: 'w5-ui-acme', type: 'company', admin_name: 'Bola Boss', admin_email: orgAdmin.email } });
  await prisma.organizationMember.create({ data: { user_id: orgAdmin.id, organization_id: org.id, role_id: adminRole.id } });
  orgAdmin.organizations = [{ id: org.id, name: org.name, slug: org.slug, type: 'company', role: 'admin' }];
  const b = await browser.newPage();
  await b.setViewport({ width: 1440, height: 900 });
  await login(b, orgAdmin, 'Bola', 'Boss');
  await b.goto(`${WEB}/billing`, { waitUntil: 'domcontentloaded', timeout: LONG });
  await waitText(b, 'Choose a plan');
  t = await body(b);
  check('billing: shows no plan yet and the two configured plans with prices', /don’t have a plan yet/.test(t) && /Team/.test(t) && /₦50,000/.test(t) && /Organisation/.test(t) && /₦450,000/.test(t) && /year/.test(t));
  await b.screenshot({ path: path.join(OUT, '11-billing.png'), fullPage: true });
  await clickButton(b, 'Choose Team');
  await b.waitForFunction(() => location.host === 'localhost:3190', { timeout: LONG });
  await b.click('#pay');
  await b.waitForFunction(() => location.pathname === '/payments/callback', { timeout: LONG });
  await waitText(b, 'Your plan is active');
  await b.goto(`${WEB}/billing`, { waitUntil: 'domcontentloaded' });
  await waitText(b, 'is active');
  t = await body(b);
  check('billing: after paying, the Team plan shows active with 25 seats', /Team/.test(t) && /is active/.test(t) && /0 of 25 seats/.test(t), t.match(/Team[^\n]*\n[^\n]*/)?.[0]);
  await b.screenshot({ path: path.join(OUT, '12-billing-active.png'), fullPage: true });

  const plain = await makeUser('plain', { first: 'Pat', last: 'Plain' });
  const c = await browser.newPage();
  await login(c, plain, 'Pat', 'Plain');
  await c.goto(`${WEB}/billing`, { waitUntil: 'domcontentloaded' });
  await waitText(c, 'managed by a company administrator');
  check('billing: an ordinary person sees a polite "ask your admin" page', true);

  check('no page errors or console errors during the whole run', problems.length === 0, problems.slice(0, 3).join(' | '));
  await browser.close();
  console.log('screenshots in', OUT);
  await finish();
})().catch(async (e) => { console.error('SCRIPT ERROR', e); try { await require('./lib').cleanup(); } catch {} process.exit(2); });
