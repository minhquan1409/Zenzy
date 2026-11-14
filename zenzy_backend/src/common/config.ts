/**
 * NGUỒN DUY NHẤT cho địa chỉ của server (host, cổng, URL công khai, origin được phép).
 * Mọi file khác (main.ts, healthcheck.ts, tài liệu, script) đều tham chiếu vào đây.
 *
 * Khi deploy: chỉ sửa khối `address` bên dưới (hoặc đặt biến môi trường cùng tên ghi ở từng dòng),
 * không file nào khác phải đổi.
 */
const address = {
  /** Giao diện mạng server lắng nghe. Loopback = chỉ máy này truy cập được. */
  host: '127.0.0.1',
  /** Dùng thay `host` khi LISTEN_ALL_INTERFACES=true (bắt buộc trong container Docker). */
  allInterfacesHost: '0.0.0.0',
  /** Cổng lắng nghe. */
  port: 8787,
  /** URL công khai của API (không gồm /v1). Để trống = tự ghép từ host và cổng ở trên. */
  publicUrl: '',
  /** Origin được phép gọi API (CORS), cách nhau bởi dấu phẩy; * = tất cả. */
  corsOrigin: '*',
};

const apiPrefix = 'v1';
const port = Number(process.env.PORT ?? address.port);
const host =
  process.env.HOST ?? (process.env.LISTEN_ALL_INTERFACES === 'true' ? address.allInterfacesHost : address.host);
const publicUrl = (process.env.PUBLIC_URL || address.publicUrl || `http://${address.host}:${port}`).replace(/\/+$/, '');

/** Cấu hình của server; phần không phải địa chỉ đọc từ biến môi trường (xem .env.example). */
export const config = {
  host,
  port,
  /** Tiền tố của mọi route. */
  apiPrefix,
  publicUrl,
  /** URL gốc của API mà client gọi, ví dụ dùng cho link trong email hay tài liệu. */
  apiUrl: `${publicUrl}/${apiPrefix}`,
  /** URL kiểm tra tình trạng, luôn gọi qua loopback của chính tiến trình này. */
  healthUrl: `http://${address.host}:${port}/${apiPrefix}/health`,
  corsOrigin: process.env.CORS_ORIGIN ?? address.corsOrigin,
  mongoUri: process.env.MONGODB_URI ?? '',
  /**
   * Database trong cluster. Bản localhost dùng DB riêng `zenzylocaldemo` (cùng cluster với DB `Zenzy` cũ)
   * để dữ liệu thử không lẫn vào dữ liệu thật. Khi deploy đặt MONGODB_DB=Zenzy trong .env của server.
   */
  mongoDb: process.env.MONGODB_DB || 'zenzylocaldemo',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
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
