import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { notificationSettingsOf } from '../auth/auth.service';
import { CurrentUser, parse } from '../common/http';
import { NOTIFICATION_TYPES, UserDoc } from '../core/types';
import { InboxService } from './inbox.service';

@Controller()
export class NotificationsController {
  constructor(private readonly inbox: InboxService) {}

  @Get('notifications')
  list(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(z.object({ cursor: z.string().optional() }), query);
    return this.inbox.list(user, dto.cursor);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: UserDoc): Promise<void> {
    await this.inbox.readAll(user);
  }

  @Patch('notifications/:id')
  markOne(@CurrentUser() user: UserDoc, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(z.object({ read: z.boolean() }), body);
    return this.inbox.markOne(user, id, dto.read);
  }

  @Get('me/notification-settings')
  getSettings(@CurrentUser() user: UserDoc) {
    return notificationSettingsOf(user);
  }

  @Put('me/notification-settings')
  putSettings(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()), body);
    return this.inbox.updateSettings(user, dto);
  }

  @Put('me/device-tokens')
  @HttpCode(204)
  async putToken(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ token: z.string().min(10).max(4096), platform: z.enum(['ANDROID', 'IOS']) }), body);
    await this.inbox.registerDevice(user, dto.token, dto.platform);
  }

  @Delete('me/device-tokens')
  @HttpCode(204)
  async deleteToken(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ token: z.string().min(1) }), body);
    await this.inbox.removeDevice(user, dto.token);
  }
}
