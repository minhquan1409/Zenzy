import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { ObjectId } from 'mongodb';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../common/http';
import { AppConfig } from './config';
import { Db } from './db';

const userRoom = (id: ObjectId | string) => `user:${id.toString()}`;
const convRoom = (id: ObjectId | string) => `conv:${id.toString()}`;

/**
 * Socket.IO channel (spec 5.3.11). Clients connect with `auth: { token: <access_token> }`.
 * All events are server-to-client; the gateway only delivers to rooms chosen by the
 * services after the authorisation layer has decided who may receive them.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('Realtime');

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly config: AppConfig,
    private readonly db: Db,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = String(client.handshake.auth?.token ?? '');
      const payload = verifyAccessToken(token, this.config.jwtSecret);
      if (!payload || !ObjectId.isValid(payload.sub)) throw new Error('invalid token');
      const user = await this.db.users.findOne({ _id: new ObjectId(payload.sub) }, { projection: { status: 1 } });
      if (!user || user.status !== 'ACTIVE') throw new Error('account not active');

      client.data.userId = payload.sub;
      await client.join(userRoom(payload.sub));
      const conversations = await this.db.conversations
        .find({ member_ids: user._id }, { projection: { _id: 1 } })
        .toArray();
      if (conversations.length) await client.join(conversations.map((c) => convRoom(c._id)));
      client.emit('connection:ready', { user_id: payload.sub });
      // A socket must not outlive its access token: when the token expires the client is told and
      // disconnected, and reconnects with a fresh token (so a suspension or sign-out also ends it).
      if (payload.exp) {
        const ms = Math.max(0, payload.exp * 1000 - Date.now());
        client.data.expiryTimer = setTimeout(() => {
          client.emit('connection:error', { code: 'TOKEN_EXPIRED', message: 'access token expired' });
          client.disconnect(true);
        }, ms);
      }
    } catch (e) {
      client.emit('connection:error', { code: 'UNAUTHENTICATED', message: (e as Error).message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.expiryTimer) clearTimeout(client.data.expiryTimer);
  }

  emitToUser(userId: ObjectId, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: ObjectId[], event: string, payload: unknown): void {
    if (!userIds.length) return;
    this.server?.to(userIds.map((id) => userRoom(id))).emit(event, payload);
  }

  /** Emits to the conversation room, skipping members who must not receive it (blocks). */
  emitToConversation(conversationId: ObjectId, event: string, payload: unknown, except: ObjectId[] = []): void {
    let target = this.server?.to(convRoom(conversationId));
    if (target && except.length) target = target.except(except.map((id) => userRoom(id)));
    target?.emit(event, payload);
  }

  joinConversation(userId: ObjectId, conversationId: ObjectId): void {
    this.server?.in(userRoom(userId)).socketsJoin(convRoom(conversationId));
  }

  leaveConversation(userId: ObjectId, conversationId: ObjectId): void {
    this.server?.in(userRoom(userId)).socketsLeave(convRoom(conversationId));
  }

  /** IDs of users with at least one live socket (single API instance, see spec 4.8). */
  async connectedUserIds(): Promise<ObjectId[]> {
    if (!this.server) return [];
    const sockets = await this.server.fetchSockets();
    const ids = new Set<string>();
    for (const s of sockets) if (s.data.userId) ids.add(s.data.userId);
    return [...ids].map((id) => new ObjectId(id));
  }

  async isOnline(userId: ObjectId): Promise<boolean> {
    if (!this.server) return false;
    return (await this.server.in(userRoom(userId)).fetchSockets()).length > 0;
  }

  disconnectUser(userId: ObjectId): void {
    this.server?.in(userRoom(userId)).disconnectSockets(true);
    this.log.log(`disconnected sockets of user ${userId.toHexString()}`);
  }
}
