import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, oid, parse, Public, zId, zLat, zLng, zUrl } from '../common/http';
import { MAX_UPLOAD_BYTES, MediaService, UPLOAD_CONTENT_TYPES } from '../core/media.service';
import { IdempotencyService } from '../core/support.services';
import { AbuseService, RateLimit } from '../core/abuse.service';
import { UserDoc } from '../core/types';
import { PostsService } from './posts.service';

const zText = z.string().trim().max(500); // UC-21: up to 500 characters
const zCursor = z.object({ cursor: z.string().optional() });

@Controller()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly media: MediaService,
    private readonly idempotency: IdempotencyService,
    private readonly abuse: AbuseService,
  ) {}

  @Get('posts')
  @RateLimit({ bucket: 'feed', windowSec: 60, perUser: 120, perIp: 300 })
  async feed(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    const dto = parse(
      zCursor.extend({
        feed: z.enum(['FOR_YOU', 'FOLLOWING', 'NEARBY']).default('FOR_YOU'),
        author_id: zId.optional(),
        latitude: zLat.optional(),
        longitude: zLng.optional(),
      }),
      query,
    );
    if (dto.feed === 'NEARBY' && dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.abuse.checkSearchCenter(user, dto.latitude, dto.longitude);
    }
    return this.posts.feed(user, dto);
  }

  @Post('posts')
  create(@CurrentUser() user: UserDoc, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const dto = parse(
      z
        .object({
          text: zText.default(''),
          photo_urls: z.array(zUrl).max(4).default([]), // UC-21: up to 4 photos
          place_name: z.string().trim().max(120).nullable().optional(),
          latitude: zLat.optional(),
          longitude: zLng.optional(),
        })
        .refine((v) => v.text.length > 0 || v.photo_urls.length > 0, 'a post needs text or at least one photo'),
      body,
    );
    this.media.assertOwnMediaUrls(dto.photo_urls);
    return this.idempotency.run(user._id, 'POST /posts', key, () => this.posts.create(user, dto));
  }

  @Get('posts/:post_id')
  one(@CurrentUser() user: UserDoc, @Param('post_id') postId: string) {
    return this.posts.one(user, oid(postId));
  }

  @Patch('posts/:post_id')
  update(@CurrentUser() user: UserDoc, @Param('post_id') postId: string, @Body() body: unknown) {
    const dto = parse(z.object({ text: zText }), body);
    return this.posts.update(user, oid(postId), dto.text);
  }

  @Delete('posts/:post_id')
  @HttpCode(204)
  async remove(@CurrentUser() user: UserDoc, @Param('post_id') postId: string): Promise<void> {
    await this.posts.remove(user, oid(postId));
  }

  @Put('posts/:post_id/like')
  @HttpCode(204)
  async like(@CurrentUser() user: UserDoc, @Param('post_id') postId: string): Promise<void> {
    await this.posts.setLike(user, oid(postId), true);
  }

  @Delete('posts/:post_id/like')
  @HttpCode(204)
  async unlike(@CurrentUser() user: UserDoc, @Param('post_id') postId: string): Promise<void> {
    await this.posts.setLike(user, oid(postId), false);
  }

  @Put('posts/:post_id/save')
  @HttpCode(204)
  async save(@CurrentUser() user: UserDoc, @Param('post_id') postId: string): Promise<void> {
    await this.posts.setSaved(user, oid(postId), true);
  }

  @Delete('posts/:post_id/save')
  @HttpCode(204)
  async unsave(@CurrentUser() user: UserDoc, @Param('post_id') postId: string): Promise<void> {
    await this.posts.setSaved(user, oid(postId), false);
  }

  @Get('posts/:post_id/comments')
  comments(@CurrentUser() user: UserDoc, @Param('post_id') postId: string, @Query() query: unknown) {
    return this.posts.comments(user, oid(postId), parse(zCursor, query).cursor);
  }

  @Post('posts/:post_id/comments')
  addComment(@CurrentUser() user: UserDoc, @Param('post_id') postId: string, @Body() body: unknown) {
    const dto = parse(z.object({ text: zText.min(1) }), body);
    return this.posts.addComment(user, oid(postId), dto.text);
  }

  @Get('me/saved-posts')
  saved(@CurrentUser() user: UserDoc, @Query() query: unknown) {
    return this.posts.saved(user, parse(zCursor, query).cursor);
  }

  @Post('uploads/sign')
  @HttpCode(200)
  signUpload(@CurrentUser() user: UserDoc, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(
      z.object({
        purpose: z.enum(['AVATAR', 'POST_PHOTO', 'SHOP_IMAGE']),
        content_type: z.enum(UPLOAD_CONTENT_TYPES as [string, ...string[]]),
      }),
      body,
    );
    return this.media.signUpload(user._id, dto.purpose, dto.content_type, `${req.protocol}://${req.get('host')}`);
  }

  /** Development-only target of signed uploads when S3 is not configured (authorised by the signature). */
  @Public()
  @Post('uploads/local')
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1 } }))
  async uploadLocal(@Body() fields: Record<string, string>, @UploadedFile() file: { buffer: Buffer; size: number } | undefined): Promise<void> {
    await this.media.storeLocal(fields, file);
  }
}
