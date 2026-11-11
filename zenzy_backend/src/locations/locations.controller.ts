import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, userIdOf } from '../common/auth.js';
import { LocationsService } from './locations.service.js';

@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /** GET /v1/map/pins?view=main|flow */
  @Get('map/pins')
  mapPins(@Query('view') view: string, @Req() req: Request) {
    return this.locations.mapPins(view, userIdOf(req));
  }

  /** POST /v1/pins { type, title, description, audience } */
  @Post('pins')
  @UseGuards(JwtAuthGuard)
  createPin(@Req() req: Request, @Body() body: any) {
    return this.locations.createPin(userIdOf(req)!, body);
  }
}
