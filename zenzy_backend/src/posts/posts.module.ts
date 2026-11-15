import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

/** COMP-07: feed, posts, likes, comments, saves. */
@Module({ controllers: [PostsController], providers: [PostsService] })
export class PostsModule {}
