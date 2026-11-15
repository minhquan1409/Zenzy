import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { AppConfig } from './core/config';

async function main(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfig);
  // Host và cổng lấy từ src/core/address.ts (mặc định 127.0.0.1 = chỉ máy này gọi được).
  await app.listen(config.port, config.host);
  new Logger('Main').log(
    `Zenzy API listening on http://${config.host}:${config.port} (REST under /v1, Socket.IO at /socket.io, database "${config.mongoDbName}")`,
  );
}

void main();
