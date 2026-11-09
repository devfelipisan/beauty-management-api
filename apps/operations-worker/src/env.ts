/// <reference types="@cloudflare/workers-types" />
import type { WorkerSecurityEnv } from '@beauty/tenancy/adapters/worker-security';
export interface OperationsEnv extends WorkerSecurityEnv {
  /** JSON array of exclusively synthetic demo tenant IDs. Missing configuration denies selector reads. */
  SELECTOR_DEMO_TENANT_IDS?: string;
  D1_DATABASE: D1Database;
  PROFILE_MEDIA?: R2Bucket;
  MAX_PROFILE_IMAGE_BYTES?: string;
  CRONJOB_ENABLED?: string;
  CRONJOB?: string;
  CLINICAL_SERVICE: unknown;
  BILLING_SERVICE: unknown;
}
