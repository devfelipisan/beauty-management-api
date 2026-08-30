import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  traceIdGenerator: (request: unknown) =>
    (
      request as { headers?: Record<string, string | string[] | undefined> }
    ).headers?.['x-request-id']?.toString() ?? crypto.randomUUID(),
  attachTraceIdToLogs: true,
  sourceContext: { linesOfContext: 5, maxFrames: 5, sourceMaps: false },
});
@Module({})
export class NoopObservabilityModule {}
@Module({
  imports: [
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.getOrThrow<string>('OBSERVE_APP_KEY'),
        appSecret: config.getOrThrow<string>('OBSERVE_APP_SECRET'),
        serviceId: config.getOrThrow<string>('SERVICE_ID'),
        serviceVersion: config.get<string>('SERVICE_VERSION'),
        endpoint: config.get<string>('OBSERVE_ENDPOINT'),
        tracesSampleRate: config.get<number>('OBSERVE_TRACE_SAMPLE_RATE', 0.1),
        debug: config.get<boolean>('OBSERVE_DEBUG', false),
        http: { ignore: ['/health', '/health/live', '/health/ready'] },
      }),
    }),
  ],
})
export class RemoteObservabilityModule {}
@Module({
  imports: [
    ConfigModule,
    process.env.OBSERVE_ENABLED === 'true'
      ? RemoteObservabilityModule
      : NoopObservabilityModule,
  ],
})
export class ObservabilityModule {}
