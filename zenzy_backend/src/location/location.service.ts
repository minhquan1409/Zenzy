import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { needsGuardianConsent, privacyOf } from '../auth/auth.service';
import { Err, iso, point, publicUser } from '../common/http';
import { AccessService, sharingActive } from '../core/access.service';
import { Db } from '../core/db';
import { RealtimeGateway } from '../core/realtime.gateway';
import { Audience, UserDoc } from '../core/types';

export interface PrivacyPatch {
  ghost_mode?: boolean;
  sharing_enabled?: boolean;
  audience?: Audience;
  share_until?: Date | null;
  precise?: boolean;
  hidden_from?: ObjectId[];
  discoverable?: boolean;
}

const minus = (a: ObjectId[], b: ObjectId[]) => a.filter((x) => !b.some((y) => y.equals(x)));

/** With "precise" off the stored position is rounded to about 1 km, so the exact spot is never kept. */
function coarse(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class LocationService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * PUT /me/privacy (UC-07, UC-23, SEQ-02). Saves the settings, deletes the stored location when
   * the user stops sharing, and emits `location:hide` to everyone who could see the user before
   * but may not any more.
   */
  async updatePrivacy(user: UserDoc, patch: PrivacyPatch) {
    const sharing = { ...user.location_sharing };
    if (patch.audience !== undefined) sharing.audience = patch.audience;
    if (patch.precise !== undefined) sharing.precise = patch.precise;
    if (patch.hidden_from !== undefined) sharing.hidden_from = patch.hidden_from;
    if (patch.share_until !== undefined) sharing.until = patch.share_until;
    if (patch.sharing_enabled !== undefined) {
      sharing.enabled = patch.sharing_enabled;
      if (!patch.sharing_enabled) sharing.until = null;
    }
    // An expired time limit means sharing is off; starting again needs a new limit or "until turned off".
    if (sharing.enabled && sharing.until !== null && sharing.until <= new Date()) {
      if (patch.sharing_enabled === true && patch.share_until === undefined) sharing.until = null;
      else if (patch.share_until !== undefined) throw Err.badRequest('INVALID_INPUT', 'share_until must be in the future');
      else sharing.enabled = false;
    }
    const turningOn = sharing.enabled && !(user.location_sharing.enabled && sharingActive({ ...user, ghost_mode: false }));
    if (turningOn && needsGuardianConsent(user)) {
      throw Err.forbidden('GUARDIAN_CONSENT_REQUIRED', 'Users under 16 need guardian consent before sharing location');
    }

    const next: UserDoc = {
      ...user,
      ghost_mode: patch.ghost_mode ?? user.ghost_mode,
      discoverable: patch.discoverable ?? user.discoverable,
      location_sharing: sharing,
      updated_at: new Date(),
    };
    const before = await this.access.locationViewerIds(user);
    await this.db.users.updateOne(
      { _id: user._id },
      {
        $set: {
          ghost_mode: next.ghost_mode,
          location_sharing: sharing,
          updated_at: next.updated_at,
          ...(patch.discoverable !== undefined ? { discoverable: patch.discoverable } : {}),
        },
      },
    );
    const after = await this.access.locationViewerIds(next);

    if (!sharingActive(next)) await this.db.userLocations.deleteOne({ _id: user._id });
    this.realtime.emitToUsers(minus(before, after), 'location:hide', { user_id: user._id.toHexString() });

    const gained = minus(after, before);
    if (gained.length) {
      const loc = await this.db.userLocations.findOne({ _id: user._id });
      if (loc) this.realtime.emitToUsers(gained, 'location:update', this.locationPayload(user._id, loc));
    }
    return privacyOf(next);
  }

  private locationPayload(userId: ObjectId, loc: { loc: { coordinates: [number, number] }; accuracy: number | null; updated_at: Date }) {
    return {
      user_id: userId.toHexString(),
      latitude: loc.loc.coordinates[1],
      longitude: loc.loc.coordinates[0],
      accuracy: loc.accuracy,
      updated_at: iso(loc.updated_at),
    };
  }

  /** PUT /me/location (BR-05): overwrite the single latest position, then emit only to allowed friends. */
  async updateLocation(user: UserDoc, latitude: number, longitude: number, accuracy: number | null): Promise<void> {
    if (!sharingActive(user)) {
      if (user.location_sharing.enabled && !user.ghost_mode) await this.stopExpiredSharing(user);
      throw Err.conflict('SHARING_OFF', 'Location sharing is off or Ghost Mode is on');
    }
    const precise = user.location_sharing.precise;
    const doc = {
      loc: point(precise ? latitude : coarse(latitude), precise ? longitude : coarse(longitude)),
      accuracy: precise ? accuracy : null,
      updated_at: new Date(),
    };
    await this.db.userLocations.replaceOne({ _id: user._id }, doc, { upsert: true });
    const viewers = await this.access.locationViewerIds(user);
    this.realtime.emitToUsers(viewers, 'location:update', this.locationPayload(user._id, doc));
  }

  /** UC-23 step 6: when the time limit ends the server stops sharing exactly like Ghost Mode does. */
  private async stopExpiredSharing(user: UserDoc): Promise<void> {
    const before = await this.access.locationViewerIds({ ...user, location_sharing: { ...user.location_sharing, until: null } });
    await this.db.users.updateOne(
      { _id: user._id },
      { $set: { 'location_sharing.enabled': false, 'location_sharing.until': null, updated_at: new Date() } },
    );
    await this.db.userLocations.deleteOne({ _id: user._id });
    this.realtime.emitToUsers(before, 'location:hide', { user_id: user._id.toHexString() });
  }

  /** Called by the scheduler. */
  async expireTimeLimitedSharing(now = new Date()): Promise<number> {
    const users = await this.db.users
      .find({ 'location_sharing.enabled': true, 'location_sharing.until': { $ne: null, $lte: now } })
      .toArray();
    for (const u of users) await this.stopExpiredSharing(u);
    return users.length;
  }

  /** Friends part of GET /map/nearby: positions the caller is allowed to see, each with its updated_at. */
  async visibleFriends(viewer: UserDoc) {
    const rows = await this.access.visibleFriendLocations(viewer._id);
    return rows.map((r) => ({
      user: publicUser(r.user),
      latitude: r.loc.coordinates[1],
      longitude: r.loc.coordinates[0],
      accuracy: r.accuracy,
      updated_at: iso(r.updated_at),
    }));
  }
}
