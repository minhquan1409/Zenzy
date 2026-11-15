import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

/** COMP-06: shops and flash deals. */
@Module({ controllers: [ShopsController], providers: [ShopsService], exports: [ShopsService] })
export class ShopsModule {}
