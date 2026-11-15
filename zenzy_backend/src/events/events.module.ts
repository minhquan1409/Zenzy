import { Module } from '@nestjs/common';
import { EventsController, MyEventsController } from './events.controller';
import { EventsService } from './events.service';

/** COMP-05: events, join requests, participants. */
@Module({ controllers: [MyEventsController, EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
