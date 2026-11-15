import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { zEmail, zPassword } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, oid, parse, zUrl } from '../common/http';
import { RateLimit } from '../core/abuse.service';
import { UserDoc } from '../core/types';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: UserDoc) {
    return this.users.me(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(
      z
        .object({
          display_name: z.string().trim().min(1).max(50),
          avatar_url: zUrl.nullable(),
          bio: z.string().trim().max(200),
          email: zEmail.nullable(),
          // Re-authentication, required only when the e-mail changes (it is the password-reset address).
          current_password: z.string().min(1).max(128),
          id_token: z.string().min(1),
        })
        .partial(),
      body,
    );
    const { current_password, id_token, ...patch } = dto;
    return this.users.updateProfile(user, patch, { password: current_password, idToken: id_token });
  }

  @Put('me/password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(
      // refresh_token (optional): the caller's own session, kept while every other session is signed out.
      z.object({ current_password: z.string().min(1), new_password: zPassword, refresh_token: z.string().min(1).optional() }),
      body,
    );
    await this.auth.changePassword(user._id, dto.current_password, dto.new_password, dto.refresh_token);
  }

  @Delete('me')
  @HttpCode(202)
  async deleteMe(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.object({ password: z.string().optional(), id_token: z.string().optional() }), body);
    await this.users.deleteAccount(user, dto.password, dto.id_token);
    return { status: 'DELETION_ACCEPTED' };
  }

  @Put('me/guardian-consent')
  guardianConsent(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.object({ confirmed: z.boolean() }), body);
    return this.users.setGuardianConsent(user, dto.confirmed);
  }

  /** Anti-scraping: at least 3 characters, 10 results, 30 searches an hour per account. */
  @Get('users')
  @RateLimit({ bucket: 'user_search', windowSec: 3600, perUser: 30, perIp: 100 })
  search(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(z.object({ username: z.string().trim().min(3, 'type at least 3 characters').max(30) }), query);
    return this.users.search(user, dto.username);
  }

  @Get('users/:user_id')
  @RateLimit({ bucket: 'profile', windowSec: 3600, perUser: 300, perIp: 600 })
  profile(@CurrentUser() user: UserDoc, @Param('user_id') userId: string) {
    return this.users.profile(user, oid(userId));
  }
}
