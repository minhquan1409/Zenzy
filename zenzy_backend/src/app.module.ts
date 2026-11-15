import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { AllExceptionsFilter, AuthGuard, Public } from './common/http';
import { RateLimitGuard } from './core/abuse.service';
import { CoreModule } from './core/core.module';
import { Db } from './core/db';
import { JobsModule } from './core/jobs.module';
import { EventsModule } from './events/events.module';
import { FriendsModule } from './friends/friends.module';
import { LocationModule } from './location/location.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { ShopsModule } from './shops/shops.module';
import { UsersModule } from './users/users.module';

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

/**
 * Root module: one feature module per backend module in spec 4.5 (COMP-01 to COMP-11), on top of the
 * global CoreModule. The auth guard, rate-limit guard and error filter apply to every route.
 */
@Module({
  imports: [
    CoreModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    LocationModule,
    EventsModule,
    ShopsModule,
    PostsModule,
    ChatModule,
    NotificationsModule,
    ModerationModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
