import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { ObjectId } from 'mongodb';
import { ApiError, Err } from '../common/http';
import { AppConfig } from './config';

export const MAX_UPLOAD_BYTES = 500 * 1024; // spec: images are at most 500 KB
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const UPLOAD_CONTENT_TYPES = Object.keys(EXTENSIONS);

/**
 * Signed uploads to S3 (spec 4.1: only URLs are stored in MongoDB).
 * On EC2 the credentials come from the instance role; no access keys are configured.
 */
@Injectable()
export class MediaService {
  private readonly log = new Logger('Media');
  private readonly s3: S3Client | null;

  constructor(private readonly config: AppConfig) {
    this.s3 = config.s3Bucket ? new S3Client({ region: config.s3Region }) : null;
  }

  get localDir(): string {
    return this.config.mediaLocalDir ? resolve(this.config.mediaLocalDir) : '';
  }

  private sign(key: string, contentType: string, expires: number): string {
    return createHmac('sha256', this.config.jwtSecret).update(`${key}|${contentType}|${expires}`).digest('hex');
  }

  async signUpload(userId: ObjectId, purpose: string, contentType: string, requestBaseUrl = '') {
    const key = `media/${userId.toHexString()}/${purpose.toLowerCase()}-${randomUUID()}.${EXTENSIONS[contentType]}`;
    if (!this.s3 || !this.config.mediaPublicBaseUrl) {
      if (!this.localDir) throw new ApiError(503, 'UPLOADS_NOT_CONFIGURED', 'Media storage is not configured on this server');
      // Development: same multipart flow as S3, but the file goes to this server's disk.
      const base = this.config.publicBaseUrl || requestBaseUrl;
      const expires = Math.floor(Date.now() / 1000) + 300;
      return {
        upload_url: `${base}/v1/uploads/local`,
        method: 'POST',
        fields: { key, 'Content-Type': contentType, expires: String(expires), signature: this.sign(key, contentType, expires) },
        public_url: `${base}/${key}`,
        max_bytes: MAX_UPLOAD_BYTES,
        expires_in: 300,
      };
    }
    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.config.s3Bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: 300,
    });
    return {
      upload_url: url,
      method: 'POST',
      fields,
      public_url: `${this.config.mediaPublicBaseUrl}/${key}`,
      max_bytes: MAX_UPLOAD_BYTES,
      expires_in: 300,
    };
  }

  /**
   * Image links saved on profiles, posts and shops must point at this server's own media storage, so
   * nobody can make other users' apps load a tracking image from an outside server (which would reveal
   * their IP address). Google profile photos are also accepted. When no media URL is configured
   * (development and tests) any http(s) link is accepted.
   */
  assertOwnMediaUrls(urls: Array<string | null | undefined>): void {
    const bases = [this.config.mediaPublicBaseUrl, this.config.publicBaseUrl].filter(Boolean).map((b) => `${b}/media/`);
    if (!bases.length) return;
    const allowed = [...bases, 'https://lh3.googleusercontent.com/'];
    for (const url of urls) {
      if (url && !allowed.some((prefix) => url.startsWith(prefix))) {
        throw Err.badRequest('INVALID_MEDIA_URL', 'Images must be uploaded through POST /uploads/sign');
      }
    }
  }

  /** Stores a file uploaded with the fields from [signUpload] in the local media folder. */
  async storeLocal(fields: Record<string, string>, file: { buffer: Buffer; size: number } | undefined): Promise<void> {
    if (!this.localDir) throw Err.notFound();
    // A request without a multipart body has no fields at all.
    const { key, expires, signature } = fields ?? {};
    const contentType = fields?.['Content-Type'];
    if (!key || !contentType || !expires || !signature || !file) throw Err.badRequest('INVALID_INPUT', 'key, signature and file are required');
    const expected = Buffer.from(this.sign(key, contentType, Number(expires)));
    const given = Buffer.from(String(signature));
    if (expected.length !== given.length || !timingSafeEqual(expected, given) || Number(expires) < Date.now() / 1000) {
      throw Err.forbidden('INVALID_SIGNATURE', 'Upload signature is invalid or expired');
    }
    if (file.size > MAX_UPLOAD_BYTES) throw Err.badRequest('FILE_TOO_LARGE', 'Images must be at most 500 KB');
    if (!/^media\/[0-9a-f]{24}\/[a-z_]+-[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw Err.badRequest('INVALID_INPUT', 'invalid key');
    const target = join(this.localDir, key.slice('media/'.length));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.buffer);
  }

  /** NFR-10: removes every stored object of a deleted account. */
  async deleteUserMedia(userId: ObjectId): Promise<void> {
    if (this.localDir) await rm(join(this.localDir, userId.toHexString()), { recursive: true, force: true });
    if (!this.s3) return;
    const Prefix = `media/${userId.toHexString()}/`;
    try {
      let token: string | undefined;
      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({ Bucket: this.config.s3Bucket, Prefix, ContinuationToken: token }),
        );
        const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
        if (keys.length) {
          await this.s3.send(new DeleteObjectsCommand({ Bucket: this.config.s3Bucket, Delete: { Objects: keys } }));
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (e) {
      this.log.error(`could not delete media of ${userId.toHexString()}: ${(e as Error).message}`);
    }
  }
}
