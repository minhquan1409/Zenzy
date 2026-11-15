import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { LocationService } from '../location/location.service';
import { ShopsService } from '../shops/shops.service';
import { AppConfig } from './config';

/**
 * Scheduled work (spec 5.1 "a scheduled job sets ENDED"; UC-23 "sharing stops automatically").
 * Reads never depend on it: every query also checks end times itself.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly events: EventsService,
    private readonly shops: ShopsService,
    private readonly location: LocationService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.jobsEnabled) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [events, deals, sharing] = await Promise.all([
        this.events.endPastEvents(now),
        this.shops.endPastDeals(now),
        this.location.expireTimeLimitedSharing(now),
      ]);
      if (events + deals + sharing) this.log.log(`ended ${events} events, ${deals} deals; stopped ${sharing} time-limited shares`);
    } catch (e) {
      this.log.error(`job failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
