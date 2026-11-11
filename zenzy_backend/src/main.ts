import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { assertConfig, config } from './common/config.js';
import { AllExceptionsFilter } from './common/util.js';

async function bootstrap(): Promise<void> {
  assertConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  // Nhật ký request: METHOD đường-dẫn mã-trạng-thái thời-gian.
  const http = new Logger('Request');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => http.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`));
    next();
  });
  app.enableCors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`Zenzy API đang chạy ở cổng ${config.port} (prefix /v1)`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
