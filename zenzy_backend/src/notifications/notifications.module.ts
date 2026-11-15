import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { NotificationsController } from './notifications.controller';

/** COMP-09: notification inbox, settings and device tokens. */
@Module({ controllers: [NotificationsController], providers: [InboxService] })
export class NotificationsModule {}
