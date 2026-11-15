import { Body, Controller, Get, Headers, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiError, parse, Public } from '../common/http';
import { SecurityService } from './security.service';

@Controller()
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  /** Sign-in of the admin web page (/admin/). Admin accounts cannot sign in through /auth/login. */
  @Public()
  @Post('admin/login')
  @HttpCode(200)
  adminLogin(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(128) }), body);
    return this.security.adminLogin(dto.username, dto.password, req.ip ?? 'unknown', String(req.headers['user-agent'] ?? ''));
  }

  /** Caddy forward_auth target for /download/ (Basic auth, 10 wrong passwords per IP then blocked). */
  @Public()
  @Get('internal/download-auth')
  async downloadAuth(@Headers('authorization') authorization: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      await this.security.checkDownload(authorization, req.ip ?? 'unknown');
      res.status(204).end();
    } catch (e) {
      if (!(e instanceof HttpException)) throw e;
      const status = e.getStatus();
      // Only a plain 401 asks the browser for the password again; a blocked IP gets a page that says so.
      if (status === 401) res.setHeader('WWW-Authenticate', 'Basic realm="Zenzy download", charset="UTF-8"');
      const retry = e instanceof ApiError ? e.extra.retry_after : undefined;
      if (typeof retry === 'number') res.setHeader('Retry-After', String(retry));
      res
        .status(status)
        .type('text/plain; charset=utf-8')
        .send(status === 403 ? 'Too many wrong passwords from this network. Try again tomorrow.\n' : 'Password required.\n');
    }
  }
}
