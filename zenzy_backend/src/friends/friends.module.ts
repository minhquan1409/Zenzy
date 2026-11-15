import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

/** COMP-02: friend requests, friend list, close friends. */
@Module({ controllers: [FriendsController], providers: [FriendsService] })
export class FriendsModule {}
