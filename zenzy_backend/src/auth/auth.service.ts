import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { signToken } from '../common/auth.js';
import { DatabaseService, Doc } from '../common/database.js';
import { newId, text } from '../common/util.js';

/** Hash giả để vẫn tốn thời gian so sánh khi email không tồn tại (không lộ email nào đã đăng ký). */
const DUMMY_HASH = bcrypt.hashSync('zenzy-dummy-password', 10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async register(body: any) {
    const name = text(body, 'full_name', 80);
    const email = text(body, 'email', 120).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!EMAIL.test(email)) throw new BadRequestException('Email không hợp lệ');
    if (password.length < 8 || password.length > 200) throw new BadRequestException('Mật khẩu cần ít nhất 8 ký tự');
    if (await this.db.col('users').findOne({ email })) throw new ConflictException('Email này đã được đăng ký');

    const user: Doc = {
      _id: newId(),
      email,
      name,
      date_of_birth: text(body, 'date_of_birth', 20, false) || null,
      password_hash: await bcrypt.hash(password, 10),
      profile: { name, bio: '', avatar: '', friends_text: '0', events_text: '0', posts_text: '0', photos: [] },
      privacy: { ghost_mode: false, audience: 'friends', precise: false, excluded: [] },
      shop_id: null,
      created_at: new Date(),
    };
    try {
      await this.db.col('users').insertOne(user);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Email này đã được đăng ký');
      throw e;
    }
    return this.session(user);
  }

  async login(body: any) {
    const email = text(body, 'email', 120).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    const user = await this.db.col('users').findOne({ email });
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    return this.session(user);
  }

  private session(user: Doc) {
    return { access_token: signToken(user._id), user: { id: user._id, name: user.name, email: user.email } };
  }
}
