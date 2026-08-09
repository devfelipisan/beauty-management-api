export type ExecutionSource = "web" | "api" | "worker" | "job";

export interface ExecutionContext {
  requestId: string;
  correlationId: string;
  operation: string;
  source: ExecutionSource;
  tenantId?: string;
  actorId?: string;
}
