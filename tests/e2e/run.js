#!/usr/bin/env node
/*
 * Runs the live checks end to end against throwaway servers:
 *   fake Paystack / Claude / Resend (3190-3192), the built API (3101) and, for browser suites, the website (3100).
 * Nothing here touches your normal dev servers or ports. The database must be a development or test one (see lib.js).
 *
 *   npm run build -w apps/api          # the API is run from dist/
 *   node tests/e2e/run.js              # everything
 *   node tests/e2e/run.js api          # API suites only (no browser needed)
 *   node tests/e2e/run.js ui           # browser suites only
 *   node tests/e2e/run.js launch       # any suite whose name contains "launch"
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const API_DIR = path.join(ROOT, 'apps/api');
const WEB_DIR = path.join(ROOT, 'apps/web');

// mode: how the API is started for that suite
const SUITES = [
  ['01-assessments.api', 'free'],
  ['02-payments.api', 'normal'],
  ['03-subscriptions.api', 'normal'],
  ['04-insights.api', 'normal'],
  ['05-reports-and-badges.api', 'normal'],
  ['06-company.api', 'normal'],
  ['07-custom-assessments.api', 'normal'],
  ['08-launch-flows.api', 'normal'],
  ['09-no-keys.api', 'bare'],
  ['10-payments-off.api', 'nopay'],
  ['11-load.api', 'normal'],
  ['12-safe-retries.api', 'normal'],
  ['13-admin-detail.api', 'normal'],
  ['14-staff-actions.api', 'normal'],
  ['15-company-admin.api', 'normal'],
  ['16-plan-switch.api', 'normal'],
  ['17-invite-account.api', 'normal'],
  ['18-classes.api', 'normal'],
  ['19-team-classes.api', 'normal'],
  ['ui-01-individual', 'normal'],
  ['ui-02-company', 'normal'],
  ['ui-03-reminders', 'normal'],
  ['ui-04-custom-assessments', 'normal'],
  ['ui-05-invitations', 'normal'],
  ['ui-06-departments', 'normal'],
  ['ui-07-admin-payments', 'normal'],
  ['ui-08-polish', 'normal'],
  ['ui-09-launch-flows', 'normal'],
  ['ui-10-hydration', 'free'],
  ['ui-11-admin-detail', 'normal'],
  ['ui-12-actions', 'normal'],
  ['ui-13-team-classes', 'normal'],
];

const filter = process.argv[2];
const chosen = SUITES.filter(([name]) => !filter || (filter === 'api' ? name.endsWith('.api') : filter === 'ui' ? name.startsWith('ui-') : name.includes(filter)));
if (chosen.length === 0) {
  console.error(`No suite matches "${filter}".`);
  process.exit(2);
}
const needsWeb = chosen.some(([name]) => name.startsWith('ui-') || name.startsWith('10-'));

const children = [];
const run = (cmd, args, opts) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  child.output = '';
  child.stdout.on('data', (d) => (child.output += d));
  child.stderr.on('data', (d) => (child.output += d));
  children.push(child);
  return child;
};
const kill = (child) => {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGKILL');
};
const waitFor = async (url, seconds, what) => {
  for (let i = 0; i < seconds; i++) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, { timeout: 4000 }, (res) => { res.resume(); resolve(res.statusCode < 500); });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what} did not start within ${seconds}s`);
};

const apiEnv = (mode) => {
  const env = { ...process.env, PORT: '3101', FRONTEND_URL: 'http://localhost:3100', NODE_ENV: 'development', TRUST_PROXY: '1', JOBS_ENABLED: 'false' };
  if (mode === 'bare') {
    for (const k of ['PAYSTACK_SECRET_KEY', 'PAYSTACK_BASE_URL', 'FULL_ASSESSMENT_PRICE', 'ASSESSMENT_PAYMENT_REQUIRED', 'SUBSCRIPTION_PLANS', 'CLAUDE_API_KEY', 'ANTHROPIC_BASE_URL', 'RESEND_API_KEY', 'RESEND_BASE_URL']) env[k] = '';
  } else {
    Object.assign(env, {
      PAYSTACK_SECRET_KEY: 'sk_test_fakefakefake1234', PAYSTACK_BASE_URL: 'http://127.0.0.1:3190',
      FULL_ASSESSMENT_PRICE: '5000', PAYMENT_CURRENCY: 'NGN', ASSESSMENT_PAYMENT_REQUIRED: 'true',
      SUBSCRIPTION_PLANS: JSON.stringify([
        { slug: 'team', name: 'Team', description: 'Up to 25 people', seats: 25, amount: 50000, billing_cycle: 'monthly' },
        { slug: 'organisation', name: 'Organisation', seats: 100, amount: 450000, currency: 'NGN', billing_cycle: 'annual' },
      ]),
      CLAUDE_API_KEY: 'sk-ant-api03-fakefakefake1234', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3191',
      RESEND_API_KEY: 're_fakefakefake1234', RESEND_BASE_URL: 'http://127.0.0.1:3192', FROM_EMAIL: 'noreply@test.example',
    });
  }
  if (mode === 'free') env.ASSESSMENT_PAYMENT_REQUIRED = 'false'; // the full assessment is free, as in a default dev setup
  if (mode === 'nopay') { env.PAYMENTS_ENABLED = 'false'; env.FREE_ORGANIZATION_SEATS = '3'; } else { env.PAYMENTS_ENABLED = 'true'; delete env.FREE_ORGANIZATION_SEATS; }
  return env;
};

let api = null;
async function startApi(mode) {
  // a fresh process per suite keeps rate limits from one suite out of the next
  kill(api);
  await new Promise((r) => setTimeout(r, 600));
  api = run(process.execPath, ['--enable-source-maps', 'dist/main'], { cwd: API_DIR, env: apiEnv(mode) });
  await waitFor('http://localhost:3101/api/health', 60, 'the API');
}

(async () => {
  if (!fs.existsSync(path.join(API_DIR, 'dist/main.js'))) {
    console.error('Build the API first:  npm run build -w apps/api');
    process.exit(2);
  }
  const tsconfig = path.join(WEB_DIR, 'tsconfig.json');
  const tsconfigBackup = needsWeb && fs.existsSync(tsconfig) ? fs.readFileSync(tsconfig) : null; // next dev edits it
  let failed = 0;
  const summary = [];
  try {
    run(process.execPath, [path.join(__dirname, 'fakes.js')], { cwd: __dirname });
    await waitFor('http://127.0.0.1:3192/__control/emails', 20, 'the fake services');
    if (needsWeb) {
      const next = require.resolve('next/dist/bin/next', { paths: [WEB_DIR, ROOT] });
      run(process.execPath, [next, 'dev', ...(process.env.WEB_TURBO ? ['--turbopack'] : []), '-p', '3100'], { cwd: WEB_DIR, env: { ...process.env, NEXT_DIST_DIR: '.next-test', NEXT_PUBLIC_API_PORT: '3101' } });
      await waitFor('http://localhost:3100/', 360, 'the website');
    }

    for (const [name, mode] of chosen) {
      await startApi(mode);
      const started = Date.now();
      const result = spawnSync(process.execPath, [path.join(__dirname, `${name}.js`)], { cwd: __dirname, encoding: 'utf8', timeout: (name === 'ui-10-hydration' ? 30 : 12) * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
      const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const passed = (out.match(/^PASS /gm) || []).length;
      const failedLines = out.split('\n').filter((l) => /^FAIL /.test(l) || /SCRIPT ERROR|TIMEOUT waiting/.test(l));
      const ok = result.status === 0 && failedLines.length === 0;
      if (!ok) failed++;
      summary.push(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(30)} ${String(passed).padStart(4)} checks  ${Math.round((Date.now() - started) / 1000)}s`);
      console.log(summary[summary.length - 1]);
      for (const l of failedLines.slice(0, 8)) console.log(`       ${l.slice(0, 220)}`);
      if (!ok && failedLines.length === 0) console.log(out.split('\n').slice(-12).join('\n'));
    }
  } finally {
    for (const c of children) kill(c);
    if (tsconfigBackup) fs.writeFileSync(tsconfig, tsconfigBackup);
    fs.rmSync(path.join(WEB_DIR, '.next-test'), { recursive: true, force: true });
  }
  console.log(`\n${failed ? `${failed} of ${chosen.length} suites FAILED` : `all ${chosen.length} suites passed`} (${os.hostname()})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  for (const c of children) kill(c);
  process.exit(2);
});
