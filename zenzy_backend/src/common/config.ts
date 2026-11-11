/** Cấu hình đọc từ biến môi trường (xem .env.example). */
export const config = {
  port: Number(process.env.PORT ?? 8080),
  mongoUri: process.env.MONGODB_URI ?? '',
  mongoDb: process.env.MONGODB_DB ?? 'Zenzy',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Tự nạp dữ liệu mẫu khi database còn trống. */
  seedOnBoot: (process.env.SEED_ON_BOOT ?? 'true') !== 'false',
  /** ID của người dùng mẫu (Clara) mà khách chưa đăng nhập được xem. */
  demoUserId: 'demo',
};

export function assertConfig(): void {
  const missing = [
    ['MONGODB_URI', config.mongoUri],
    ['JWT_SECRET', config.jwtSecret],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường: ${missing.map(([name]) => name).join(', ')}`);
  }
}
