import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { RuntimeConfigService } from '@beauty/config';
import { ObserveInstrument } from '@beauty/observability';
import { OperationsWorkerModule } from './operations-worker.module.js';

async function bootstrap() {
  const app = await NestFactory.create(OperationsWorkerModule, new ExpressAdapter(), {
    instrument: ObserveInstrument,
  });
  await app.listen(app.get(RuntimeConfigService).port);
}
await bootstrap();
