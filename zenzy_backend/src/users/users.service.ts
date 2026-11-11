import { Injectable, UnauthorizedException } from '@nestjs/common';
import { config } from '../common/config.js';
import { DatabaseService, Doc } from '../common/database.js';

const AUDIENCES = ['public', 'friends', 'private'];

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /** Người dùng theo token; khách (userId null) xem người dùng mẫu. */
  async resolve(userId: string | null): Promise<Doc> {
    const user = await this.db.col('users').findOne({ _id: userId ?? config.demoUserId });
    if (!user) throw new UnauthorizedException('Tài khoản không còn tồn tại');
    return user;
  }

  async me(userId: string | null) {
    const user = await this.resolve(userId);
    return { id: user._id, name: user.name, email: user.email, guest: userId === null };
  }

  async profile(userId: string | null) {
    return (await this.resolve(userId)).profile ?? {};
  }

  async privacy(userId: string | null) {
    return (await this.resolve(userId)).privacy ?? {};
  }

  async updatePrivacy(userId: string, body: any) {
    const user = await this.resolve(userId);
    const privacy = { ...(user.privacy ?? {}) };
    if (typeof body?.ghost_mode === 'boolean') privacy.ghost_mode = body.ghost_mode;
    if (typeof body?.precise === 'boolean') privacy.precise = body.precise;
    if (AUDIENCES.includes(body?.audience)) privacy.audience = body.audience;
    await this.db.col('users').updateOne({ _id: user._id }, { $set: { privacy } });
    return privacy;
  }
}
