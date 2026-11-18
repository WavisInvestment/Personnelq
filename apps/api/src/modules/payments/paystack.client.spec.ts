import { createHmac } from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import { BillingConfigService } from '../../common/billing/billing-config.service';
import { PaystackClient, PaystackError, verifyPaystackSignature } from './paystack.client';

const SECRET = 'sk_test_abcdef1234567890';
const sign = (body: string, secret = SECRET) => createHmac('sha512', secret).update(body).digest('hex');

describe('verifyPaystackSignature', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'pb_123', amount: 500000 } });

  it('accepts the correct HMAC-SHA512 of the raw body', () => {
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyPaystackSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('accepts an upper-case signature', () => {
    expect(verifyPaystackSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a body that was changed after signing, even by one character', () => {
    expect(verifyPaystackSignature(body.replace('500000', '500001'), sign(body), SECRET)).toBe(false);
    expect(verifyPaystackSignature(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyPaystackSignature(body, sign(body, 'sk_test_someoneelse12345'), SECRET)).toBe(false);
  });

  it('rejects a missing, empty, truncated or non-hex signature', () => {
    for (const bad of [undefined, '', sign(body).slice(0, 64), 'not-hex', sign(body) + '00']) {
      expect(verifyPaystackSignature(body, bad as any, SECRET)).toBe(false);
    }
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyPaystackSignature(body, sign(body, ''), null)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body), null)).toBe(false);
  });

  it('is computed over the exact bytes, not a re-serialised copy', () => {
    const spaced = '{ "event": "charge.success",  "data": {"reference":"pb_123"} }';
    const reserialised = JSON.stringify(JSON.parse(spaced));
    expect(verifyPaystackSignature(spaced, sign(spaced), SECRET)).toBe(true);
    expect(verifyPaystackSignature(reserialised, sign(spaced), SECRET)).toBe(false);
  });
});

describe('PaystackClient (against a real local HTTP server)', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequest: { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: any };
  let respond: (req: http.IncomingMessage, body: any) => { status: number; json: unknown };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : null;
        lastRequest = { method: req.method, url: req.url, headers: req.headers, body };
        const { status, json } = respond(req, body);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(
    () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  );

  const client = (env: Record<string, string> = {}) =>
    new PaystackClient(new BillingConfigService({ get: (k: string) => ({ PAYSTACK_SECRET_KEY: SECRET, PAYSTACK_BASE_URL: baseUrl, ...env })[k] } as any));

  it('initialises a transaction, sending the secret key and the exact payload', async () => {
    respond = () => ({ status: 200, json: { status: true, message: 'ok', data: { authorization_url: 'https://checkout.example/abc', access_code: 'ac_1', reference: 'pb_1' } } });

    const result = await client().initialize({
      email: 'a@b.com',
      amount: 500000,
      currency: 'NGN',
      reference: 'pb_1',
      callback_url: 'http://localhost:3000/payments/callback',
      metadata: { type: 'assessment' },
    });

    expect(result).toEqual({ authorization_url: 'https://checkout.example/abc', access_code: 'ac_1', reference: 'pb_1' });
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/transaction/initialize');
    expect(lastRequest.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(lastRequest.body).toMatchObject({ email: 'a@b.com', amount: 500000, currency: 'NGN', reference: 'pb_1' });
  });

  it('verifies a transaction and returns only the fields we use, in a stable shape', async () => {
    respond = () => ({
      status: 200,
      json: { status: true, data: { status: 'success', reference: 'pb_1', amount: 500000, currency: 'NGN', paid_at: '2026-10-01T10:00:00.000Z', channel: 'card', customer: { email: 'a@b.com' }, authorization: { secret: 'never-leak' } } },
    });

    const tx = await client().verify('pb_1');

    expect(tx).toEqual({ status: 'success', reference: 'pb_1', amount: 500000, currency: 'NGN', paid_at: '2026-10-01T10:00:00.000Z', channel: 'card', customer_email: 'a@b.com' });
    expect(lastRequest.url).toBe('/transaction/verify/pb_1');
  });

  it('url-encodes the reference so it cannot change the request path', async () => {
    respond = () => ({ status: 200, json: { status: true, data: { status: 'failed', reference: 'x', amount: 1, currency: 'NGN' } } });
    await client().verify('../../admin?x=1');
    expect(lastRequest.url).toBe('/transaction/verify/..%2F..%2Fadmin%3Fx%3D1');
  });

  it('turns Paystack rejecting a request (HTTP 4xx with a message) into a PaystackError', async () => {
    respond = () => ({ status: 401, json: { status: false, message: 'Invalid key' } });
    await expect(client().verify('pb_1')).rejects.toMatchObject({ name: 'PaystackError', message: 'Invalid key', status: 401 });
  });

  it('turns "status: false" in a 200 reply into a PaystackError', async () => {
    respond = () => ({ status: 200, json: { status: false, message: 'Transaction reference not found' } });
    await expect(client().verify('nope')).rejects.toBeInstanceOf(PaystackError);
  });

  it('turns an unreachable server into a PaystackError rather than a raw network error', async () => {
    await expect(client({ PAYSTACK_BASE_URL: 'http://127.0.0.1:1' }).verify('pb_1')).rejects.toBeInstanceOf(PaystackError);
  });

  it('refuses to call Paystack at all when no valid key is configured', async () => {
    respond = () => ({ status: 200, json: { status: true, data: {} } });
    lastRequest = { headers: {}, body: null };
    await expect(client({ PAYSTACK_SECRET_KEY: 'sk_test_xxxxx' }).verify('pb_1')).rejects.toThrow('not configured');
    expect(lastRequest.method).toBeUndefined();
  });
});
