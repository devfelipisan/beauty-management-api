import { env, exports } from 'cloudflare:workers';
import { BillingComposition } from '../../apps/billing-worker/src/composition-root.js';

/** Domain/D1 qualification only. This is deliberately not an authorized public RPC. */
export function internalBillingFixture(): BillingComposition {
  return new BillingComposition({
    ...env,
    OPERATIONS_SERVICE: exports.default,
  } as never);
}
