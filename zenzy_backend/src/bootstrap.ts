import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppConfig } from './core/config';
import { MediaService } from './core/media.service';

/** Builds the app with the same settings for production and the tests. */
export async function createApp(options: { logger?: false } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : ['log', 'warn', 'error'],
    bodyParser: true,
  });
  const config = app.get(AppConfig);
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet()); // JSON bodies are limited to Express's default 100 kB
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false });
  app.setGlobalPrefix('v1', { exclude: ['health'] }); // base URL ends in /v1 (spec 5.3.1)
  app.useWebSocketAdapter(new IoAdapter(app));
  const media = app.get(MediaService);
  if (media.localDir) app.useStaticAssets(media.localDir, { prefix: '/media/', maxAge: '7d' });
  // Admin dashboard (UC-17 to UC-20): a static page that calls this same API with an admin token.
  const adminDir = [join(__dirname, '..', 'admin'), join(__dirname, '..', '..', 'admin')].find((d) => existsSync(join(d, 'index.html')));
  if (adminDir) app.useStaticAssets(adminDir, { prefix: '/admin/', index: 'index.html' });
  app.enableShutdownHooks();
  return app;
}
