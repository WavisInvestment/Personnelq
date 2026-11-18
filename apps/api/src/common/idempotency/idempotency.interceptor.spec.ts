import { Prisma } from '@prisma/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

function setup(headers: Record<string, string> = { 'idempotency-key': 'key-12345678' }, body: unknown = { a: 1, b: 2 }) {
  const prisma: any = {
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({ id: 'k1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const res: any = { statusCode: 200, status: jest.fn(function (this: any, c: number) { this.statusCode = c; return this; }), setHeader: jest.fn() };
  const req: any = { headers, method: 'POST', originalUrl: '/api/v1/x?y=1', user: { id: 'u1' }, body };
  const ctx: any = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
  return { prisma, req, res, ctx, interceptor: new IdempotencyInterceptor(prisma) };
}
const handler = (value: unknown = { done: true }) => ({ handle: jest.fn(() => of(value)) });

describe('IdempotencyInterceptor', () => {
  it('does nothing without the header', async () => {
    const { interceptor, ctx, prisma } = setup({});
    const next = handler();
    await lastValueFrom(await interceptor.intercept(ctx, next));
    expect(next.handle).toHaveBeenCalled();
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('runs the first request, then stores its answer', async () => {
    const { interceptor, ctx, prisma, res } = setup();
    const out = await lastValueFrom(await interceptor.intercept(ctx, handler({ ok: 1 })));
    expect(out).toEqual({ ok: 1 });
    expect(prisma.idempotencyKey.create.mock.calls[0][0].data).toMatchObject({ user_id: 'u1', key: 'key-12345678', method: 'POST', path: '/api/v1/x' });
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { state: 'done', response_status: res.statusCode, response_body: { ok: 1 } } });
  });

  it('replays the stored answer for the same key and request, without running it', async () => {
    const first = setup();
    await lastValueFrom(await first.interceptor.intercept(first.ctx, handler()));
    const hash = first.prisma.idempotencyKey.create.mock.calls[0][0].data.request_hash;

    const { interceptor, ctx, prisma, res } = setup();
    prisma.idempotencyKey.create.mockRejectedValue(p2002());
    prisma.idempotencyKey.findUnique.mockResolvedValue({ id: 'k1', state: 'done', request_hash: hash, response_status: 201, response_body: { cached: true }, created_at: new Date(), expires_at: new Date(Date.now() + 1e6) });
    const next = handler();
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).resolves.toEqual({ cached: true });
    expect(next.handle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('hashes the same body the same way whatever the order of its fields', async () => {
    const a = setup(undefined, { a: 1, b: { y: 1, x: 2 } });
    const b = setup(undefined, { b: { x: 2, y: 1 }, a: 1 });
    await lastValueFrom(await a.interceptor.intercept(a.ctx, handler()));
    await lastValueFrom(await b.interceptor.intercept(b.ctx, handler()));
    expect(a.prisma.idempotencyKey.create.mock.calls[0][0].data.request_hash).toBe(b.prisma.idempotencyKey.create.mock.calls[0][0].data.request_hash);
  });

  it('refuses a key reused for a different request (422), and a request still running (409)', async () => {
    const fresh = () => ({ id: 'k1', request_hash: 'other', state: 'done', created_at: new Date(), expires_at: new Date(Date.now() + 1e6), response_status: 200, response_body: {} });
    const reused = setup();
    reused.prisma.idempotencyKey.create.mockRejectedValue(p2002());
    reused.prisma.idempotencyKey.findUnique.mockResolvedValue(fresh());
    await expect(reused.interceptor.intercept(reused.ctx, handler())).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' }, status: 422 });

    const running = setup();
    const first = setup();
    await lastValueFrom(await first.interceptor.intercept(first.ctx, handler()));
    running.prisma.idempotencyKey.create.mockRejectedValue(p2002());
    running.prisma.idempotencyKey.findUnique.mockResolvedValue({ ...fresh(), request_hash: first.prisma.idempotencyKey.create.mock.calls[0][0].data.request_hash, state: 'in_progress' });
    await expect(running.interceptor.intercept(running.ctx, handler())).rejects.toMatchObject({ response: { code: 'IDEMPOTENT_REQUEST_IN_PROGRESS' }, status: 409 });
  });

  it('takes over a key that expired or whose request died', async () => {
    for (const stale of [{ expires_at: new Date(Date.now() - 1) , state: 'done', created_at: new Date() }, { expires_at: new Date(Date.now() + 1e6), state: 'in_progress', created_at: new Date(Date.now() - 5 * 60 * 1000) }]) {
      const { interceptor, ctx, prisma } = setup();
      prisma.idempotencyKey.create.mockRejectedValueOnce(p2002()).mockResolvedValueOnce({ id: 'k2' });
      prisma.idempotencyKey.findUnique.mockResolvedValue({ id: 'old', request_hash: 'x', ...stale });
      const next = handler();
      await lastValueFrom(await interceptor.intercept(ctx, next));
      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({ where: { id: 'old' } });
      expect(next.handle).toHaveBeenCalled();
    }
  });

  it('forgets the key when the request fails, so it can be retried', async () => {
    const { interceptor, ctx, prisma } = setup();
    const next = { handle: jest.fn(() => throwError(() => new Error('boom'))) };
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).rejects.toThrow('boom');
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({ where: { id: 'k1' } });
    expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed key', async () => {
    for (const key of ['short', 'has spaces here!!', 'x'.repeat(201)]) {
      const { interceptor, ctx } = setup({ 'idempotency-key': key });
      await expect(interceptor.intercept(ctx, handler())).rejects.toMatchObject({ response: { code: 'INVALID_IDEMPOTENCY_KEY' }, status: 400 });
    }
  });

  it('ignores the header on a request that is not signed in (nothing to scope it to)', async () => {
    const { interceptor, ctx, req, prisma } = setup();
    req.user = undefined;
    const next = handler();
    await lastValueFrom(await interceptor.intercept(ctx, next));
    expect(next.handle).toHaveBeenCalled();
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });
});
