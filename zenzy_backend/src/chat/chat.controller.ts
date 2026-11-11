import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, userIdOf } from '../common/auth.js';
import { ChatService } from './chat.service.js';

@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** GET /v1/conversations — dữ liệu màn Messages. */
  @Get()
  list() {
    return this.chat.conversations();
  }

  /** GET /v1/conversations/:id — dữ liệu màn Conversation. */
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request) {
    return this.chat.conversation(id, userIdOf(req));
  }

  /** POST /v1/conversations/:id/messages { text } */
  @Post(':id/messages')
  @UseGuards(JwtAuthGuard)
  send(@Param('id') id: string, @Req() req: Request, @Body() body: any) {
    return this.chat.send(id, userIdOf(req)!, body);
  }
}
