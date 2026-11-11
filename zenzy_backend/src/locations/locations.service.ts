import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService, Doc } from '../common/database.js';
import { newId, out, text } from '../common/util.js';

const VIEWS = ['main', 'flow'];
const TYPE_ICONS: Record<string, string> = { event: 'fire', sports: 'basketball', study: 'bag', deal: 'bag' };
const LIVE_HOURS = 2;

@Injectable()
export class LocationsService {
  constructor(private readonly db: DatabaseService) {}

  /** Pin và thẻ hoạt động của một bản đồ: "main" (Home Map) hoặc "flow" (luồng live pin). */
  async mapPins(view: string, userId: string | null) {
    const v = VIEWS.includes(view) ? view : 'main';
    const [pins, activity] = await Promise.all([
      this.db
        .col('map_pins')
        // Pin "Close Friends" của người khác không được trả về (chưa có danh sách bạn thân).
        .find({ view: { $in: [v, 'all'] }, $or: [{ audience: { $ne: 'close_friends' } }, { owner_id: userId ?? '' }] })
        .toArray(),
      this.db.col('activities').findOne({ _id: v }),
    ]);
    const { id: _ignored, ...activityOut } = out(activity);
    return { pins: pins.map((p) => out(p)), activity: activityOut };
  }

  /** Đăng live pin tại địa điểm mặc định của thiết kế (Riverside Courts); tự hết hạn sau 2 giờ. */
  async createPin(userId: string, body: any) {
    const type = String(body?.type ?? 'event').toLowerCase();
    if (!(type in TYPE_ICONS)) throw new BadRequestException('Loại pin không hợp lệ');
    const title = text(body, 'title', 80);
    const description = text(body, 'description', 500);
    const everyone = body?.audience !== 'close_friends';
    const place = (await this.db.col('settings').findOne({ _id: 'new_pin_location' })) ?? { lat: 10.801592, lng: 106.737559, place: 'Riverside Courts' };

    const pin: Doc = {
      _id: newId(),
      view: 'all',
      kind: 'place',
      icon: TYPE_ICONS[type],
      color: 'coral',
      is_new: true,
      lat: place.lat,
      lng: place.lng,
      type,
      title,
      description,
      audience: everyone ? 'everyone' : 'close_friends',
      place: place.place,
      owner_id: userId,
      created_at: new Date(),
      expires_at: new Date(Date.now() + LIVE_HOURS * 3600 * 1000),
    };
    await this.db.col('map_pins').insertOne(pin);
    return out(pin, {
      place_time: `${place.place} · Today, 5:30 PM`,
      audience_text: `${everyone ? 'Everyone nearby' : 'Close Friends'} · Live until 7:30 PM`,
    });
  }
}
