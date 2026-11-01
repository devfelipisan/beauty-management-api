import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { workerConfigurations } from './deploy/config-contract.mjs';
import {
  deploymentRequest,
  readConfiguration,
  validateWorkerConfigurations,
} from './deploy/validate-local.mjs';
export * from './deploy/config-contract.mjs';
export * from './deploy/validate-local.mjs';

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const request = deploymentRequest(
      JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
    );
    validateWorkerConfigurations(
      Object.fromEntries(
        Object.entries(workerConfigurations).map(([name, path]) => [
          name,
          readConfiguration(path),
        ]),
      ),
      request.mode === 'deploy',
    );
    console.log(
      `Validated ${request.requestId}: ${request.mode}/${request.worker}`,
    );
  } catch {
    console.error(
      JSON.stringify({
        code: 'INVALID_VERSIONED_CONFIGURATION',
        phase: 'validation',
      }),
    );
    process.exitCode = 1;
  }
}
