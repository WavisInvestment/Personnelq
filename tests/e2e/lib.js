// Shared helpers for the live checks. Everything is resolved relative to the repository, so this runs on any machine.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
/** Loads a package the way the API would see it (it may live in apps/api/node_modules or the root). */
const need = (name) => require(require.resolve(name, { paths: [path.join(ROOT, 'apps/api'), path.join(ROOT, 'apps/web'), ROOT] }));
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && fs.existsSync(p));
const bcrypt = need('bcrypt');
const { PrismaClient } = need('@prisma/client');
// These checks create and delete real rows, so they only ever run against a development or test database.
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/personnelq_dev';
if (!/(dev|test)/i.test(new URL(process.env.DATABASE_URL).pathname)) {
  console.error('Refusing to run: the database name must contain "dev" or "test" (set E2E_DATABASE_URL).');
  process.exit(2);
}

const prisma = new PrismaClient();
const API = process.env.W5_API || 'http://localhost:3101/api/v1';
const PW = 'Secure123!x';
const FAKE = { paystack: 'http://127.0.0.1:3190', claude: 'http://127.0.0.1:3191', resend: 'http://127.0.0.1:3192' };

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  let data = null, buffer = null;
  if (type.includes('application/json')) data = await res.json().catch(() => null);
  else if (type.includes('pdf')) buffer = Buffer.from(await res.arrayBuffer());
  else data = await res.text().catch(() => null);
  return { status: res.status, body: data, buffer, headers: res.headers, text: JSON.stringify(data) };
}
const fake = async (svc, path, method = 'GET', body) => {
  const res = await fetch(FAKE[svc] + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
};

// simple client-side pacing so a script never trips its own rate limits
const windows = {};
async function paced(key, limit, perMs, fn) {
  const now = Date.now();
  const w = (windows[key] = (windows[key] || []).filter((t) => now - t < perMs));
  if (w.length >= limit) { await sleep(perMs - (now - w[0]) + 300); return paced(key, limit, perMs, fn); }
  w.push(Date.now());
  return fn();
}

let counter = 0;
const tag = process.env.W5_TAG || 'x';
async function makeUser(label, { first = 'Test', last = 'User' } = {}) {
  const individual = await prisma.role.findFirstOrThrow({ where: { scope: 'account', key: 'individual' } });
  const email = `${label}-${tag}-${++counter}@w5.test`;
  const user = await prisma.user.create({ data: { email, first_name: first, last_name: last, password_hash: await bcrypt.hash(PW, 4), email_verified: true, account_role_id: individual.id } });
  const login = await paced('login', 8, 60000, () => call('POST', '/auth/login', null, { email, password: PW }));
  if (login.status !== 200) throw new Error(`login failed for ${email}: ${login.status} ${login.text}`);
  return { id: user.id, email, token: login.body.access_token };
}

let listerToken;
/** Company administrators and HR cannot list assessments (they do not take them); any ordinary person can, so use one. */
async function assessments(token) {
  let res = await call('GET', '/assessments', token);
  if (res.status === 403 && res.body?.code === 'COMPANY_STAFF_NO_ASSESSMENTS') {
    listerToken ??= (await makeUser('lister')).token;
    res = await call('GET', '/assessments', listerToken);
  }
  const list = res.body.data;
  return { snap: list.find((a) => a.slug === 'ocean-snapshot'), full: list.find((a) => a.slug === 'ocean-full'), list };
}

/** Records a settled payment directly, so other checks can start the paid assessment without going through checkout. */
async function grantPaid(user, assessmentId) {
  return prisma.payment.create({ data: { user_id: user.id, organization_id: null, amount: 5000, currency: 'NGN', status: 'success', payment_method: 'card', provider_reference: `w5-grant-${tag}-${++counter}`, payment_type: 'assessment', assessment_id: assessmentId, description: 'granted by test', processed_at: new Date() } });
}

async function takeAssessment(token, assessmentId, pattern = (i) => ((i * 7) % 5) + 1) {
  const start = await call('POST', `/assessments/${assessmentId}/start`, token);
  if (start.status !== 200) throw new Error(`start failed: ${start.status} ${start.text}`);
  const sub = start.body.submission;
  for (let i = 0; i < sub.questions.length; i += 10) {
    await call('PUT', `/submissions/${sub.id}/answers`, token, { answers: sub.questions.slice(i, i + 10).map((q, j) => ({ question_id: q.id, value: pattern(i + j) })) });
  }
  const done = await call('POST', `/submissions/${sub.id}/complete`, token);
  if (done.status !== 200) throw new Error(`complete failed: ${done.status} ${done.text}`);
  return done.body; // the result
}

async function cleanup() {
  // Published assessments are protected by database guards that also stop a company being deleted outright.
  // Test data only: switch the guards off just for the clean-up.
  const guards = [['Assessment', 'assessment_locked_guard'], ['AssessmentQuestion', 'assessment_question_locked_guard']];
  for (const [t, g] of guards) await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER ${g}`);
  let orgs;
  try {
    orgs = await prisma.organization.deleteMany({ where: { slug: { startsWith: `w5-${tag}` } } });
  } finally {
    for (const [t, g] of guards) await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER ${g}`);
  }
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: '@w5.test' } } });
  const payments = await prisma.payment.deleteMany({ where: { provider_reference: { startsWith: 'w5-grant' } } });
  return { orgs: orgs.count, users: users.count, payments: payments.count };
}

async function finish() {
  const gone = await cleanup();
  console.log(`cleanup: removed ${gone.users} users, ${gone.orgs} organisations`);
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

// Accepts the site's own confirm dialog whenever one opens (it replaced the browser's native confirm box).
global.autoConfirm = async (page) => {
  const install = () => {
    if (window.__autoConfirm) return;
    window.__autoConfirm = true;
    new MutationObserver(() => document.querySelector('dialog[open] [data-confirm=accept]')?.click()).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  };
  await page.evaluateOnNewDocument(install);
  await page.evaluate(install).catch(() => undefined);
};

module.exports = { ROOT, need, CHROME, get puppeteer() { return need('puppeteer'); }, prisma, call, fake, check, sleep, paced, makeUser, assessments, grantPaid, takeAssessment, finish, cleanup, PW, API, FAKE };
