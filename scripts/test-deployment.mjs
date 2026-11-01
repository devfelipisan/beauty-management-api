import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('scripts', { recursive: true })
  .filter((path) => path.endsWith('.test.mjs'))
  .sort()
  .map((path) => `scripts/${path}`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
