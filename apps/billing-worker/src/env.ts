/// <reference types="@cloudflare/workers-types" />
export interface BillingEnv {
  D1_DATABASE: D1Database;
  OPERATIONS_SERVICE?: unknown;
}
