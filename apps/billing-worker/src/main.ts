import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { RuntimeConfigService } from '@beauty/config';
import { ObserveInstrument } from '@beauty/observability';
import { BillingWorkerModule } from './billing-worker.module.js';
const app = await NestFactory.create(BillingWorkerModule, new ExpressAdapter(), { instrument: ObserveInstrument });
await app.listen(app.get(RuntimeConfigService).port);
