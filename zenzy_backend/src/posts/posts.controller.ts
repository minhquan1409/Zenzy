import { Controller, Get } from '@nestjs/common';
import { PostsService } from './posts.service.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** GET /v1/posts — dữ liệu màn Newsfeed. */
  @Get()
  feed() {
    return this.posts.feed();
  }
}
