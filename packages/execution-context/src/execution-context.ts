import type { ExecutionSource } from './execution-source.js';

export interface ExecutionContext {
  requestId: string;
  correlationId: string;
  traceId?: string;
  source: ExecutionSource;
  service: string;
  operation?: string;
  tenantId?: string;
  actorId?: string;
}
