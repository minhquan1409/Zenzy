import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { AbuseService, RateLimit } from '../core/abuse.service';
import { z } from 'zod';
import { CurrentUser, oid, parse, zDate, zLat, zLng } from '../common/http';
import { IdempotencyService } from '../core/support.services';
import { UserDoc } from '../core/types';
import { EventsService } from './events.service';

const zEventType = z.enum(['EVENT', 'SPORTS', 'STUDY', 'OTHER']);

const eventFields = {
  title: z.string().trim().min(3).max(80), // US-11: 3 to 80 characters
  type: zEventType,
  description: z.string().trim().max(1000),
  latitude: zLat,
  longitude: zLng,
  place_name: z.string().trim().max(120),
  start_time: zDate,
  end_time: zDate,
  max_participants: z.number().int().min(1).max(1000).nullable(),
  audience: z.enum(['EVERYONE', 'CLOSE_FRIENDS']),
};

const zCreateEvent = z.object({
  ...eventFields,
  description: eventFields.description.default(''),
  place_name: eventFields.place_name.default(''),
  start_time: eventFields.start_time.optional(), // omitted = starts now (live pin)
  max_participants: eventFields.max_participants.default(null),
  audience: eventFields.audience.default('EVERYONE'),
});

const zUpdateEvent = z.object(eventFields).partial();

export const zNearQuery = z.object({
  latitude: zLat,
  longitude: zLng,
  radius: z.coerce.number().min(1).max(50000).default(5000),
});

@Controller('me/events')
export class MyEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  mine(@CurrentUser() user: UserDoc) {
    return this.events.mine(user);
  }
}

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly idempotency: IdempotencyService,
    private readonly abuse: AbuseService,
  ) {}

  @Get()
  @RateLimit({ bucket: 'map', windowSec: 60, perUser: 60, perIp: 150 })
  async list(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(zNearQuery.extend({ type: zEventType.optional(), when: z.enum(['NOW', 'SCHEDULED']).optional() }), query);
    await this.abuse.checkSearchCenter(user, dto.latitude, dto.longitude);
    return { items: await this.events.list(user, dto) };
  }

  @Post()
  create(@CurrentUser() user: UserDoc, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const dto = parse(zCreateEvent, body);
    return this.idempotency.run(user._id, 'POST /events', key, () => this.events.create(user, dto));
  }

  @Get(':event_id')
  detail(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string) {
    return this.events.detail(user, oid(eventId));
  }

  @Patch(':event_id')
  update(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string, @Body() body: unknown) {
    return this.events.update(user, oid(eventId), parse(zUpdateEvent, body));
  }

  @Post(':event_id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string, @Body() body: unknown) {
    const dto = parse(z.object({ reason: z.string().trim().max(300).optional() }), body);
    return this.events.cancel(user, oid(eventId), dto.reason || null);
  }

  @Get(':event_id/participants')
  participants(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string, @Query() query: unknown) {
    const dto = parse(
      z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'LEFT', 'KICKED']).optional() }),
      query,
    );
    return this.events.participants(user, oid(eventId), dto.status);
  }

  @Post(':event_id/requests')
  requestJoin(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string, @Headers('idempotency-key') key?: string) {
    const id = oid(eventId);
    return this.idempotency.run(user._id, `POST /events/${eventId}/requests`, key, () => this.events.requestJoin(user, id));
  }

  // Declared before ":request_id" so "me" is never read as a request id.
  @Delete(':event_id/requests/me')
  @HttpCode(204)
  async withdraw(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string): Promise<void> {
    await this.events.withdraw(user, oid(eventId));
  }

  @Patch(':event_id/requests/:request_id')
  decide(
    @CurrentUser() user: UserDoc,
    @Param('event_id') eventId: string,
    @Param('request_id') requestId: string,
    @Body() body: unknown,
  ) {
    const dto = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED']) }), body);
    return this.events.decide(user, oid(eventId), oid(requestId), dto.status);
  }

  @Delete(':event_id/members/:user_id')
  @HttpCode(204)
  async kick(@CurrentUser() user: UserDoc, @Param('event_id') eventId: string, @Param('user_id') userId: string): Promise<void> {
    await this.events.kick(user, oid(eventId), oid(userId));
  }
}
