import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { ClinicalWorkerModule } from './clinical-worker.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ClinicalWorkerModule, new ExpressAdapter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
