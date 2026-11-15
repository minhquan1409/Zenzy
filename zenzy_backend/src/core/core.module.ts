import { Global, Module } from '@nestjs/common';
import { AbuseService } from './abuse.service';
import { AccessService } from './access.service';
import { AppConfig } from './config';
import { Db } from './db';
import { MailService } from './mail.service';
import { MediaService } from './media.service';
import { RealtimeGateway } from './realtime.gateway';
import { IdempotencyService, NotificationsService, PushService, TextModeration } from './support.services';

const shared = [
  AppConfig,
  Db,
  AccessService,
  AbuseService,
  RealtimeGateway,
  TextModeration,
  IdempotencyService,
  PushService,
  NotificationsService,
  MediaService,
  MailService,
];

/**
 * Shared infrastructure used by every feature module: config, the Mongo connection, the central
 * authorisation layer (spec 4.8), the Socket.IO gateway, notifications and push, media, mail and abuse limits.
 * Global, so feature modules do not import it one by one.
 */
@Global()
@Module({ providers: shared, exports: shared })
export class CoreModule {}
