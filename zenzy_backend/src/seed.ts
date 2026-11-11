// Nạp (hoặc nạp lại) dữ liệu mẫu vào MongoDB: `npm run seed`.
// An toàn khi chạy nhiều lần; không xoá dữ liệu do người dùng tạo.
import { assertConfig, config } from './common/config.js';
import { DatabaseService } from './common/database.js';
import { seedDatabase } from './common/seed-data.js';

assertConfig();
config.seedOnBoot = false;
const db = new DatabaseService();
await db.onModuleInit();
const count = await seedDatabase(db);
console.log(`Đã nạp ${count} tài liệu mẫu vào database "${config.mongoDb}"`);
await db.onModuleDestroy();
