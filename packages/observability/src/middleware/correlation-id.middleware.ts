import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { ExecutionContextFactory, type ExecutionContext } from '@beauty/execution-context';
import { resolveSafeId } from './request-id.middleware.js';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestWithContext = request as Request & {
      requestId?: string;
      correlationId?: string;
      executionContext?: ExecutionContext;
    };
    const correlationId = resolveSafeId(
      request.header('x-correlation-id') ?? requestWithContext.requestId,
    );
    request.headers['x-correlation-id'] = correlationId;
    requestWithContext.correlationId = correlationId;
    requestWithContext.executionContext = new ExecutionContextFactory().create({
      requestId: requestWithContext.requestId ?? correlationId,
      correlationId,
      source: 'web',
      service: this.config.getOrThrow<string>('SERVICE_ID'),
    });
    response.setHeader('x-correlation-id', correlationId);
    next();
  }

  constructor(private readonly config: ConfigService) {}
}
