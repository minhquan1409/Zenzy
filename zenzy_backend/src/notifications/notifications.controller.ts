import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { notificationSettingsOf } from '../auth/auth.service';
import { CurrentUser, Err, nextTimeCursor, oid, parse, timeCursorFilter } from '../common/http';
import { Db } from '../core/db';
import { serializeNotification } from '../core/support.services';
import { NOTIFICATION_TYPES, PAGE_SIZE, UserDoc } from '../core/types';

@Controller()
export class NotificationsController {
  constructor(private readonly db: Db) {}

  @Get('notifications')
  async list(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(z.object({ cursor: z.string().optional() }), query);
    const rows = await this.db.notifications
      .find({ user_id: user._id, ...timeCursorFilter(dto.cursor) })
      .sort({ created_at: -1, _id: -1 })
      .limit(PAGE_SIZE)
      .toArray();
    const unread_count = await this.db.notifications.countDocuments({ user_id: user._id, read_at: null });
    return { items: rows.map(serializeNotification), next_cursor: nextTimeCursor(rows, PAGE_SIZE), unread_count };
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: UserDoc): Promise<void> {
    await this.db.notifications.updateMany({ user_id: user._id, read_at: null }, { $set: { read_at: new Date() } });
  }

  @Patch('notifications/:id')
  async markOne(@CurrentUser() user: UserDoc, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(z.object({ read: z.boolean() }), body);
    const updated = await this.db.notifications.findOneAndUpdate(
      { _id: oid(id), user_id: user._id },
      { $set: { read_at: dto.read ? new Date() : null } },
      { returnDocument: 'after' },
    );
    if (!updated) throw Err.notFound('Notification not found');
    return serializeNotification(updated);
  }

  @Get('me/notification-settings')
  getSettings(@CurrentUser() user: UserDoc) {
    return notificationSettingsOf(user);
  }

  @Put('me/notification-settings')
  async putSettings(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()), body);
    const set: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(dto)) set[`notification_settings.${k}`] = v;
    const updated = await this.db.users.findOneAndUpdate(
      { _id: user._id },
      { $set: { ...set, updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return notificationSettingsOf(updated!);
  }

  @Put('me/device-tokens')
  @HttpCode(204)
  async putToken(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ token: z.string().min(10).max(4096), platform: z.enum(['ANDROID', 'IOS']) }), body);
    // A token belongs to one device; re-registering moves it to the account now signed in there.
    await this.db.deviceTokens.updateOne(
      { token: dto.token },
      { $set: { user_id: user._id, platform: dto.platform, updated_at: new Date() } },
      { upsert: true },
    );
  }

  @Delete('me/device-tokens')
  @HttpCode(204)
  async deleteToken(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ token: z.string().min(1) }), body);
    await this.db.deviceTokens.deleteOne({ token: dto.token, user_id: user._id });
  }
}
