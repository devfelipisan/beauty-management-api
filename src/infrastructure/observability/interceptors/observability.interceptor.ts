import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, tap, throwError } from 'rxjs';
import type { Request } from 'express';
import { OBSERVABLE_OPERATION } from '../decorators/observable-operation.decorator.js';
import { OBSERVABILITY_PORT, type ObservabilityPort } from '../contracts/observability.port.js';

@Injectable()
export class ObservableOperationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OBSERVABILITY_PORT) private readonly observability: ObservabilityPort,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const operation = this.reflector.getAllAndOverride<string>(
      OBSERVABLE_OPERATION, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<
      Request & { tenantId?: unknown; user?: { id?: unknown } }>();
    if (operation) this.observability.setAttribute('operation', operation);
    const requestId = request.header('x-request-id');
    if (requestId) this.observability.setAttribute('requestId', requestId);
    if (typeof request.tenantId === 'string') this.observability.setAttribute('tenantId', request.tenantId);
    if (typeof request.user?.id === 'string') this.observability.setAttribute('principalId', request.user.id);
    return next.handle().pipe(
      tap(() => this.observability.setAttribute('outcome', 'success')),
      catchError((error: unknown) => {
        this.observability.setAttribute('outcome', 'failure');
        return throwError(() => error);
      }),
    );
  }
}
