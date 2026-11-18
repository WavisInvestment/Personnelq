// Fake Paystack (3190), fake Anthropic (3191) and fake Resend (3192) for local end-to-end testing.
const http = require('http');
const crypto = require('crypto');

const SECRET = 'sk_test_fakefakefake1234';
const API_WEBHOOK = process.env.API_WEBHOOK_URL || 'http://127.0.0.1:3101/api/webhooks/paystack';

const readBody = (req) => new Promise((resolve) => { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => resolve(raw)); });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const html = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); };

// ------------------------------------------------------------------ Paystack
const txs = new Map();
const paystack = { initializeMode: 'ok', initializeCalls: 0, verifyCalls: 0, verifyMode: 'ok' };

function sendWebhook({ event, reference, secret = SECRET, tamper = false, rawOverride }) {
  const payload = rawOverride ?? JSON.stringify({ event, data: { reference, status: 'success' } });
  const signature = crypto.createHmac('sha512', secret).update(payload).digest('hex');
  const body = tamper ? payload.replace(reference, reference + 'x') : payload;
  return new Promise((resolve) => {
    const url = new URL(API_WEBHOOK);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let out = ''; res.on('data', (c) => (out += c)); res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.end(body);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const raw = req.method === 'POST' ? await readBody(req) : '';
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
  const authed = req.headers.authorization === `Bearer ${SECRET}`;

  if (url.pathname === '/transaction/initialize' && req.method === 'POST') {
    paystack.initializeCalls++;
    if (!authed) return json(res, 401, { status: false, message: 'Invalid key' });
    if (paystack.initializeMode === 'error') return json(res, 500, { status: false, message: 'Gateway exploded' });
    if (!body?.reference || !body?.amount || !body?.email) return json(res, 400, { status: false, message: 'Missing parameters' });
    txs.set(body.reference, { reference: body.reference, amount: body.amount, currency: body.currency, email: body.email, callback_url: body.callback_url, metadata: body.metadata, status: 'pending', channel: null, paid_at: null });
    return json(res, 200, { status: true, message: 'Authorization URL created', data: { authorization_url: `http://localhost:3190/pay/${body.reference}`, access_code: 'ac_' + crypto.randomBytes(4).toString('hex'), reference: body.reference } });
  }

  const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
  if (verify && req.method === 'GET') {
    paystack.verifyCalls++;
    if (!authed) return json(res, 401, { status: false, message: 'Invalid key' });
    if (paystack.verifyMode === 'down') return json(res, 503, { status: false, message: 'Service unavailable' });
    const tx = txs.get(decodeURIComponent(verify[1]));
    if (!tx) return json(res, 404, { status: false, message: 'Transaction reference not found' });
    return json(res, 200, { status: true, message: 'Verification successful', data: { status: tx.status, reference: tx.reference, amount: tx.amount, currency: tx.currency, paid_at: tx.paid_at, channel: tx.channel, customer: { email: tx.email }, authorization: { authorization_code: 'AUTH_secret', card_type: 'visa' } } });
  }

  // Refunds: accepted as pending (the normal first answer); modes let tests simulate Paystack refusing
  if (url.pathname === '/refund' && req.method === 'POST') {
    paystack.refundCalls = (paystack.refundCalls || 0) + 1;
    if (!authed) return json(res, 401, { status: false, message: 'Invalid key' });
    if (paystack.refundMode === 'refuse') return json(res, 400, { status: false, message: 'Transaction has already been fully reversed' });
    const tx = txs.get(body?.transaction);
    if (!tx || tx.status !== 'success') return json(res, 400, { status: false, message: 'Transaction not found or not successful' });
    return json(res, 200, { status: true, message: 'Refund has been queued for processing', data: { id: 9000 + paystack.refundCalls, status: 'pending', amount: tx.amount, currency: tx.currency } });
  }

  // The hosted checkout page the customer would see
  const pay = url.pathname.match(/^\/pay\/([^/]+)(\/(complete|cancel))?$/);
  if (pay && req.method === 'GET') {
    const tx = txs.get(pay[1]);
    if (!tx) return html(res, 404, '<h1>Unknown transaction</h1>');
    const back = `${tx.callback_url}?reference=${tx.reference}&trxref=${tx.reference}`;
    if (pay[3] === 'complete') { if (tx.status === 'pending') { tx.status = 'success'; tx.paid_at = new Date().toISOString(); tx.channel = 'card'; } res.writeHead(302, { Location: back }); return res.end(); }
    if (pay[3] === 'cancel') { res.writeHead(302, { Location: back }); return res.end(); }
    return html(res, 200, `<!doctype html><title>Fake Paystack</title><body style="font-family:sans-serif;max-width:420px;margin:60px auto"><h1>Fake Paystack checkout</h1><p id="amount">${tx.currency} ${(tx.amount / 100).toLocaleString()}</p><p>${tx.email}</p><p><a id="pay" href="/pay/${tx.reference}/complete">Pay now</a> &nbsp; <a id="cancel" href="/pay/${tx.reference}/cancel">Cancel</a></p></body>`);
  }

  // test controls
  if (url.pathname === '/__control/set' && req.method === 'POST') { const tx = txs.get(body.reference); if (!tx) return json(res, 404, { error: 'no such tx' }); Object.assign(tx, body.patch); return json(res, 200, tx); }
  if (url.pathname === '/__control/mode' && req.method === 'POST') { Object.assign(paystack, body); return json(res, 200, paystack); }
  if (url.pathname === '/__control/webhook' && req.method === 'POST') return json(res, 200, await sendWebhook(body));
  if (url.pathname === '/__control/state') return json(res, 200, { ...paystack, txs: [...txs.values()] });
  if (url.pathname === '/__control/reset' && req.method === 'POST') { txs.clear(); Object.assign(paystack, { initializeMode: 'ok', initializeCalls: 0, verifyCalls: 0, verifyMode: 'ok', refundMode: 'ok', refundCalls: 0 }); return json(res, 200, { ok: true }); }
  json(res, 404, { status: false, message: 'not found' });
}).listen(3190, '127.0.0.1', () => console.log('fake Paystack on 3190'));

// ------------------------------------------------------------------ Anthropic
const claude = { mode: 'ok', calls: 0, bodies: [], delay_ms: 0 };
const KEYS = ['personality', 'communication', 'leadership', 'working_style', 'relationship_style', 'strengths', 'blind_spots', 'recommendations'];
const insightsText = () => JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, { summary: `Fake summary for ${k}. It is written to be long enough to pass validation.`, points: [`Fake point one about ${k}`, `Fake point two about ${k}`, `Fake point three about ${k}`] }])));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const raw = req.method === 'POST' ? await readBody(req) : '';
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

  if (url.pathname === '/v1/messages' && req.method === 'POST') {
    claude.calls++; claude.bodies.push({ headers: { 'x-api-key': req.headers['x-api-key'], 'anthropic-version': req.headers['anthropic-version'] }, body });
    if (claude.delay_ms) await new Promise((r) => setTimeout(r, claude.delay_ms));
    if (!req.headers['x-api-key']) return json(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'missing key' } });
    let text = insightsText();
    if (claude.mode === 'error') return json(res, 500, { type: 'error', error: { type: 'api_error', message: 'upstream down with secret sk-ant-leak' } });
    if (claude.mode === 'always-prose') text = 'I would be happy to help with your reading, but here it is in prose instead.';
    if (claude.mode === 'prose-first' && claude.calls_this_job === undefined) { claude.calls_this_job = 1; text = 'Sure! Here is your reading:'; }
    else if (claude.mode === 'prose-first') claude.calls_this_job = undefined;
    if (claude.mode === 'fenced') text = '```json\n' + text + '\n```';
    return json(res, 200, { id: 'msg_fake', type: 'message', role: 'assistant', model: body?.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 400 } });
  }
  if (url.pathname === '/__control/mode' && req.method === 'POST') { Object.assign(claude, body); claude.calls_this_job = undefined; return json(res, 200, { mode: claude.mode, delay_ms: claude.delay_ms }); }
  if (url.pathname === '/__control/calls') return json(res, 200, { calls: claude.calls, last: claude.bodies[claude.bodies.length - 1] ?? null, all: claude.bodies });
  if (url.pathname === '/__control/reset' && req.method === 'POST') { Object.assign(claude, { mode: 'ok', calls: 0, bodies: [], delay_ms: 0, calls_this_job: undefined }); return json(res, 200, { ok: true }); }
  json(res, 404, { error: 'not found' });
}).listen(3191, '127.0.0.1', () => console.log('fake Anthropic on 3191'));

// ------------------------------------------------------------------ Resend
const emails = [];
const resend = { mode: 'ok' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const raw = req.method === 'POST' ? await readBody(req) : '';
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
  if (url.pathname === '/emails' && req.method === 'POST') {
    if (resend.mode === 'error') return json(res, 500, { name: 'application_error', message: 'Resend is down', statusCode: 500 });
    emails.push({ to: body.to, from: body.from, subject: body.subject, html: body.html, attachments: (body.attachments || []).map((a) => ({ filename: a.filename, base64Length: String(a.content || '').length, startsWithPdf: Buffer.from(String(a.content || ''), 'base64').slice(0, 4).toString() === '%PDF' })) });
    return json(res, 200, { id: 'em_' + emails.length });
  }
  if (url.pathname === '/__control/emails') return json(res, 200, emails);
  if (url.pathname === '/__control/mode' && req.method === 'POST') { Object.assign(resend, body); return json(res, 200, resend); }
  if (url.pathname === '/__control/reset' && req.method === 'POST') { emails.length = 0; resend.mode = 'ok'; return json(res, 200, { ok: true }); }
  json(res, 404, { error: 'not found' });
}).listen(3192, '127.0.0.1', () => console.log('fake Resend on 3192'));
