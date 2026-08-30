import type { ExecutionContext } from './execution-context.js';
import type { ExecutionSource } from './execution-source.js';

export interface ExecutionContextInput {
  requestId: string;
  correlationId: string;
  traceId?: string;
  source: ExecutionSource;
  service: string;
  operation?: string;
}

export class ExecutionContextFactory {
  create(input: ExecutionContextInput): ExecutionContext {
    return { ...input };
  }
}
