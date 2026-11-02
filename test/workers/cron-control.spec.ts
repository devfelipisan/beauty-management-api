import { describe, expect, it } from 'vitest';
import OperationsWorker from '../../apps/operations-worker/src/worker';

describe('Operations scheduled runtime control', () => {
  it.each([undefined, '', 'false', 'FALSE', 'invalid'])(
    'does not access storage or dispatch when CRONJOB_ENABLED=%s',
    async (CRONJOB_ENABLED) => {
      const env = new Proxy(
        { CRONJOB_ENABLED },
        {
          get(target, property) {
            if (property !== 'CRONJOB_ENABLED')
              throw new Error('Unexpected access to runtime dependencies');
            return target.CRONJOB_ENABLED;
          },
        },
      );
      await expect(
        OperationsWorker.prototype.scheduled.call({
          env,
        } as unknown as OperationsWorker),
      ).resolves.toBeUndefined();
    },
  );
});
