import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection, Db, MongoClient } from 'mongodb';
import { config } from './config.js';
import { seedDatabase } from './seed-data.js';

/** Tài liệu MongoDB dùng `_id` kiểu chuỗi (slug cho dữ liệu mẫu, hex cho dữ liệu người dùng tạo). */
export type Doc = { _id: string } & Record<string, any>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');
  private client!: MongoClient;
  private db!: Db;

  async onModuleInit(): Promise<void> {
    this.client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
    await this.client.connect();
    this.db = this.client.db(config.mongoDb);
    await this.db.command({ ping: 1 });
    this.logger.log(`Đã kết nối MongoDB, database "${config.mongoDb}"`);
    await this.ensureIndexes();
    if (config.seedOnBoot && (await this.col('shops').countDocuments()) === 0) {
      const count = await seedDatabase(this);
      this.logger.log(`Database trống: đã nạp ${count} tài liệu mẫu`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  col(name: string): Collection<Doc> {
    return this.db.collection<Doc>(name);
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureIndexes(): Promise<void> {
    await this.col('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await this.col('map_pins').createIndex({ view: 1 });
    // Live pin của người dùng tự hết hạn.
    await this.col('map_pins').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await this.col('messages').createIndex({ conversation_id: 1, order: 1 });
    await this.col('shops').createIndex({ owner_id: 1 });
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
