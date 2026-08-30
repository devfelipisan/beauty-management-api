import { NestFactory } from '@nestjs/core';
import { RuntimeConfigService } from '../../../libs/config/src/index.js';
import { ObserveInstrument } from '../../../libs/observability/src/index.js';
import { BillingWorkerModule } from './billing-worker.module.js';
const app = await NestFactory.create(BillingWorkerModule, { instrument: ObserveInstrument });
await app.listen(app.get(RuntimeConfigService).port);
