import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { Err, iso, point } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db } from '../core/db';
import { TextModeration } from '../core/support.services';
import { DealDoc, MenuItem, ShopDoc, UserDoc } from '../core/types';

export interface ShopInput {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  menu: Array<{ name: string; price: number; photo_url?: string | null }>;
  hours?: string;
  cover_url?: string | null;
}

export function dealView(d: DealDoc, now = new Date()) {
  const running = d.status === 'ACTIVE' && d.ends_at > now;
  return {
    id: d._id.toHexString(),
    shop_id: d.shop_id.toHexString(),
    title: d.title,
    discount: d.discount,
    start_time: iso(d.starts_at),
    end_time: iso(d.ends_at),
    // The scheduler flips ACTIVE to ENDED; until it runs, the API already reports the deal as ended.
    status: d.status === 'ACTIVE' && !running ? 'ENDED' : d.status,
    remaining_seconds: running ? Math.max(0, Math.floor((d.ends_at.getTime() - Math.max(now.getTime(), d.starts_at.getTime())) / 1000)) : 0,
  };
}

export function shopSummary(s: ShopDoc, activeDeal: DealDoc | null) {
  return {
    id: s._id.toHexString(),
    name: s.name,
    address: s.address,
    latitude: s.loc.coordinates[1],
    longitude: s.loc.coordinates[0],
    hours: s.hours ?? '',
    cover_url: s.cover_url ?? null,
    has_active_deal: !!activeDeal, // the map's deal badge (UC-13)
    active_deal: activeDeal ? dealView(activeDeal) : null,
  };
}

const menuOf = (items: ShopInput['menu']): MenuItem[] => items.map((m) => ({ name: m.name, price: m.price, photo_url: m.photo_url ?? null }));

@Injectable()
export class ShopsService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly text: TextModeration,
  ) {}

  /** The deal that is running now (started, not ended, not cancelled) for each shop. */
  async activeDeals(shopIds: ObjectId[], now = new Date()): Promise<Map<string, DealDoc>> {
    if (!shopIds.length) return new Map();
    const deals = await this.db.deals
      .find({ shop_id: { $in: shopIds }, status: 'ACTIVE', starts_at: { $lte: now }, ends_at: { $gt: now } })
      .sort({ ends_at: 1 })
      .toArray();
    const map = new Map<string, DealDoc>();
    for (const d of deals) if (!map.has(d.shop_id.toHexString())) map.set(d.shop_id.toHexString(), d);
    return map;
  }

  private async detailOf(shop: ShopDoc, viewer: UserDoc) {
    const deal = (await this.activeDeals([shop._id])).get(shop._id.toHexString()) ?? null;
    const isOwner = shop.owner_id.equals(viewer._id);
    return {
      ...shopSummary(shop, deal),
      owner_id: shop.owner_id.toHexString(),
      description: shop.description,
      menu: shop.menu,
      status: shop.status,
      is_owner: isOwner,
      ...(isOwner || viewer.role === 'ADMIN' ? { reject_reason: shop.reject_reason, hidden: shop.hidden } : {}),
      created_at: iso(shop.created_at),
    };
  }

  private async loadVisible(viewer: UserDoc, shopId: ObjectId): Promise<ShopDoc> {
    const shop = await this.db.shops.findOne({ _id: shopId });
    // BR-04: a shop that is not APPROVED does not exist for anyone but its owner.
    if (!shop || !this.access.canSeeShop(viewer, shop)) throw Err.notFound('Shop not found');
    return shop;
  }

  private async loadOwned(user: UserDoc, shopId: ObjectId): Promise<ShopDoc> {
    const shop = await this.loadVisible(user, shopId);
    if (!shop.owner_id.equals(user._id)) throw Err.forbidden('NOT_OWNER', 'Only the shop owner can do this');
    return shop;
  }

  async create(user: UserDoc, input: ShopInput) {
    await this.text.assertClean(input.name, input.description, input.address, ...input.menu.map((m) => m.name)); // BR-01
    const now = new Date();
    const shop: ShopDoc = {
      _id: new ObjectId(),
      owner_id: user._id,
      name: input.name,
      description: input.description,
      address: input.address,
      loc: point(input.latitude, input.longitude),
      status: 'PENDING', // BR-04: invisible to others until an admin approves it
      hidden: false,
      reviewed_by: null,
      reject_reason: null,
      menu: menuOf(input.menu),
      hours: input.hours ?? '',
      cover_url: input.cover_url ?? null,
      created_at: now,
      updated_at: now,
    };
    await this.db.shops.insertOne(shop);
    return this.detailOf(shop, user);
  }

  async update(user: UserDoc, shopId: ObjectId, patch: Partial<ShopInput>) {
    const shop = await this.loadOwned(user, shopId);
    await this.text.assertClean(patch.name, patch.description, patch.address, ...(patch.menu ?? []).map((m) => m.name));
    const set: Partial<ShopDoc> = { updated_at: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.address !== undefined) set.address = patch.address;
    if (patch.menu !== undefined) set.menu = menuOf(patch.menu);
    if (patch.hours !== undefined) set.hours = patch.hours;
    if (patch.cover_url !== undefined) set.cover_url = patch.cover_url;
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
      set.loc = point(patch.latitude ?? shop.loc.coordinates[1], patch.longitude ?? shop.loc.coordinates[0]);
    }
    // UC-14: an edited REJECTED shop goes back to the admin queue.
    if (shop.status === 'REJECTED') {
      set.status = 'PENDING';
      set.reject_reason = null;
      set.reviewed_by = null;
    }
    const updated = await this.db.shops.findOneAndUpdate({ _id: shop._id }, { $set: set }, { returnDocument: 'after' });
    return this.detailOf(updated!, user);
  }

  async detail(viewer: UserDoc, shopId: ObjectId) {
    return this.detailOf(await this.loadVisible(viewer, shopId), viewer);
  }

  async mine(user: UserDoc) {
    const shops = await this.db.shops.find({ owner_id: user._id }).sort({ created_at: -1 }).toArray();
    return { items: await Promise.all(shops.map((s) => this.detailOf(s, user))) };
  }

  /** Shops part of GET /map/nearby: approved shops in the radius, each with its deal badge. */
  async nearby(viewer: UserDoc, latitude: number, longitude: number, radius: number) {
    const blocked = await this.access.blockRelatedIds(viewer._id);
    const shops = await this.db.shops
      .find({
        status: 'APPROVED',
        hidden: false,
        owner_id: { $nin: blocked },
        loc: { $geoWithin: { $centerSphere: [[longitude, latitude], radius / 6378100] } },
      })
      .limit(200)
      .toArray();
    const deals = await this.activeDeals(shops.map((s) => s._id));
    return shops.map((s) => shopSummary(s, deals.get(s._id.toHexString()) ?? null));
  }

  // ----- flash deals (UC-13, UC-15) -----

  async listDeals(viewer: UserDoc, shopId: ObjectId, status: 'ACTIVE' | 'ENDED' | 'CANCELLED') {
    const shop = await this.loadVisible(viewer, shopId);
    const now = new Date();
    const filter =
      status === 'ACTIVE'
        ? { status: 'ACTIVE' as const, ends_at: { $gt: now } }
        : status === 'ENDED'
          ? { $or: [{ status: 'ENDED' as const }, { status: 'ACTIVE' as const, ends_at: { $lte: now } }] }
          : { status: 'CANCELLED' as const };
    const deals = await this.db.deals.find({ shop_id: shop._id, ...filter }).sort({ ends_at: 1 }).toArray();
    return { items: deals.map((d) => dealView(d, now)) };
  }

  async createDeal(user: UserDoc, shopId: ObjectId, input: { title: string; discount: string; start_time?: Date; end_time: Date }) {
    const shop = await this.loadOwned(user, shopId);
    if (shop.status !== 'APPROVED') throw Err.forbidden('SHOP_NOT_APPROVED', 'The shop must be approved before creating a deal');
    const now = new Date();
    const starts = input.start_time ?? now;
    if (input.end_time <= starts) throw Err.badRequest('INVALID_INPUT', 'end_time must be later than start_time');
    if (input.end_time <= now) throw Err.badRequest('INVALID_INPUT', 'end_time must be in the future');
    await this.text.assertClean(input.title, input.discount);
    const deal: DealDoc = {
      _id: new ObjectId(),
      shop_id: shop._id,
      title: input.title,
      discount: input.discount,
      starts_at: starts,
      ends_at: input.end_time,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    };
    await this.db.deals.insertOne(deal);
    return dealView(deal, now);
  }

  async updateDeal(
    user: UserDoc,
    shopId: ObjectId,
    dealId: ObjectId,
    patch: { title?: string; discount?: string; start_time?: Date; end_time?: Date; status?: 'CANCELLED' },
  ) {
    const shop = await this.loadOwned(user, shopId);
    const deal = await this.db.deals.findOne({ _id: dealId, shop_id: shop._id });
    if (!deal) throw Err.notFound('Deal not found');
    const now = new Date();
    if (deal.status !== 'ACTIVE' || deal.ends_at <= now) throw Err.conflict('DEAL_NOT_ACTIVE', 'Only an active deal can be changed');

    const set: Partial<DealDoc> = { updated_at: now };
    if (patch.status === 'CANCELLED') {
      set.status = 'CANCELLED'; // UC-15: the owner ends the deal early
    } else {
      const starts = patch.start_time ?? deal.starts_at;
      const ends = patch.end_time ?? deal.ends_at;
      if (ends <= starts) throw Err.badRequest('INVALID_INPUT', 'end_time must be later than start_time');
      await this.text.assertClean(patch.title, patch.discount);
      set.starts_at = starts;
      set.ends_at = ends;
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.discount !== undefined) set.discount = patch.discount;
    }
    const updated = await this.db.deals.findOneAndUpdate({ _id: deal._id, status: 'ACTIVE' }, { $set: set }, { returnDocument: 'after' });
    if (!updated) throw Err.conflict('DEAL_NOT_ACTIVE', 'Only an active deal can be changed');
    return dealView(updated, now);
  }

  /** Called by the scheduler: deals whose end time has passed become ENDED. */
  async endPastDeals(now = new Date()): Promise<number> {
    const res = await this.db.deals.updateMany({ status: 'ACTIVE', ends_at: { $lte: now } }, { $set: { status: 'ENDED', updated_at: now } });
    return res.modifiedCount;
  }
}
