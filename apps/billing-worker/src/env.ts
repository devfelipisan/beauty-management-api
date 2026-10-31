/// <reference types="@cloudflare/workers-types" />
import type { WorkerSecurityEnv } from '@beauty/tenancy/adapters/worker-security';
export interface BillingEnv extends WorkerSecurityEnv {
  D1_DATABASE: D1Database;
  OPERATIONS_SERVICE?: unknown;
}
