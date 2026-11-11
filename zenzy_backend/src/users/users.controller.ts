import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, userIdOf } from '../common/auth.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** GET /v1/me */
  @Get()
  me(@Req() req: Request) {
    return this.users.me(userIdOf(req));
  }

  /** GET /v1/me/profile — dữ liệu màn Social Profile. */
  @Get('profile')
  profile(@Req() req: Request) {
    return this.users.profile(userIdOf(req));
  }

  /** GET /v1/me/privacy — dữ liệu màn Location Privacy. */
  @Get('privacy')
  privacy(@Req() req: Request) {
    return this.users.privacy(userIdOf(req));
  }

  /** PUT /v1/me/privacy { ghost_mode?, audience?, precise? } */
  @Put('privacy')
  @UseGuards(JwtAuthGuard)
  updatePrivacy(@Req() req: Request, @Body() body: any) {
    return this.users.updatePrivacy(userIdOf(req)!, body);
  }
}
