import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, Doc } from '../common/database.js';
import { clockText, newId, out, text } from '../common/util.js';

@Injectable()
export class ChatService {
  constructor(private readonly db: DatabaseService) {}

  async conversations() {
    return (await this.db.col('conversations').find().sort({ order: 1 }).limit(100).toArray()).map((c) => out(c));
  }

  /**
   * Một hội thoại kèm tin nhắn. Tin nhắn mẫu giữ nguyên phía gửi như thiết kế;
   * tin do người dùng gửi chỉ hiện với chính người đó.
   */
  async conversation(id: string, userId: string | null) {
    const conversation = await this.db.col('conversations').findOne({ _id: id });
    if (!conversation) throw new NotFoundException('Không tìm thấy hội thoại');
    const messages = await this.db
      .col('messages')
      .find({ conversation_id: id, $or: [{ seeded: true }, { sender_id: userId ?? '' }] })
      .sort({ order: 1 })
      .limit(500)
      .toArray();
    return out(conversation, { messages: messages.map((m) => this.message(m)) });
  }

  async send(id: string, userId: string, body: any) {
    const content = text(body, 'text', 2000);
    if (!(await this.db.col('conversations').findOne({ _id: id }))) throw new NotFoundException('Không tìm thấy hội thoại');
    const message: Doc = {
      _id: newId(),
      conversation_id: id,
      sender_id: userId,
      kind: 'text',
      mine: true,
      text: content,
      time_text: clockText(),
      // Sau mọi tin nhắn mẫu, tăng dần theo thời gian.
      order: Date.now(),
      created_at: new Date(),
    };
    await this.db.col('messages').insertOne(message);
    return this.message(message);
  }

  private message(m: Doc) {
    const { conversation_id, created_at, ...rest } = out(m) as Record<string, unknown>;
    return rest;
  }
}
