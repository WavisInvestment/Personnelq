import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor, UseInterceptors } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';

const KEY_FORMAT = /^[A-Za-z0-9_.:-]{8,200}$/;
const KEEP_MS = 24 * 60 * 60 * 1000;
/** A request that has been "in progress" longer than this died with its server; the key can be used again. */
const STALE_MS = 60 * 1000;

const problem = (status: HttpStatus, code: string, message: string) => new HttpException({ statusCode: status, code, message }, status);

/** JSON with keys in a fixed order, so the same body always hashes the same. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * Lets a caller retry a request without repeating its effect. Send an \`Idempotency-Key\` header (8 to 200 letters,
 * digits or _ . : -): the first request runs and its answer is kept for 24 hours; the same key with the same request
 * returns that answer again (with \`Idempotent-Replayed: true\`) instead of running again. The same key with a different
 * request is refused. A request that failed is not kept, so it can be retried with the same key after fixing the cause.
 * Without the header nothing changes. Keys belong to the signed-in person, so nobody can replay anyone else's.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const header = req.headers['idempotency-key'];
    if (header === undefined) return next.handle();

    const key = Array.isArray(header) ? header[0] : String(header);
    if (!KEY_FORMAT.test(key)) throw problem(HttpStatus.BAD_REQUEST, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8 to 200 characters: letters, digits and _ . : -');
    const userId: string | undefined = req.user?.id;
    if (!userId) return next.handle();

    const path = String(req.originalUrl).split('?')[0];
    const hash = createHash('sha256').update(`${req.method} ${path} ${stable(req.body ?? {})}`).digest('hex');

    const claim = await this.claim(userId, key, req.method, path, hash);
    if (claim.replay) {
      res.status(claim.replay.status);
      res.setHeader('Idempotent-Replayed', 'true');
      return of(claim.replay.body);
    }

    return next.handle().pipe(
      mergeMap(async (body) => {
        await this.prisma.idempotencyKey.update({
          where: { id: claim.id },
          data: { state: 'done', response_status: res.statusCode, response_body: body === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue) },
        });
        return body;
      }),
      catchError((err) => from(this.prisma.idempotencyKey.deleteMany({ where: { id: claim.id } })).pipe(mergeMap(() => throwError(() => err)))),
    );
  }

  /** Takes the key for this request, or says what to answer instead because it was used before. */
  private async claim(userId: string, key: string, method: string, path: string, hash: string): Promise<{ id: string; replay?: undefined } | { id?: undefined; replay: { status: number; body: unknown } }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const row = await this.prisma.idempotencyKey.create({ data: { user_id: userId, key, method, path, request_hash: hash, expires_at: new Date(Date.now() + KEEP_MS) }, select: { id: true } });
        return { id: row.id };
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      }

      const row = await this.prisma.idempotencyKey.findUnique({ where: { user_id_key: { user_id: userId, key } } });
      if (!row) continue; // deleted between our two queries: try to take it again
      const expired = row.expires_at.getTime() <= Date.now();
      const abandoned = row.state === 'in_progress' && Date.now() - row.created_at.getTime() > STALE_MS;
      if (expired || abandoned) {
        await this.prisma.idempotencyKey.deleteMany({ where: { id: row.id } });
        continue;
      }
      if (row.request_hash !== hash) throw problem(HttpStatus.UNPROCESSABLE_ENTITY, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request. Use a new key for a new request.');
      if (row.state === 'in_progress') throw problem(HttpStatus.CONFLICT, 'IDEMPOTENT_REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed. Wait a moment and retry.');
      return { replay: { status: row.response_status ?? HttpStatus.OK, body: row.response_body } };
    }
    throw problem(HttpStatus.CONFLICT, 'IDEMPOTENT_REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed. Wait a moment and retry.');
  }
}

/** Put on a POST route that changes things: it then honours the Idempotency-Key header. */
export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);
