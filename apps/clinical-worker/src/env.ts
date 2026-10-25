/// <reference types="@cloudflare/workers-types" />
export interface ClinicalEnv {
  D1_DATABASE: D1Database;
  OPERATIONS_SERVICE: unknown;
  BILLING_SERVICE: unknown;
  SESSION_MEDIA: R2Bucket;
  MAX_CLINICAL_PHOTO_BYTES: string;
}
