/// <reference types="@cloudflare/workers-types" />
import type { WorkerSecurityEnv } from '@beauty/tenancy/adapters/worker-security';
export interface OperationsEnv extends WorkerSecurityEnv {
  D1_DATABASE: D1Database;
  PROFILE_MEDIA?: R2Bucket;
  CLINICAL_SERVICE: unknown;
  BILLING_SERVICE: unknown;
}
