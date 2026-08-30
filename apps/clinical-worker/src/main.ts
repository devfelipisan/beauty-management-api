import { NestFactory } from '@nestjs/core';
import { ClinicalWorkerModule } from './clinical-worker.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ClinicalWorkerModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
