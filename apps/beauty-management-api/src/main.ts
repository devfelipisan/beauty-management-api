import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from '@beauty/observability';
import { RuntimeConfigService } from '@beauty/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    instrument: ObserveInstrument,
  });
  await app.listen(app.get(RuntimeConfigService).port);
}
await bootstrap();
