import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ObserveInstrument } from './infrastructure/observability/observability.module.js';
import { isObserveEnabled } from './infrastructure/config/configuration.js';
async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    isObserveEnabled() ? { instrument: ObserveInstrument } : {},
  );
  await app.listen(Number(process.env.PORT ?? 3000));
}
await bootstrap();
