/// <reference types="@cloudflare/workers-types" />
import type { WorkerSecurityEnv } from '@beauty/tenancy/adapters/worker-security';
export interface ClinicalEnv extends WorkerSecurityEnv {
  D1_DATABASE: D1Database;
  OPERATIONS_SERVICE: unknown;
  BILLING_SERVICE: unknown;
  SESSION_MEDIA?: R2Bucket;
  MAX_CLINICAL_PHOTO_BYTES?: string;
}
