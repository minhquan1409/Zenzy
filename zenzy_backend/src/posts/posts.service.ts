import { Injectable } from '@nestjs/common';
import { Filter, ObjectId } from 'mongodb';
import { Err, iso, nextTimeCursor, point, publicUser, timeCursorFilter } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db, isDuplicateKey } from '../core/db';
import { TextModeration } from '../core/support.services';
import { PAGE_SIZE, PostDoc, UserDoc } from '../core/types';

@Injectable()
export class PostsService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly text: TextModeration,
  ) {}

  /** Adds author (looked up at read time, never copied) and the caller's like/save state. */
  private async present(viewer: UserDoc, posts: PostDoc[]) {
    if (!posts.length) return [];
    const ids = posts.map((p) => p._id);
    const [authors, likes, saves, friends] = await Promise.all([
      this.db.users.find({ _id: { $in: posts.map((p) => p.author_id) } }).toArray(),
      this.db.postLikes.find({ user_id: viewer._id, post_id: { $in: ids } }).toArray(),
      this.db.savedPosts.find({ user_id: viewer._id, post_id: { $in: ids } }).toArray(),
      this.access.friendIds(viewer._id),
    ]);
    // Anti-scraping: people who are not the author's friends see the post's position rounded to ~100 m.
    const close = new Set([viewer._id, ...friends].map((id) => id.toHexString()));
    const coord = (p: PostDoc, i: 0 | 1) => {
      if (!p.loc) return null;
      const v = p.loc.coordinates[i];
      return close.has(p.author_id.toHexString()) ? v : Math.round(v * 1000) / 1000;
    };
    const authorById = new Map(authors.map((u) => [u._id.toHexString(), u]));
    const liked = new Set(likes.map((l) => l.post_id.toHexString()));
    const saved = new Set(saves.map((s) => s.post_id.toHexString()));
    return posts.map((p) => ({
      id: p._id.toHexString(),
      author: publicUser(authorById.get(p.author_id.toHexString())),
      text: p.text,
      photo_urls: p.photos,
      place_name: p.place_name,
      latitude: coord(p, 1),
      longitude: coord(p, 0),
      like_count: p.like_count,
      comment_count: p.comment_count,
      liked_by_me: liked.has(p._id.toHexString()),
      saved_by_me: saved.has(p._id.toHexString()),
      is_mine: p.author_id.equals(viewer._id),
      created_at: iso(p.created_at),
      updated_at: iso(p.updated_at),
    }));
  }

  /**
   * GET /posts: 20 per page, newest first. Only ACTIVE posts are returned, and never posts of
   * users in a block relation with the caller (US-21).
   */
  async feed(
    viewer: UserDoc,
    q: { feed: 'FOR_YOU' | 'FOLLOWING' | 'NEARBY'; latitude?: number; longitude?: number; cursor?: string; author_id?: ObjectId },
  ) {
    const blocked = await this.access.blockRelatedIds(viewer._id);
    const and: Filter<PostDoc>[] = [{ status: 'ACTIVE' }, { author_id: { $nin: blocked } }, timeCursorFilter(q.cursor)];
    if (q.author_id) and.push({ author_id: q.author_id }); // one user's posts (profile grid)
    if (q.feed === 'FOLLOWING') {
      // The spec has no follow relation, so FOLLOWING is the caller's accepted friends (plus own posts).
      and.push({ author_id: { $in: [...(await this.access.friendIds(viewer._id)), viewer._id] } });
    }
    if (q.feed === 'NEARBY') {
      if (q.latitude === undefined || q.longitude === undefined) {
        throw Err.badRequest('INVALID_INPUT', 'latitude and longitude are required for the NEARBY feed');
      }
      and.push({ loc: { $geoWithin: { $centerSphere: [[q.longitude, q.latitude], 5000 / 6378100] } } });
    }
    const posts = await this.db.posts.find({ $and: and }).sort({ created_at: -1, _id: -1 }).limit(PAGE_SIZE).toArray();
    return { items: await this.present(viewer, posts), next_cursor: nextTimeCursor(posts, PAGE_SIZE) };
  }

  async create(
    user: UserDoc,
    input: { text: string; photo_urls: string[]; place_name?: string | null; latitude?: number; longitude?: number },
  ) {
    await this.text.assertClean(input.text, input.place_name); // BR-01 -> 422, nothing saved
    const now = new Date();
    const post: PostDoc = {
      _id: new ObjectId(),
      author_id: user._id,
      text: input.text,
      photos: input.photo_urls,
      place_name: input.place_name ?? null,
      ...(input.latitude !== undefined && input.longitude !== undefined ? { loc: point(input.latitude, input.longitude) } : {}),
      status: 'ACTIVE', // posts are post-moderated (BR-04)
      like_count: 0,
      comment_count: 0,
      created_at: now,
      updated_at: now,
    };
    await this.db.posts.insertOne(post);
    return (await this.present(user, [post]))[0];
  }

  private async loadVisible(viewer: UserDoc, postId: ObjectId): Promise<PostDoc> {
    const post = await this.db.posts.findOne({ _id: postId });
    if (!post || !(await this.access.canSeePost(viewer, post))) throw Err.notFound('Post not found');
    return post;
  }

  private async loadOwn(user: UserDoc, postId: ObjectId): Promise<PostDoc> {
    const post = await this.db.posts.findOne({ _id: postId });
    if (!post || post.status === 'REMOVED') throw Err.notFound('Post not found');
    if (!post.author_id.equals(user._id)) {
      if (!(await this.access.canSeePost(user, post))) throw Err.notFound('Post not found');
      throw Err.forbidden('NOT_AUTHOR', 'Only the author can change this post');
    }
    return post;
  }

  /** One post, with the same visibility rules as the feed (hidden posts and blocked authors are 404). */
  async one(viewer: UserDoc, postId: ObjectId) {
    return (await this.present(viewer, [await this.loadVisible(viewer, postId)]))[0];
  }

  async update(user: UserDoc, postId: ObjectId, text: string) {
    const post = await this.loadOwn(user, postId);
    await this.text.assertClean(text);
    const updated = await this.db.posts.findOneAndUpdate(
      { _id: post._id },
      { $set: { text, updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return (await this.present(user, [updated!]))[0];
  }

  async remove(user: UserDoc, postId: ObjectId): Promise<void> {
    const post = await this.loadOwn(user, postId);
    await this.db.tx(async (session) => {
      await this.db.posts.deleteOne({ _id: post._id }, { session });
      await this.db.postLikes.deleteMany({ post_id: post._id }, { session });
      await this.db.postComments.deleteMany({ post_id: post._id }, { session });
      await this.db.savedPosts.deleteMany({ post_id: post._id }, { session });
    });
  }

  async setLike(user: UserDoc, postId: ObjectId, liked: boolean): Promise<void> {
    const post = await this.loadVisible(user, postId);
    if (liked) {
      try {
        await this.db.postLikes.insertOne({ post_id: post._id, user_id: user._id, created_at: new Date() });
        await this.db.posts.updateOne({ _id: post._id }, { $inc: { like_count: 1 } });
      } catch (e) {
        if (!isDuplicateKey(e)) throw e; // already liked: the unique index keeps the counter exact
      }
    } else {
      const res = await this.db.postLikes.deleteOne({ post_id: post._id, user_id: user._id });
      if (res.deletedCount) await this.db.posts.updateOne({ _id: post._id }, { $inc: { like_count: -1 } });
    }
  }

  async setSaved(user: UserDoc, postId: ObjectId, saved: boolean): Promise<void> {
    if (saved) {
      const post = await this.loadVisible(user, postId);
      await this.db.savedPosts.updateOne(
        { user_id: user._id, post_id: post._id },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true },
      );
    } else {
      await this.db.savedPosts.deleteOne({ user_id: user._id, post_id: postId });
    }
  }

  async saved(user: UserDoc, cursor?: string) {
    const rows = await this.db.savedPosts
      .find({ user_id: user._id, ...timeCursorFilter(cursor) })
      .sort({ created_at: -1, _id: -1 })
      .limit(PAGE_SIZE)
      .toArray();
    const blocked = await this.access.blockRelatedIds(user._id);
    const posts = await this.db.posts
      .find({ _id: { $in: rows.map((r) => r.post_id) }, status: 'ACTIVE', author_id: { $nin: blocked } })
      .toArray();
    const byId = new Map(posts.map((p) => [p._id.toHexString(), p]));
    const ordered = rows.map((r) => byId.get(r.post_id.toHexString())).filter((p): p is PostDoc => !!p);
    return { items: await this.present(user, ordered), next_cursor: nextTimeCursor(rows, PAGE_SIZE) };
  }

  async comments(viewer: UserDoc, postId: ObjectId, cursor?: string) {
    const post = await this.loadVisible(viewer, postId);
    const blocked = await this.access.blockRelatedIds(viewer._id);
    const rows = await this.db.postComments
      .find({ post_id: post._id, author_id: { $nin: blocked }, ...timeCursorFilter(cursor) })
      .sort({ created_at: -1, _id: -1 })
      .limit(PAGE_SIZE)
      .toArray();
    const authors = await this.db.users.find({ _id: { $in: rows.map((r) => r.author_id) } }).toArray();
    const byId = new Map(authors.map((u) => [u._id.toHexString(), u]));
    return {
      items: rows.map((c) => ({
        id: c._id.toHexString(),
        author: publicUser(byId.get(c.author_id.toHexString())),
        text: c.text,
        created_at: iso(c.created_at),
      })),
      next_cursor: nextTimeCursor(rows, PAGE_SIZE),
    };
  }

  async addComment(user: UserDoc, postId: ObjectId, text: string) {
    const post = await this.loadVisible(user, postId);
    await this.text.assertClean(text);
    const comment = { _id: new ObjectId(), post_id: post._id, author_id: user._id, text, created_at: new Date() };
    await this.db.postComments.insertOne(comment);
    await this.db.posts.updateOne({ _id: post._id }, { $inc: { comment_count: 1 } });
    return { id: comment._id.toHexString(), author: publicUser(user), text, created_at: iso(comment.created_at) };
  }
}
