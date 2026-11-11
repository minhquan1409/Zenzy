import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, userIdOf } from '../common/auth.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** GET /v1/events */
  @Get()
  list(@Req() req: Request) {
    return this.events.list(userIdOf(req));
  }

  /** GET /v1/events/:id — dữ liệu màn Event & RSVP. */
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request) {
    return this.events.get(id, userIdOf(req));
  }

  /** POST /v1/events/:id/join */
  @Post(':id/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  join(@Param('id') id: string, @Req() req: Request) {
    return this.events.join(id, userIdOf(req)!);
  }
}
