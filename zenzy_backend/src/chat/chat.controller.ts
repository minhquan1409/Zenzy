import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, oid, parse, zDate, zId } from '../common/http';
import { IdempotencyService } from '../core/support.services';
import { UserDoc } from '../core/types';
import { ChatService } from './chat.service';

@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  list(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(z.object({ type: z.enum(['DIRECT', 'GROUP', 'EVENT']).optional() }), query);
    return this.chat.list(user, dto.type);
  }

  @Post()
  create(@CurrentUser() user: UserDoc, @Body() body: unknown) {
    const dto = parse(
      z.object({
        type: z.enum(['DIRECT', 'GROUP']),
        member_ids: z.array(zId).min(1).max(50),
        name: z.string().trim().min(1).max(60).optional(),
      }),
      body,
    );
    return this.chat.create(user, dto.type, dto.member_ids, dto.name ?? null);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: UserDoc, @Param('id') id: string, @Query() query: unknown) {
    const dto = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: zDate.optional() }), query);
    return this.chat.messages(user, oid(id), dto.limit, dto.before);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: UserDoc, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const dto = parse(z.object({ content: z.string().trim().min(1).max(2000) }), body);
    const convId = oid(id);
    return this.idempotency.run(user._id, `POST /conversations/${id}/messages`, key, () => this.chat.send(user, convId, dto.content));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: UserDoc, @Param('id') id: string): Promise<void> {
    await this.chat.markRead(user, oid(id));
  }

  @Patch(':id')
  mute(@CurrentUser() user: UserDoc, @Param('id') id: string, @Body() body: unknown) {
    const dto = parse(z.object({ muted: z.boolean() }), body);
    return this.chat.setMuted(user, oid(id), dto.muted);
  }

  @Delete(':id')
  @HttpCode(204)
  async hide(@CurrentUser() user: UserDoc, @Param('id') id: string): Promise<void> {
    await this.chat.hide(user, oid(id));
  }
}
