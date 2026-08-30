export const OBSERVABILITY_ATTRIBUTES = new Set([
  'traceId', 'requestId', 'tenantId', 'principalId', 'operation', 'entityId',
  'serviceId', 'serviceVersion', 'queueName', 'jobName', 'jobId', 'provider',
  'retryCount', 'attempt', 'status', 'outcome',
]);
export function isAllowedObservabilityAttribute(key: string): boolean {
  return OBSERVABILITY_ATTRIBUTES.has(key);
}
