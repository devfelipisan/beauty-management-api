import { NestFactory } from '@nestjs/core';
import { RuntimeConfigService } from '../../../libs/config/src/index.js';
import { ObserveInstrument } from '../../../libs/observability/src/index.js';
import { OperationsWorkerModule } from './operations-worker.module.js';

async function bootstrap() {
  const app = await NestFactory.create(OperationsWorkerModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(app.get(RuntimeConfigService).port);
}
await bootstrap();
