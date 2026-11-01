import { writeFileSync } from 'node:fs';
import { localManifest, readManifest } from './manifest.mjs';
import { manifestPath } from './config-contract.mjs';
import { diagnostic } from './errors.mjs';
try {
  if (process.argv.includes('--write'))
    writeFileSync(
      manifestPath,
      JSON.stringify(localManifest(), null, 2) + '\n',
    );
  else readManifest();
} catch (error) {
  console.error(
    JSON.stringify(
      diagnostic(error, { phase: 'validation', operation: 'configuration' }),
    ),
  );
  process.exitCode = 1;
}
