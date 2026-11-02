import { fail } from './errors.mjs';

export const defaultCron = '0 3 * * *'; // 00:00 America/Sao_Paulo (UTC-3).
const bounds = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [1, 7],
];

function validField(field, [min, max]) {
  return field.split(',').every((part) => {
    const [base, step, ...extra] = part.split('/');
    if (
      extra.length ||
      (step !== undefined &&
        (!/^\d+$/.test(step) ||
          Number(step) < 1 ||
          Number(step) > max - min + 1))
    )
      return false;
    if (base === '*') return true;
    const range = base.split('-');
    if (
      range.length > 2 ||
      range.some(
        (value) =>
          !/^\d+$/.test(value) || Number(value) < min || Number(value) > max,
      )
    )
      return false;
    return range.length === 1 || Number(range[0]) <= Number(range[1]);
  });
}

export function cronPolicy(env = {}) {
  const enabled = env.CRONJOB_ENABLED?.trim().toLowerCase() ?? '';
  if (!['', 'true', 'false'].includes(enabled))
    fail('INVALID_VERSIONED_CONFIGURATION', {
      phase: 'validation',
      operation: 'configuration',
    });
  if (enabled !== 'true') return { enabled: false, crons: [] };
  const cron = env.CRONJOB?.trim() || defaultCron;
  const fields = cron.split(/\s+/);
  if (
    cron.length > 128 ||
    fields.length !== 5 ||
    fields.some((field, index) => !validField(field, bounds[index]))
  )
    fail('INVALID_VERSIONED_CONFIGURATION', {
      phase: 'validation',
      operation: 'configuration',
    });
  return { enabled: true, crons: [fields.join(' ')] };
}

export function scheduledConfiguration(worker, configuration, policy) {
  return worker === 'operations'
    ? {
        ...configuration,
        triggers: { ...configuration.triggers, crons: [...policy.crons] },
      }
    : configuration;
}

// Deployment evidence may contain zero or one Operations schedule.
export function recordedCrons(value) {
  if (
    !Array.isArray(value) ||
    value.length > 1 ||
    value.some((cron) => typeof cron !== 'string' || !cron.trim())
  )
    fail('INVALID_REQUEST', {
      phase: 'validation',
      operation: 'configuration',
    });
  return value.length
    ? cronPolicy({ CRONJOB_ENABLED: 'true', CRONJOB: value[0] }).crons
    : [];
}
