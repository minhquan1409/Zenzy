import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, Doc } from '../common/database.js';
import { initialsOf, out } from '../common/util.js';

@Injectable()
export class EventsService {
  constructor(private readonly db: DatabaseService) {}

  private view(event: Doc, userId: string | null) {
    return out(event, { joined: userId !== null && (event.joined_user_ids ?? []).includes(userId) });
  }

  async list(userId: string | null) {
    return (await this.db.col('events').find().limit(100).toArray()).map((e) => this.view(e, userId));
  }

  async get(id: string, userId: string | null) {
    const event = await this.db.col('events').findOne({ _id: id });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện');
    return this.view(event, userId);
  }

  /** RSVP. Chỉ tăng số người khi còn chỗ và người này chưa tham gia (một lệnh update nguyên tử). */
  async join(id: string, userId: string) {
    const user = await this.db.col('users').findOne({ _id: userId });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    const handle = String(user.email ?? '').split('@')[0];
    const updated = await this.db.col('events').findOneAndUpdate(
      { _id: id, joined_user_ids: { $ne: userId }, $expr: { $lt: ['$participants_count', '$capacity'] } },
      {
        $inc: { participants_count: 1 },
        $push: {
          joined_user_ids: userId,
          participants: { initials: initialsOf(user.name), name: user.name, sub: `@${handle} · Joined today`, tone: 'lilac' },
        } as any,
      },
      { returnDocument: 'after' },
    );
    if (updated) return this.view(updated, userId);

    const event = await this.db.col('events').findOne({ _id: id });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện');
    if ((event.joined_user_ids ?? []).includes(userId)) return this.view(event, userId);
    throw new ConflictException('Sự kiện đã đủ người');
  }
}
