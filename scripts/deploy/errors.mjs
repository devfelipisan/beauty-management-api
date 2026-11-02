const codes = new Set([
  'INVALID_REQUEST',
  'INVALID_VERSIONED_CONFIGURATION',
  'REMOTE_CREDENTIALS_UNAVAILABLE',
  'REMOTE_TRANSPORT_ERROR',
  'REMOTE_RESPONSE_INVALID',
  'REMOTE_UNAUTHENTICATED',
  'REMOTE_ACCESS_DENIED',
  'REMOTE_RESOURCE_UNAVAILABLE',
  'REMOTE_HTTP_ERROR',
  'BINDING_MISSING',
  'BINDING_TYPE_INVALID',
  'BINDING_VALUE_INVALID',
  'BINDING_MISMATCH',
  'PUBLISHED_VERSION_MISMATCH',
  'SCHEDULE_MISMATCH',
  'PUBLIC_EXPOSURE',
  'RESOURCE_MISMATCH',
  'SCHEMA_NOT_READY',
  'CONTRACT_INCOMPATIBLE',
  'MANIFEST_INVALID',
  'MANIFEST_UNAVAILABLE',
  'PROVENANCE_UNAVAILABLE',
  'ADOPTION_EVIDENCE_INVALID',
  'FIRST_PUBLICATION_NOT_APPROVED',
  'SHA_INELIGIBLE',
  'CI_NOT_APPROVED',
  'WRANGLER_FAILED',
  'BUCKET_PUBLIC',
  'CAPACITY_INVENTORY_PENDING',
  'CAPACITY_POLICY_PENDING',
  'CAPACITY_WRITERS_PENDING',
  'CAPACITY_RESPONSE_INVALID',
  'PROTECTION_UNAVAILABLE',
]);
const phases = new Set([
  'validation',
  'preflight',
  'publish',
  'postcheck',
  'readiness',
  'audit',
  'inventory',
  'eligibility',
  'provenance',
]);
const operations = new Set([
  'configuration',
  'worker.settings',
  'worker.deployments',
  'worker.schedules',
  'worker.exposure',
  'database.schema',
  'database.metadata',
  'bucket.metadata',
  'bucket.managed-domain',
  'bucket.custom-domains',
  'media.approvals',
  'github.request',
  'github.ci',
  'github.deployment',
  'github.manifest',
  'wrangler.deploy',
  'release',
]);
const serviceMismatchReasons = new Set([
  'TYPE_MISMATCH',
  'DESTINATION_MISMATCH',
  'SELECTOR_MISMATCH',
  'PROPS_MISMATCH',
]);
const serviceSelectors = new Set(['ENTRYPOINT', 'ENVIRONMENT', 'BOTH']);
const wranglerReasons = new Set([
  'UNKNOWN',
  'OUTPUT_LIMIT',
  'PROCESS_FAILED',
  'MISSING_REQUIRED_SECRETS',
  'AUTHORIZATION_FAILED',
  'CLI_ARGUMENT_ERROR',
  'BUILD_FAILED',
  'CLOUDFLARE_API_ERROR',
  'VERSION_ID_UNCONFIRMED',
]);
function wranglerFields(value) {
  return {
    ...(wranglerReasons.has(value.wranglerReason)
      ? { wranglerReason: value.wranglerReason }
      : {}),
    ...(Number.isInteger(value.exitCode) &&
    value.exitCode >= 0 &&
    value.exitCode <= 255
      ? { exitCode: value.exitCode }
      : {}),
    ...(Number.isInteger(value.upstreamCode) &&
    value.upstreamCode > 0 &&
    value.upstreamCode <= 999999
      ? { upstreamCode: value.upstreamCode }
      : {}),
  };
}
export const requiredBindingsFailure =
  'Required production bindings unavailable; deployment blocked.';
export class DeploymentValidationError extends Error {
  constructor(code, context = {}) {
    super(requiredBindingsFailure);
    this.code = codes.has(code) ? code : 'REMOTE_RESPONSE_INVALID';
    this.phase = phases.has(context.phase) ? context.phase : 'validation';
    this.operation = operations.has(context.operation)
      ? context.operation
      : 'release';
    if (['operations', 'billing', 'clinical'].includes(context.worker))
      this.worker = context.worker;
    if (
      typeof context.binding === 'string' &&
      /^[A-Z][A-Z0-9_]{0,63}$/.test(context.binding) &&
      context.allowedBindings instanceof Set &&
      context.allowedBindings.has(context.binding)
    )
      this.binding = context.binding;
    if (
      this.binding &&
      this.code === 'BINDING_MISMATCH' &&
      this.operation === 'worker.settings' &&
      serviceMismatchReasons.has(context.reason)
    )
      this.reason = context.reason;
    if (
      this.reason === 'SELECTOR_MISMATCH' &&
      serviceSelectors.has(context.selector)
    )
      this.selector = context.selector;
    if (
      Number.isInteger(context.status) &&
      context.status >= 100 &&
      context.status <= 599
    )
      this.status = context.status;
    if (/^[A-Za-z0-9._:-]{1,128}$/.test(context.requestId ?? ''))
      this.requestId = context.requestId;
    if (/^[0-9a-f]{40}$/.test(context.commitSha ?? ''))
      this.commitSha = context.commitSha;
    if (this.code === 'WRANGLER_FAILED' && this.operation === 'wrangler.deploy')
      Object.assign(this, wranglerFields(context));
    if (
      this.code === 'PROVENANCE_UNAVAILABLE' &&
      ['NO_RECORDS', 'NO_ACCEPTED_RECORD'].includes(context.provenanceReason)
    )
      this.provenanceReason = context.provenanceReason;
  }
}
export function diagnostic(error, context = {}) {
  const safe =
    error instanceof DeploymentValidationError
      ? error
      : new DeploymentValidationError('REMOTE_RESPONSE_INVALID', context);
  return Object.fromEntries(
    [
      'code',
      'phase',
      'operation',
      'worker',
      'status',
      'requestId',
      'commitSha',
      'binding',
      'reason',
      'selector',
      'provenanceReason',
      'wranglerReason',
      'exitCode',
      'upstreamCode',
    ]
      .filter(
        (key) =>
          safe[key] !== undefined &&
          (!['wranglerReason', 'exitCode', 'upstreamCode'].includes(key) ||
            (safe.code === 'WRANGLER_FAILED' &&
              safe.operation === 'wrangler.deploy' &&
              wranglerFields(safe)[key] === safe[key])) &&
          (!['reason', 'selector'].includes(key) ||
            (safe.code === 'BINDING_MISMATCH' &&
              safe.operation === 'worker.settings' &&
              safe.binding !== undefined &&
              serviceMismatchReasons.has(safe.reason))) &&
          (key !== 'selector' ||
            (safe.reason === 'SELECTOR_MISMATCH' &&
              serviceSelectors.has(safe.selector))) &&
          (key !== 'provenanceReason' ||
            (safe.code === 'PROVENANCE_UNAVAILABLE' &&
              ['NO_RECORDS', 'NO_ACCEPTED_RECORD'].includes(
                safe.provenanceReason,
              ))),
      )
      .map((key) => [key, safe[key]]),
  );
}
export function fail(code, context) {
  throw new DeploymentValidationError(code, context);
}
