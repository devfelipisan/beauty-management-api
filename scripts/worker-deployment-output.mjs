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

/** A bounded error excerpt for CI diagnostics, separate from publication evidence. */
export function wranglerErrorExcerpt(result, env = process.env) {
  if (result.status === 0 && !result.error)
    return 'Wrangler exited successfully without a recognized version ID.';
  const stdout = stripVTControlCharacters(result.stdout ?? '');
  const stderr = stripVTControlCharacters(result.stderr ?? '');
  const combined = `${stdout}\n${stderr}`;
  let excerpt = combined;
  const secrets = Object.entries(env)
    .filter(
      ([name, value]) =>
        /TOKEN|PASSWORD|SECRET|PRIVATE_KEY|API_KEY|AUTHORIZATION|CREDENTIAL|ACCESS_KEY|ACCOUNT_ID/i.test(
          name,
        ) &&
        typeof value === 'string' &&
        value.length,
    )
    .flatMap(([, value]) => [
      value,
      encodeURIComponent(value),
      JSON.stringify(value).slice(1, -1),
    ])
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets)
    excerpt = excerpt.split(secret).join('[REDACTED]');
  excerpt = excerpt
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|AUTHORIZATION)[A-Z0-9_]*)\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi,
      '[RESOURCE_ID]',
    )
    .replace(/\b[0-9a-f]{32}\b/gi, '[RESOURCE_ID]')
    .replace(/\/(?:home|tmp|workspace|Users)\/[^\s"']+/g, '[PATH]');
  const lines = excerpt.split(/\r?\n/);
  const first = lines.findIndex((line) =>
    /\[ERROR\]|\bError:|error\[|assertion failed/i.test(line),
  );
  const selected =
    first >= 0
      ? lines.slice(first, first + 12).join('\n')
      : lines
          .filter((line) => line.trim())
          .slice(-12)
          .join('\n');
  return (selected.trim() || 'Wrangler failed without captured output.').slice(
    0,
    1600,
  );
}
