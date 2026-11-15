import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ShopsModule } from '../shops/shops.module';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { SearchService } from './search.service';

/** COMP-03 / COMP-04: privacy, location sharing, the combined map and search. */
@Module({
  imports: [EventsModule, ShopsModule],
  controllers: [LocationController],
  providers: [LocationService, SearchService],
  exports: [LocationService],
})
export class LocationModule {}
