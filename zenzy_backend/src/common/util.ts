import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { Doc } from './database.js';

/** Chuẩn hoá lỗi trả về: { code, message, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message = 'Lỗi máy chủ';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as any).message;
      message = Array.isArray(raw) ? raw.join(', ') : String(raw ?? exception.message);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json({ code: status, message, timestamp: new Date().toISOString() });
  }
}

/** Bỏ các trường nội bộ và đổi `_id` thành `id` trước khi trả về client. */
export function out(doc: Doc | null | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  if (!doc) return {};
  const { _id, order, seeded, owner_id, sender_id, joined_user_ids, password_hash, expires_at, view, ...rest } = doc;
  return { id: _id, ...rest, ...extra };
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}

/** Lấy chuỗi bắt buộc từ body, cắt khoảng trắng và giới hạn độ dài. */
export function text(body: any, field: string, max = 500, required = true): string {
  const value = typeof body?.[field] === 'string' ? body[field].trim() : '';
  if (required && !value) throw new BadRequestException(`Thiếu trường "${field}"`);
  if (value.length > max) throw new BadRequestException(`Trường "${field}" dài quá ${max} ký tự`);
  return value;
}

/** Giờ hiện tại ở Việt Nam, dạng "9:41 AM". */
export function clockText(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}

/** Hai chữ cái đầu của tên, ví dụ "Minh Anh" → "MA". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
