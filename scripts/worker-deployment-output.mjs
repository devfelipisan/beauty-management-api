/** Only allowlisted metadata may leave the captured Wrangler process output. */
export function deploymentOutcome(result) {
  // Failure output and stderr are never publication evidence.
  const output =
    !result.error && result.status === 0 ? (result.stdout ?? '') : '';
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
