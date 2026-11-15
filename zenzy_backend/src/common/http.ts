import {
  ArgumentsHost,
  CanActivate,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { z, ZodError, ZodTypeAny } from 'zod';
import { AppConfig } from '../core/config';
import { Db } from '../core/db';
import { Role, UserDoc } from '../core/types';

/** Every error body is `{ code, message, timestamp }` (spec 5.3.1). */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    /** Extra fields added to the error body, e.g. `retry_after` in seconds. */
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ code, message }, status);
  }
}

export const Err = {
  badRequest: (code: string, message: string) => new ApiError(400, code, message),
  unauthorized: (code = 'UNAUTHENTICATED', message = 'Authentication required') => new ApiError(401, code, message),
  forbidden: (code = 'FORBIDDEN', message = 'Not allowed') => new ApiError(403, code, message),
  notFound: (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (code: string, message: string) => new ApiError(409, code, message),
  bannedKeyword: () => new ApiError(422, 'BANNED_KEYWORD', 'The text contains a word that is not allowed'),
  tooMany: (message = 'Too many attempts, try again later') => new ApiError(429, 'TOO_MANY_ATTEMPTS', message),
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Unexpected server error';
    let extra: Record<string, unknown> = {};
    if (exception instanceof ApiError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      extra = exception.extra;
      if (typeof extra.retry_after === 'number') res.setHeader('Retry-After', String(extra.retry_after));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : String((body as { message?: unknown }).message ?? exception.message);
      code =
        ({ 400: 'INVALID_INPUT', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 413: 'PAYLOAD_TOO_LARGE' } as Record<
          number,
          string
        >)[status] ?? 'HTTP_ERROR';
    } else if ((exception as { type?: string })?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_INPUT';
      message = 'Malformed JSON body';
    } else {
      this.log.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }
    res.status(status).json({ code, message, ...extra, timestamp: new Date().toISOString() });
  }
}

// ---------- validation ----------

/** Validates `data` against a zod schema; a failure is a 400 INVALID_INPUT. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  try {
    return schema.parse(data ?? {});
  } catch (e) {
    if (e instanceof ZodError) {
      const msg = e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      throw Err.badRequest('INVALID_INPUT', msg);
    }
    throw e;
  }
}

export const zId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character id')
  .transform((s) => new ObjectId(s));
export const zLat = z.coerce.number().min(-90).max(90);
export const zLng = z.coerce.number().min(-180).max(180);
export const zDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));
export const zUrl = z.string().url().max(1000).regex(/^https?:\/\//, 'must be an http(s) URL');

/** Path parameter to ObjectId; an id that cannot exist is a 404. */
export function oid(value: string): ObjectId {
  if (!/^[0-9a-fA-F]{24}$/.test(value)) throw Err.notFound();
  return new ObjectId(value);
}

// ---------- authentication ----------

export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDoc => ctx.switchToHttp().getRequest().user,
);

export function verifyAccessToken(token: string, secret: string): { sub: string; role: Role; exp?: number } | null {
  try {
    const p = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (p.typ !== 'access' || typeof p.sub !== 'string') return null;
    return { sub: p.sub, role: p.role, exp: p.exp };
  } catch {
    return null;
  }
}

/**
 * Global guard (NFR-15): every route needs a valid access token unless marked @Public().
 * The account is re-read on each request so a suspension or deletion takes effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = token ? verifyAccessToken(token, this.config.jwtSecret) : null;
    if (!payload || !ObjectId.isValid(payload.sub)) throw Err.unauthorized();

    const user = await this.db.users.findOne({ _id: new ObjectId(payload.sub) });
    if (!user) throw Err.unauthorized();
    if (user.status !== 'ACTIVE') {
      throw Err.forbidden('ACCOUNT_SUSPENDED', `Account suspended: ${user.suspend_reason ?? 'no reason given'}`);
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles?.length && !roles.includes(user.role)) throw Err.forbidden('FORBIDDEN', 'Admin role required');
    if (roles?.includes('ADMIN')) {
      // An IP blocked after wrong admin passwords cannot use the admin API either, even with a token.
      const blocked = await this.db.ipBlocks.findOne({ ip: req.ip ?? 'unknown', scope: 'ADMIN', until: { $gt: new Date() } });
      if (blocked) throw Err.forbidden('IP_BLOCKED', 'Too many wrong passwords from this network. Access is blocked for now.');
    }
    req.user = user;
    return true;
  }
}

// ---------- serialisation & pagination ----------

export const sid = (id: ObjectId | null | undefined): string | null => (id ? id.toHexString() : null);
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function publicUser(u: Pick<UserDoc, '_id' | 'username' | 'display_name' | 'avatar_url'> | null | undefined) {
  if (!u) return null;
  return { id: u._id.toHexString(), username: u.username, display_name: u.display_name, avatar_url: u.avatar_url };
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw Err.badRequest('INVALID_CURSOR', 'cursor is not valid');
  }
}

/** Keyset pagination on (created_at, _id), newest first. */
export function timeCursorFilter(cursor: string | undefined): Record<string, unknown> {
  const c = decodeCursor<{ t: string; id: string }>(cursor);
  if (!c) return {};
  if (!ObjectId.isValid(c.id) || Number.isNaN(Date.parse(c.t))) throw Err.badRequest('INVALID_CURSOR', 'cursor is not valid');
  const t = new Date(c.t);
  return { $or: [{ created_at: { $lt: t } }, { created_at: t, _id: { $lt: new ObjectId(c.id) } }] };
}

export function nextTimeCursor<T extends { _id: ObjectId; created_at: Date }>(docs: T[], limit: number): string | null {
  if (docs.length < limit) return null;
  const last = docs[docs.length - 1];
  return encodeCursor({ t: last.created_at.toISOString(), id: last._id.toHexString() });
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const point = (latitude: number, longitude: number) => ({ type: 'Point' as const, coordinates: [longitude, latitude] as [number, number] });
