import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** COMP-08: conversations and messages (real-time delivery goes through the core gateway). */
@Module({ controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}
