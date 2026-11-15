/**
 * NGUỒN DUY NHẤT cho mọi địa chỉ / link của server (localhost lẫn bản deploy).
 *
 * main.ts, config.ts, scripts/seed-demo.ts, scripts/docs-server.ts, scripts/postman.ts đều lấy địa chỉ
 * từ file này. Khi deploy hoặc đổi cổng: chỉ sửa khối ADDRESS bên dưới (hoặc đặt biến môi trường
 * ghi ở từng dòng), không file code nào khác phải đổi.
 *
 * File thuần TypeScript, không phụ thuộc NestJS, để các script cũng import được.
 */
export const ADDRESS = {
  /** Giao diện mạng server lắng nghe. 127.0.0.1 = chỉ máy này gọi được (bản localhost). Env: HOST. */
  host: '127.0.0.1',
  /** Cổng API. Env: PORT (Docker / AWS tự đặt). */
  port: 3100,
  /** Cổng trang tài liệu Swagger (`npm run docs`). Env: DOCS_PORT. */
  docsPort: 8088,
  /** MongoDB chạy trên máy (docker-compose.dev.yml), dùng khi .env không có MONGODB_URI. */
  localMongoUri: 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true',
  /** URL gốc (không gồm /v1) của bản đã deploy; là giá trị mặc định của `base_url` trong Postman. */
  deployedBaseUrl: 'https://zenzy.dpdns.org',
};

/** Host và cổng thực sự dùng để lắng nghe. */
export const listenHost = process.env.HOST || ADDRESS.host;
export const listenPort = Number(process.env.PORT || ADDRESS.port);

/** URL gốc (không gồm /v1) của server đang chạy trên máy này. */
export const localBaseUrl = `http://${ADDRESS.host}:${listenPort}`;
/** URL gốc của trang tài liệu Swagger trên máy. */
export const docsPort = Number(process.env.DOCS_PORT || ADDRESS.docsPort);
export const localDocsUrl = `http://${ADDRESS.host}:${docsPort}`;
