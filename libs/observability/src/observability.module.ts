import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { OBSERVABILITY_PORT } from './contracts/observability.port.js';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware.js';
import { RequestIdMiddleware } from './middleware/request-id.middleware.js';
import { HttpObservabilityInterceptor } from './interceptors/http-observability.interceptor.js';
import { ObserveObservabilityService } from './observe-observability.service.js';
import { TelemetrySanitizer } from './sanitization/telemetry-sanitizer.js';

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
      useFactory: (config: ConfigService) => {
        const enabled = config.get<boolean>('OBSERVE_ENABLED', false);
        return {
          appKey: config.get<string>('OBSERVE_APP_KEY', ''),
          appSecret: config.get<string>('OBSERVE_APP_SECRET', ''),
          serviceId: config.getOrThrow<string>('SERVICE_ID'),
          serviceVersion: config.get<string>('SERVICE_VERSION', 'development'),
          endpoint: config.get<string>('OBSERVE_ENDPOINT'),
          runtimeMetrics: enabled && config.get<boolean>('OBSERVE_RUNTIME_METRICS', true),
          runtimeMetricsInterval: config.get<number>('OBSERVE_RUNTIME_METRICS_INTERVAL', 60000),
          forwardLogs: enabled && config.get<boolean>('OBSERVE_FORWARD_LOGS', true),
          tracesSampleRate: enabled
            ? config.get<number>('OBSERVE_TRACE_SAMPLE_RATE', 0.1)
            : 0,
          maxTracesPerBatch: config.get<number>('OBSERVE_MAX_TRACES_PER_BATCH', 1000),
          flushInterval: config.get<number>('OBSERVE_FLUSH_INTERVAL', 5000),
          debug: config.get<boolean>('OBSERVE_DEBUG', false),
          redaction: {
            enabled: true,
            useDefaultPatterns: true,
            replacement: '[REDACTED]',
            keys: [
              'password', 'authorization', 'cookie', 'set-cookie', 'accessToken',
              'refreshToken', 'token', 'secret', 'apiKey', 'cpf', 'document',
              'email', 'phone', 'medical', 'allergy', 'medication', 'signedUrl',
              'presignedUrl',
            ],
          },
          http: {
            ignore: ['/health'],
            tags: {
              project: 'beauty-management',
              environment: config.get<string>('NODE_ENV', 'development'),
            },
            queryParamsObfuscateRegex: /token|password|secret|cpf|email|phone/i,
          },
        };
      },
    }),
  ],
  providers: [
    RequestIdMiddleware,
    CorrelationIdMiddleware,
    TelemetrySanitizer,
    ObserveObservabilityService,
    { provide: OBSERVABILITY_PORT, useExisting: ObserveObservabilityService },
    { provide: APP_INTERCEPTOR, useClass: HttpObservabilityInterceptor },
  ],
  exports: [OBSERVABILITY_PORT, ObserveObservabilityService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, CorrelationIdMiddleware)
      .forRoutes('*');
  }
}
