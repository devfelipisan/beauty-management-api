import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, tap, throwError } from 'rxjs';
import type { Request } from 'express';
import type { ExecutionContext as RequestExecutionContext } from '../../../execution-context/src/index.js';
import { OBSERVABLE_OPERATION } from '../decorators/observable-operation.decorator.js';
import { OBSERVABILITY_PORT, type ObservabilityPort } from '../contracts/observability.port.js';

type RequestWithContext = Request & {
  requestId?: string;
  correlationId?: string;
  executionContext?: RequestExecutionContext;
};

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OBSERVABILITY_PORT) private readonly observability: ObservabilityPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const operation = this.reflector.getAllAndOverride<string>(
      OBSERVABLE_OPERATION,
      [context.getHandler(), context.getClass()],
    ) ?? `${request.method} ${request.route?.path ?? request.path}`;
    const startedAt = performance.now();
    if (request.executionContext) {
      request.executionContext.operation = operation;
      request.executionContext.traceId = this.observability.currentTraceId() ?? undefined;
    }
    this.observability.setAttribute('requestId', request.requestId ?? '');
    this.observability.setAttribute('correlationId', request.correlationId ?? '');
    this.observability.setAttribute('operation', operation);

    return next.handle().pipe(
      tap(() => {
        this.observability.setAttribute('status', context.switchToHttp().getResponse().statusCode);
        this.observability.setAttribute('durationMs', Math.round(performance.now() - startedAt));
        this.observability.setAttribute('outcome', 'success');
      }),
      catchError((error: unknown) => {
        this.observability.setAttribute('status', context.switchToHttp().getResponse().statusCode);
        this.observability.setAttribute('durationMs', Math.round(performance.now() - startedAt));
        this.observability.setAttribute('outcome', 'failure');
        return throwError(() => error);
      }),
    );
  }
}
