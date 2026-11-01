import { workerConfigurations } from '../deploy/config-contract.mjs';
import { fail } from '../deploy/errors.mjs';
export const firstPublicationWorkflow =
  '.github/workflows/infrastructure-first-publication.yml';
export const firstPublicationRequestPath =
  '.github/deploy/first-publication.json';
export const versionId = (value) =>
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value ?? '');
export function firstPublicationRequest(value, commitSha) {
  const scope = { phase: 'eligibility', operation: 'configuration', commitSha };
  const keys = [
    'commitSha',
    'authorizationReference',
    'compatibilityReference',
    'recoveryReference',
    'maintenanceReference',
    'workers',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    !/^[0-9a-f]{40}$/.test(value.commitSha ?? '') ||
    value.commitSha !== commitSha ||
    keys
      .slice(1, 5)
      .some(
        (key) =>
          typeof value[key] !== 'string' ||
          !value[key].trim() ||
          value[key].length > 512 ||
          /[\r\n]/.test(value[key]),
      ) ||
    !value.workers ||
    Object.keys(value.workers).sort().join() !==
      Object.keys(workerConfigurations).sort().join()
  )
    fail('FIRST_PUBLICATION_NOT_APPROVED', scope);
  for (const [worker, entry] of Object.entries(value.workers))
    if (
      !entry ||
      Object.keys(entry).join() !== 'versionId' ||
      !versionId(entry.versionId)
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', { ...scope, worker });
  return value;
}
