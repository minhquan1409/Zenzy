import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** COMP-02 / COMP-03: profile, blocks, account deletion. */
@Module({ imports: [AuthModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
