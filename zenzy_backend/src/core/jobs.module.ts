import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { LocationModule } from '../location/location.module';
import { ShopsModule } from '../shops/shops.module';
import { JobsService } from './jobs.service';

/** Scheduled jobs: end past events and deals, stop expired time-limited sharing. */
@Module({ imports: [EventsModule, ShopsModule, LocationModule], providers: [JobsService] })
export class JobsModule {}
