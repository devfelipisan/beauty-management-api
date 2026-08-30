import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { ObserveObservabilityService } from './adapters/observe-observability.service.js';
import { ObservableOperationInterceptor } from './interceptors/observability.interceptor.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';
import { OBSERVABILITY_PORT } from './contracts/observability.port.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  attachTraceIdToLogs: true,
  sourceContext: { linesOfContext: 5, maxFrames: 5, sourceMaps: false },
});

@Module({
  imports: [
    ConfigModule,
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.get<string>('OBSERVE_APP_KEY', ''),
        appSecret: config.get<string>('OBSERVE_APP_SECRET', ''),
        serviceId: config.getOrThrow<string>('SERVICE_ID'),
        serviceVersion: config.get<string>('SERVICE_VERSION', 'local'),
        endpoint: config.get<string>('OBSERVE_ENDPOINT'),
        runtimeMetrics: config.get<boolean>('OBSERVE_RUNTIME_METRICS', true),
        runtimeMetricsInterval: config.get<number>('OBSERVE_RUNTIME_METRICS_INTERVAL', 60000),
        forwardLogs: config.get<boolean>('OBSERVE_FORWARD_LOGS', true),
        tracesSampleRate: config.get<number>('OBSERVE_TRACE_SAMPLE_RATE', 1),
        maxTracesPerBatch: config.get<number>('OBSERVE_MAX_TRACES_PER_BATCH', 1000),
        flushInterval: config.get<number>('OBSERVE_FLUSH_INTERVAL', 5000),
        debug: config.get<string>('NODE_ENV', 'development') === 'development' &&
          config.get<boolean>('OBSERVE_DEBUG', false),
        redaction: {
          enabled: true,
          useDefaultPatterns: true,
          replacement: '[REDACTED]',
          keys: ['password', 'authorization', 'cookie', 'accessToken', 'refreshToken',
            'token', 'secret', 'apiKey', 'cpf', 'email', 'phone'],
        },
        http: {
          ignore: ['/health', '/health/live', '/health/ready'],
          tags: {
            project: 'beauty-management',
            environment: config.get<string>('NODE_ENV', 'development'),
          },
          queryParamsObfuscateRegex: /token|password|secret|cpf|email|phone/i,
        },
      }),
    }),
  ],
  providers: [
    RequestContextMiddleware,
    ObserveObservabilityService,
    { provide: OBSERVABILITY_PORT, useExisting: ObserveObservabilityService },
    { provide: APP_INTERCEPTOR, useClass: ObservableOperationInterceptor },
  ],
  exports: [OBSERVABILITY_PORT, ObserveObservabilityService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
