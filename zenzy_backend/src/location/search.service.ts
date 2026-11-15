import { Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor, Err, escapeRegex } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db } from '../core/db';
import { PAGE_SIZE, UserDoc } from '../core/types';
import { activeEventFilter, eventSummary } from '../events/events.service';
import { shopSummary, ShopsService } from '../shops/shops.service';

export interface SearchQuery {
  q: string;
  type?: 'SHOP' | 'EVENT';
  latitude?: number;
  longitude?: number;
  cursor?: string;
}

/** UC-04: keyword search over shops and events the viewer may see (authorisation layer filters both). */
@Injectable()
export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly shops: ShopsService,
  ) {}

  async search(user: UserDoc, dto: SearchQuery) {
    const offset = decodeCursor<{ o: number }>(dto.cursor)?.o ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw Err.badRequest('INVALID_CURSOR', 'cursor is not valid');
    const near = dto.latitude !== undefined && dto.longitude !== undefined ? ([dto.longitude, dto.latitude] as [number, number]) : null;
    const rx = { $regex: escapeRegex(dto.q), $options: 'i' };
    const take = offset + PAGE_SIZE + 1;
    const now = new Date();
    const geoStage = (match: object) =>
      near
        ? [{ $geoNear: { near: { type: 'Point', coordinates: near }, distanceField: 'distance_m', spherical: true, query: match } }]
        : [{ $match: match }, { $sort: { created_at: -1 } }];

    const results: Array<{ type: 'SHOP' | 'EVENT'; distance_m: number | null; item: unknown }> = [];
    if (dto.type !== 'EVENT') {
      const blocked = await this.access.blockRelatedIds(user._id);
      const match = { status: 'APPROVED', hidden: false, owner_id: { $nin: blocked }, $or: [{ name: rx }, { address: rx }] };
      const shops = await this.db.shops.aggregate<any>([...geoStage(match), { $limit: take }]).toArray();
      const deals = await this.shops.activeDeals(shops.map((s) => s._id));
      for (const s of shops) {
        results.push({ type: 'SHOP', distance_m: s.distance_m ?? null, item: shopSummary(s, deals.get(s._id.toHexString()) ?? null) });
      }
    }
    if (dto.type !== 'SHOP') {
      const match = { $and: [activeEventFilter(now), await this.access.visibleEventFilter(user._id), { $or: [{ title: rx }, { place_name: rx }] }] };
      const events = await this.db.events.aggregate<any>([...geoStage(match), { $limit: take }]).toArray();
      for (const e of events) results.push({ type: 'EVENT', distance_m: e.distance_m ?? null, item: eventSummary(e, now) });
    }
    if (near) results.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
    const page = results.slice(offset, offset + PAGE_SIZE);
    return {
      items: page.map((r) => ({ type: r.type, distance_m: r.distance_m === null ? null : Math.round(r.distance_m), ...(r.item as object) })),
      next_cursor: results.length > offset + PAGE_SIZE ? encodeCursor({ o: offset + PAGE_SIZE }) : null,
    };
  }
}
