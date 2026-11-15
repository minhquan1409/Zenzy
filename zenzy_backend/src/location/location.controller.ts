import { Body, Controller, Get, HttpCode, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { privacyOf } from '../auth/auth.service';
import { CurrentUser, Err, parse, zDate, zId, zLat, zLng } from '../common/http';
import { AbuseService, RateLimit } from '../core/abuse.service';
import { UserDoc } from '../core/types';
import { EventsService } from '../events/events.service';
import { zNearQuery } from '../events/events.controller';
import { ShopsService } from '../shops/shops.service';
import { LocationService } from './location.service';
import { SearchService } from './search.service';

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
    private readonly searchService: SearchService,
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
  search(@CurrentUser() user: UserDoc, @Query() query: unknown) {
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
    return this.searchService.search(user, dto);
  }
}
