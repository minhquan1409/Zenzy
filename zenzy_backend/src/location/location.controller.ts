import { Body, Controller, Get, HttpCode, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { privacyOf } from '../auth/auth.service';
import { CurrentUser, decodeCursor, encodeCursor, Err, escapeRegex, parse, zDate, zId, zLat, zLng } from '../common/http';
import { AbuseService, RateLimit } from '../core/abuse.service';
import { AccessService } from '../core/access.service';
import { Db } from '../core/db';
import { PAGE_SIZE, UserDoc } from '../core/types';
import { activeEventFilter, eventSummary, EventsService } from '../events/events.service';
import { zNearQuery } from '../events/events.controller';
import { shopSummary, ShopsService } from '../shops/shops.service';
import { LocationService } from './location.service';

const zPrivacy = z
  .object({
    ghost_mode: z.boolean(),
    sharing_enabled: z.boolean(),
    audience: z.enum(['FRIENDS', 'CLOSE_FRIENDS']),
    share_until: zDate.nullable(),
    precise: z.boolean(),
    hidden_from: z.array(zId).max(500),
    discoverable: z.boolean(),
  })
  .partial();

const TYPES = ['friends', 'events', 'shops'] as const;

@Controller()
export class LocationController {
  constructor(
    private readonly location: LocationService,
    private readonly events: EventsService,
    private readonly shops: ShopsService,
    private readonly access: AccessService,
    private readonly db: Db,
    private readonly abuse: AbuseService,
  ) {}

  @Get('me/privacy')
  getPrivacy(@CurrentUser() user: UserDoc) {
    return privacyOf(user);
  }

  @Put('me/privacy')
  putPrivacy(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(zPrivacy, body);
    if (dto.share_until && dto.share_until <= new Date()) throw Err.badRequest('INVALID_INPUT', 'share_until must be in the future');
    return this.location.updatePrivacy(user, dto);
  }

  @Put('me/location')
  @HttpCode(204)
  async putLocation(@CurrentUser() user: UserDoc, @Body() body: unknown): Promise<void> {
    const dto = parse(z.object({ latitude: zLat, longitude: zLng, accuracy: z.number().min(0).max(100000).nullable().optional() }), body);
    await this.location.updateLocation(user, dto.latitude, dto.longitude, dto.accuracy ?? null);
  }

  /** SEQ-01: friends, events and shops in one call; every part is filtered by the authorisation layer. */
  @Get('map/nearby')
  @RateLimit({ bucket: 'map', windowSec: 60, perUser: 60, perIp: 150 })
  async nearby(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(zNearQuery.extend({ types: z.string().optional() }), query);
    await this.abuse.checkSearchCenter(user, dto.latitude, dto.longitude);
    const wanted = dto.types ? dto.types.split(',').map((t) => t.trim().toLowerCase()) : [...TYPES];
    if (wanted.some((t) => !(TYPES as readonly string[]).includes(t))) {
      throw Err.badRequest('INVALID_INPUT', 'types must be a comma-separated list of friends, events, shops');
    }
    const [friends, events, shops] = await Promise.all([
      wanted.includes('friends') ? this.location.visibleFriends(user) : [],
      wanted.includes('events') ? this.events.list(user, dto) : [],
      wanted.includes('shops') ? this.shops.nearby(user, dto.latitude, dto.longitude, dto.radius) : [],
    ]);
    return { friends, events, shops, server_time: new Date().toISOString() };
  }

  /** UC-04: keyword search over visible shops and events, nearest first when a position is given. */
  @Get('search')
  @RateLimit({ bucket: 'search', windowSec: 60, perUser: 30, perIp: 100 })
  async search(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(
      z.object({
        q: z.string().trim().min(1).max(80),
        type: z.enum(['SHOP', 'EVENT']).optional(),
        latitude: zLat.optional(),
        longitude: zLng.optional(),
        cursor: z.string().optional(),
      }),
      query,
    );
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
