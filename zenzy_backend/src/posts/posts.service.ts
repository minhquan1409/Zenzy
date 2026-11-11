import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.js';
import { out } from '../common/util.js';

@Injectable()
export class PostsService {
  constructor(private readonly db: DatabaseService) {}

  /** Bảng tin, theo thứ tự hiển thị. */
  async feed() {
    return (await this.db.col('posts').find().sort({ order: 1 }).limit(50).toArray()).map((p) => out(p));
  }
}
