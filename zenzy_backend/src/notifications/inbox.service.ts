import { Injectable } from '@nestjs/common';
import { notificationSettingsOf } from '../auth/auth.service';
import { Err, nextTimeCursor, oid, timeCursorFilter } from '../common/http';
import { Db } from '../core/db';
import { serializeNotification } from '../core/support.services';
import { NotificationType, PAGE_SIZE, UserDoc } from '../core/types';

/**
 * The user's own notification inbox, notification settings and push device tokens (COMP-09).
 * Creating and delivering notifications is NotificationsService in core/support.services.ts.
 */
@Injectable()
export class InboxService {
  constructor(private readonly db: Db) {}

  async list(user: UserDoc, cursor?: string) {
    const rows = await this.db.notifications
      .find({ user_id: user._id, ...timeCursorFilter(cursor) })
      .sort({ created_at: -1, _id: -1 })
      .limit(PAGE_SIZE)
      .toArray();
    const unread_count = await this.db.notifications.countDocuments({ user_id: user._id, read_at: null });
    return { items: rows.map(serializeNotification), next_cursor: nextTimeCursor(rows, PAGE_SIZE), unread_count };
  }

  async readAll(user: UserDoc): Promise<void> {
    await this.db.notifications.updateMany({ user_id: user._id, read_at: null }, { $set: { read_at: new Date() } });
  }

  async markOne(user: UserDoc, id: string, read: boolean) {
    const updated = await this.db.notifications.findOneAndUpdate(
      { _id: oid(id), user_id: user._id },
      { $set: { read_at: read ? new Date() : null } },
      { returnDocument: 'after' },
    );
    if (!updated) throw Err.notFound('Notification not found');
    return serializeNotification(updated);
  }

  async updateSettings(user: UserDoc, changes: Partial<Record<NotificationType, boolean>>) {
    const set: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(changes)) set[`notification_settings.${k}`] = v as boolean;
    const updated = await this.db.users.findOneAndUpdate(
      { _id: user._id },
      { $set: { ...set, updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return notificationSettingsOf(updated!);
  }

  /** A token belongs to one device; re-registering moves it to the account now signed in there. */
  async registerDevice(user: UserDoc, token: string, platform: 'ANDROID' | 'IOS'): Promise<void> {
    await this.db.deviceTokens.updateOne(
      { token },
      { $set: { user_id: user._id, platform, updated_at: new Date() } },
      { upsert: true },
    );
  }

  async removeDevice(user: UserDoc, token: string): Promise<void> {
    await this.db.deviceTokens.deleteOne({ token, user_id: user._id });
  }
}
