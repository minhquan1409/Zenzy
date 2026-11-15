import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, oid, parse, zDate, zLat, zLng, zUrl } from '../common/http';
import { MediaService } from '../core/media.service';
import { UserDoc } from '../core/types';
import { ShopsService } from './shops.service';

const shopFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000),
  address: z.string().trim().min(3).max(200),
  latitude: zLat,
  longitude: zLng,
  menu: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        price: z.number().min(0).max(1_000_000_000),
        photo_url: zUrl.nullable().optional(),
      }),
    )
    .max(100),
  hours: z.string().trim().max(60),
  cover_url: zUrl.nullable(),
};
const zCreateShop = z.object({
  ...shopFields,
  description: shopFields.description.default(''),
  menu: shopFields.menu.default([]),
  hours: shopFields.hours.default(''),
  cover_url: shopFields.cover_url.default(null),
});
const zUpdateShop = z.object(shopFields).partial();

const dealFields = {
  title: z.string().trim().min(2).max(80),
  discount: z.string().trim().min(1).max(40),
  start_time: zDate,
  end_time: zDate,
};

@Controller()
export class ShopsController {
  constructor(
    private readonly shops: ShopsService,
    private readonly media: MediaService,
  ) {}

  /** Cover and menu photos must be this server's own uploads (see MediaService.assertOwnMediaUrls). */
  private checkPhotos(dto: { cover_url?: string | null; menu?: Array<{ photo_url?: string | null }> }) {
    this.media.assertOwnMediaUrls([dto.cover_url, ...(dto.menu ?? []).map((m) => m.photo_url)]);
    return dto;
  }

  @Get('me/shops')
  mine(@CurrentUser() user: UserDoc) {
    return this.shops.mine(user);
  }

  @Post('shops')
  create(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(zCreateShop, body);
    this.checkPhotos(dto);
    return this.shops.create(user, dto);
  }

  @Get('shops/:shop_id')
  detail(@CurrentUser() user: UserDoc, @Param('shop_id') shopId: string) {
    return this.shops.detail(user, oid(shopId));
  }

  @Patch('shops/:shop_id')
  update(@CurrentUser() user: UserDoc, @Param('shop_id') shopId: string, @Body() body: unknown) {
    const dto = parse(zUpdateShop, body);
    this.checkPhotos(dto);
    return this.shops.update(user, oid(shopId), dto);
  }

  @Get('shops/:shop_id/deals')
  listDeals(@CurrentUser() user: UserDoc, @Param('shop_id') shopId: string, @Query() query: unknown) {
    const dto = parse(z.object({ status: z.enum(['ACTIVE', 'ENDED', 'CANCELLED']).default('ACTIVE') }), query);
    return this.shops.listDeals(user, oid(shopId), dto.status);
  }

  @Post('shops/:shop_id/deals')
  createDeal(@CurrentUser() user: UserDoc, @Param('shop_id') shopId: string, @Body() body: unknown) {
    const dto = parse(z.object({ ...dealFields, start_time: dealFields.start_time.optional() }), body);
    return this.shops.createDeal(user, oid(shopId), dto);
  }

  @Patch('shops/:shop_id/deals/:deal_id')
  updateDeal(
    @CurrentUser() user: UserDoc,
    @Param('shop_id') shopId: string,
    @Param('deal_id') dealId: string,
    @Body() body: unknown,
  ) {
    const dto = parse(z.object({ ...dealFields, status: z.literal('CANCELLED') }).partial(), body);
    return this.shops.updateDeal(user, oid(shopId), oid(dealId), dto);
  }
}
