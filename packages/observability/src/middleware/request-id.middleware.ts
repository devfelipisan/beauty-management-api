import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveSafeId(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveSafeId(request.header('x-request-id'));
    request.headers['x-request-id'] = requestId;
    (request as Request & { requestId: string }).requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
