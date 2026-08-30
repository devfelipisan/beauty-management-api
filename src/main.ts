import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from '@beauty/observability';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(app.get(ConfigService).get<number>('PORT', 3000));
}
await bootstrap();
