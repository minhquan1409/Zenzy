import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * ID người dùng từ header `Authorization: Bearer <jwt>`.
 * Không có header → null (khách). Token sai hoặc hết hạn → 401.
 */
export function userIdOf(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token không hợp lệ');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
    return payload.sub;
  } catch {
    throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
  }
}

/** Bắt buộc đăng nhập. Dùng cho mọi route ghi dữ liệu. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!userIdOf(req)) throw new UnauthorizedException('Cần đăng nhập');
    return true;
  }
}
