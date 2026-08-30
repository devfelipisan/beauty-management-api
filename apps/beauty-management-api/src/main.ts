import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from '../../../libs/observability/src/index.js';
import { RuntimeConfigService } from '../../../libs/config/src/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(app.get(RuntimeConfigService).port);
}
await bootstrap();
