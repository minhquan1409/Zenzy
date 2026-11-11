import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { config } from '../common/config.js';
import { DatabaseService, Doc } from '../common/database.js';
import { out, text } from '../common/util.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class ShopsService {
  constructor(private readonly db: DatabaseService) {}

  async list() {
    return (await this.db.col('shops').find().limit(100).toArray()).map((s) => out(s));
  }

  async get(id: string) {
    const shop = await this.db.col('shops').findOne({ _id: id });
    if (!shop) throw new NotFoundException('Không tìm thấy cửa hàng');
    return out(shop);
  }

  /** Cửa hàng của tôi; chưa có (hoặc là khách) thì trả về cửa hàng mẫu. */
  async mine(userId: string | null) {
    const user = await this.db.col('users').findOne({ _id: userId ?? config.demoUserId });
    const demo = await this.db.col('users').findOne({ _id: config.demoUserId });
    const shop = await this.db.col('shops').findOne({ _id: user?.shop_id ?? demo?.shop_id ?? '' });
    if (!shop) throw new NotFoundException('Chưa có cửa hàng');
    return out(shop);
  }

  /** Tạo hoặc cập nhật cửa hàng của người dùng (mỗi người một cửa hàng). */
  async save(userId: string, body: any) {
    const name = text(body, 'name', 80);
    const address = text(body, 'address', 200);
    const opening = text(body, 'opening', 5);
    const closing = text(body, 'closing', 5);
    if (!TIME.test(opening) || !TIME.test(closing)) throw new BadRequestException('Giờ mở/đóng cửa phải có dạng HH:MM');
    if (!Array.isArray(body?.menu) || body.menu.length > 50) throw new BadRequestException('Menu không hợp lệ');
    const menu = body.menu.map((item: any) => ({ name: text(item, 'name', 80), price: text(item, 'price', 20), desc: '' }));

    const shop: Doc = {
      _id: `shop-${userId}`,
      owner_id: userId,
      name,
      address,
      full_address: address,
      opening,
      closing,
      hours_text: `Every day · ${opening} – ${closing}`,
      open_text: `Open until ${closing}`,
      cover: 's08_cafe',
      badge: 'NEW ON ZENZY',
      categories: ['All'],
      menu,
      news: [],
      updated_at: new Date(),
    };
    const { _id, ...fields } = shop;
    await this.db.col('shops').updateOne({ _id }, { $set: fields }, { upsert: true });
    await this.db.col('users').updateOne({ _id: userId }, { $set: { shop_id: _id } });
    return out(shop);
  }
}
