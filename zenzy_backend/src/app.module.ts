import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService, GoogleVerifier } from './auth/auth.service';
import { SecurityController } from './auth/security.controller';
import { SecurityService } from './auth/security.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { AllExceptionsFilter, AuthGuard, Public } from './common/http';
import { AbuseService, RateLimitGuard } from './core/abuse.service';
import { AccessService } from './core/access.service';
import { AppConfig } from './core/config';
import { Db } from './core/db';
import { JobsService } from './core/jobs.service';
import { MailService } from './core/mail.service';
import { MediaService } from './core/media.service';
import { RealtimeGateway } from './core/realtime.gateway';
import { IdempotencyService, NotificationsService, PushService, TextModeration } from './core/support.services';
import { EventsController, MyEventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { FriendsController } from './friends/friends.controller';
import { FriendsService } from './friends/friends.service';
import { LocationController } from './location/location.controller';
import { LocationService } from './location/location.service';
import { AdminController, ReportsController } from './moderation/moderation.controller';
import { ModerationService } from './moderation/moderation.service';
import { NotificationsController } from './notifications/notifications.controller';
import { PostsController } from './posts/posts.controller';
import { PostsService } from './posts/posts.service';
import { ShopsController } from './shops/shops.controller';
import { ShopsService } from './shops/shops.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Controller()
export class HealthController {
  constructor(private readonly db: Db) {}

  /** Used by the load balancer / uptime monitor (NFR-11). */
  @Public()
  @Get('health')
  async health() {
    await this.db.db.command({ ping: 1 });
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    SecurityController,
    UsersController,
    LocationController,
    FriendsController,
    MyEventsController,
    EventsController,
    ShopsController,
    PostsController,
    ChatController,
    NotificationsController,
    ReportsController,
    AdminController,
  ],
  providers: [
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
    GoogleVerifier,
    AuthService,
    SecurityService,
    UsersService,
    LocationService,
    FriendsService,
    EventsService,
    ShopsService,
    PostsService,
    ChatService,
    ModerationService,
    JobsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
