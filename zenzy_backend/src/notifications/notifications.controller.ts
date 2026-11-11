import { Controller, Get, Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.js';
import { out } from '../common/util.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly db: DatabaseService) {}

  /** GET /v1/notifications — dữ liệu màn Notifications. */
  @Get()
  async list() {
    return (await this.db.col('notifications').find().sort({ order: 1 }).limit(100).toArray()).map((n) => out(n));
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
