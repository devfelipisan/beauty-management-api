export interface ObservabilityContext {
  traceId: string;
  requestId?: string;
  tenantId?: string;
  principalId?: string;
  operation?: string;
  entityId?: string;
  provider?: string;
  retryCount?: number;
}
