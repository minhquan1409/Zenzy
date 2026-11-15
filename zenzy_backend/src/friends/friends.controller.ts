import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, oid, parse, zId } from '../common/http';
import { UserDoc } from '../core/types';
import { FriendsService } from './friends.service';

@Controller()
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get('friends')
  list(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(z.object({ status: z.enum(['ACCEPTED', 'PENDING']).default('ACCEPTED'), q: z.string().trim().max(50).optional() }), query);
    return this.friends.list(user, dto.status, dto.q);
  }

  @Post('friends/requests')
  sendRequest(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.object({ receiver_id: zId }), body);
    return this.friends.sendRequest(user, dto.receiver_id);
  }

  @Patch('friends/requests/:request_id')
  respond(@CurrentUser() user: UserDoc, @Param('request_id') requestId: string, @Body() body: unknown) {
    const dto = parse(z.object({ action: z.enum(['ACCEPT', 'REJECT']) }), body);
    return this.friends.respond(user, oid(requestId), dto.action);
  }

  @Delete('friends/:user_id')
  @HttpCode(204)
  async remove(@CurrentUser() user: UserDoc, @Param('user_id') userId: string): Promise<void> {
    await this.friends.remove(user, oid(userId));
  }

  @Put('friends/:user_id/close')
  setClose(@CurrentUser() user: UserDoc, @Param('user_id') userId: string, @Body() body: unknown) {
    const dto = parse(z.object({ close: z.boolean() }), body);
    return this.friends.setClose(user, oid(userId), dto.close);
  }

  @Get('blocks')
  listBlocks(@CurrentUser() user: UserDoc) {
    return this.friends.listBlocks(user);
  }

  @Post('blocks')
  block(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(z.object({ user_id: zId }), body);
    return this.friends.block(user, dto.user_id);
  }

  @Delete('blocks/:user_id')
  @HttpCode(204)
  async unblock(@CurrentUser() user: UserDoc, @Param('user_id') userId: string): Promise<void> {
    await this.friends.unblock(user, oid(userId));
  }
}
