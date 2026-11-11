import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, userIdOf } from '../common/auth.js';
import { ShopsService } from './shops.service.js';

@Controller()
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  /** GET /v1/shops */
  @Get('shops')
  list() {
    return this.shops.list();
  }

  /** GET /v1/me/shop — dữ liệu màn My shop. */
  @Get('me/shop')
  mine(@Req() req: Request) {
    return this.shops.mine(userIdOf(req));
  }

  /** GET /v1/shops/:id — dữ liệu màn Shop & Flash Deals. */
  @Get('shops/:id')
  get(@Param('id') id: string) {
    return this.shops.get(id);
  }

  /** POST /v1/shops { name, address, opening, closing, menu: [{ name, price }] } */
  @Post('shops')
  @UseGuards(JwtAuthGuard)
  save(@Req() req: Request, @Body() body: any) {
    return this.shops.save(userIdOf(req)!, body);
  }
}
