import { readFileSync } from 'node:fs';
import { cronPolicy, cronVariableNames } from './cron-policy.mjs';
import { fail } from './errors.mjs';

export const cronRequestPath = '.github/deploy/cron.json';
export function cronRequest(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !cronVariableNames.includes(key)) ||
    Object.values(value).some((item) => typeof item !== 'string')
  )
    fail('INVALID_VERSIONED_CONFIGURATION', {
      phase: 'validation',
      operation: 'configuration',
    });
  const policy = cronPolicy(value);
  // Validate the stored expression even while disabled, so activation is predictable.
  const schedule = cronPolicy({
    CRONJOB_ENABLED: 'true',
    CRONJOB: value.CRONJOB,
  }).crons[0];
  return { CRONJOB_ENABLED: String(policy.enabled), CRONJOB: schedule };
}
export function readCronRequest(path = cronRequestPath) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('INVALID_VERSIONED_CONFIGURATION', {
      phase: 'validation',
      operation: 'configuration',
    });
  }
  return cronRequest(value);
}
