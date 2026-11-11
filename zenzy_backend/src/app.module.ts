import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { DatabaseModule, DatabaseService } from './common/database.js';
import { EventsModule } from './events/events.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { NotificationsModule } from './notifications/notifications.controller.js';
import { PostsModule } from './posts/posts.module.js';
import { ShopsModule } from './shops/shops.module.js';
import { UsersModule } from './users/users.module.js';

@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** GET /v1/health — dùng cho health check của load balancer / container. */
  @Get()
  async health() {
    if (!(await this.db.ping())) throw new ServiceUnavailableException('Mất kết nối MongoDB');
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    ShopsModule,
    EventsModule,
    PostsModule,
    ChatModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
