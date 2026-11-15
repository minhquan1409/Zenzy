import { Module } from '@nestjs/common';
import { AdminController, ReportsController } from './moderation.controller';
import { ModerationService } from './moderation.service';

/** COMP-10 / COMP-11: reports, admin queue, shop approval, audit log. */
@Module({ controllers: [ReportsController, AdminController], providers: [ModerationService] })
export class ModerationModule {}
