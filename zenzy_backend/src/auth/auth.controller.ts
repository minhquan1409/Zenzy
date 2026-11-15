import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, parse, Public } from '../common/http';
import { UserDoc } from '../core/types';
import { AuthService } from './auth.service';

export const zUsername = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, 'must be 3-30 characters: letters, digits, "_" or "."');

export const zPassword = z.string().min(8, 'must be at least 8 characters').max(128);

export const zEmail = z.string().trim().toLowerCase().email('must be a valid e-mail').max(254);

export const zDateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()) && d < new Date() && d.getUTCFullYear() >= 1900, 'must be a real past date');

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Sign-up step 1: e-mails a 6-digit code. The account is created by POST /auth/register/verify. */
  @Public()
  @Post('register')
  @HttpCode(202)
  register(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ username: zUsername, password: zPassword, date_of_birth: zDateOfBirth, email: zEmail }), body);
    return this.auth.register(dto.username, dto.password, dto.date_of_birth, dto.email, req.ip ?? 'unknown');
  }

  /** Sign-up step 2: the code from the e-mail creates the account and returns its tokens. */
  @Public()
  @Post('register/verify')
  verifySignup(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ email: zEmail, code: z.string().regex(/^\d{6}$/, 'must be 6 digits') }), body);
    return this.auth.verifySignup(dto.email, dto.code, req.ip ?? 'unknown');
  }

  /** Sends a new sign-up code to the address of a pending sign-up. */
  @Public()
  @Post('register/resend')
  @HttpCode(202)
  resendSignupCode(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ email: zEmail }), body);
    return this.auth.resendSignupCode(dto.email, req.ip ?? 'unknown');
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(128) }), body);
    return this.auth.login(dto.username, dto.password, req.ip ?? 'unknown');
  }

  /** Forgot password step 1: e-mail a 6-digit code to the account's address. */
  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(z.object({ login: z.string().trim().min(1).max(254) }), body);
    return this.auth.forgotPassword(dto.login, req.ip ?? 'unknown');
  }

  /** Forgot password step 2: the code plus the new password; the old password is not needed. */
  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const dto = parse(
      z.object({ login: z.string().trim().min(1).max(254), code: z.string().regex(/^\d{6}$/, 'must be 6 digits'), new_password: zPassword }),
      body,
    );
    await this.auth.resetPassword(dto.login, dto.code, dto.new_password, req.ip ?? 'unknown');
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  google(@Body() body: unknown) {
    const dto = parse(
      // username is optional: without it the server derives one from the Google e-mail.
      z.object({ id_token: z.string().min(1), username: zUsername.nullish(), date_of_birth: zDateOfBirth.nullish() }),
      body,
    );
    return this.auth.googleSignIn(dto.id_token, dto.username, dto.date_of_birth);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const dto = parse(z.object({ refresh_token: z.string().min(1) }), body);
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ refresh_token: z.string().min(1) }), body);
    await this.auth.logout(user._id, dto.refresh_token);
  }
}
