import { stripVTControlCharacters } from 'node:util';

/** Only allowlisted metadata may leave the captured Wrangler process output. */
export function deploymentOutcome(result) {
  // Failure output and stderr are never publication evidence.
  const output =
    !result.error && result.status === 0
      ? stripVTControlCharacters(result.stdout ?? '')
      : '';
  const version =
    output.match(
      /Current Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/i,
    )?.[1] ?? null;
  return {
    status:
      !result.error && result.status === 0 && version ? 'published' : 'failed',
    version,
    exitCode: result.status ?? null,
  };
}

/** Classify failure locally; never return native output, paths or credentials. */
export function wranglerFailure(result) {
  const text = stripVTControlCharacters(
    `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
  const upstreamCode = Number(text.match(/\[code:\s*(\d{1,6})\]/i)?.[1]);
  let wranglerReason = 'UNKNOWN';
  if (result.error?.code === 'ENOBUFS') wranglerReason = 'OUTPUT_LIMIT';
  else if (result.error) wranglerReason = 'PROCESS_FAILED';
  else if (
    /following required secrets have not been set|missing required secrets/i.test(
      text,
    )
  )
    wranglerReason = 'MISSING_REQUIRED_SECRETS';
  else if (
    /authentication error|unauthorized|forbidden|permission denied|not authorized/i.test(
      text,
    )
  )
    wranglerReason = 'AUTHORIZATION_FAILED';
  else if (
    /unknown arguments?|unknown option|not enough non-option arguments/i.test(
      text,
    )
  )
    wranglerReason = 'CLI_ARGUMENT_ERROR';
  else if (/build failed|could not resolve|transform failed/i.test(text))
    wranglerReason = 'BUILD_FAILED';
  else if (Number.isInteger(upstreamCode) && upstreamCode > 0)
    wranglerReason = 'CLOUDFLARE_API_ERROR';
  else if (result.status === 0) wranglerReason = 'VERSION_ID_UNCONFIRMED';
  return {
    wranglerReason,
    ...(Number.isInteger(result.status) &&
    result.status >= 0 &&
    result.status <= 255
      ? { exitCode: result.status }
      : {}),
    ...(Number.isInteger(upstreamCode) &&
    upstreamCode > 0 &&
    upstreamCode <= 999999
      ? { upstreamCode }
      : {}),
  };
}
