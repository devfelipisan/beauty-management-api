/// <reference types="@cloudflare/workers-types" />
export interface OperationsEnv {
  D1_DATABASE: D1Database;
  CLINICAL_SERVICE: unknown;
  BILLING_SERVICE: unknown;
}
