import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  deploymentRequest,
  readConfiguration,
  validateWorkerConfigurations,
  workerConfigurations,
} from './worker-deployment-config.mjs';

const request = deploymentRequest(
  JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
);
if (request.mode !== 'deploy' || request.worker !== 'all')
  throw new Error('Bootstrap requires an approved all/deploy request');
const configs = Object.fromEntries(
  Object.entries(workerConfigurations).map(([name, path]) => [
    name,
    readConfiguration(path),
  ]),
);
validateWorkerConfigurations(configs, true);
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare credentials required');
async function workerExists(name) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(name)}/settings`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (response.status === 404) return false;
  if (!response.ok || !(await response.json()).success)
    throw new Error(`Cannot inspect Worker ${name} (HTTP ${response.status})`);
  return true;
}
const inventory = await Promise.all(
  Object.values(configs).map(async (config) => [
    config.name,
    await workerExists(config.name),
  ]),
);
const existing = new Set(
  inventory.filter(([, present]) => present).map(([name]) => name),
);
const missing = Object.values(configs).filter(
  (config) => !existing.has(config.name),
);
console.log(
  JSON.stringify({
    existing: Object.values(configs)
      .filter((config) => existing.has(config.name))
      .map((config) => config.name),
    missing: missing.map((config) => config.name),
  }),
);
if (!process.argv.includes('--apply')) {
  console.log('Inspection only; no Workers were published');
} else if (missing.length) {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/feature/microsservices'
  )
    throw new Error('Bootstrap only through the protected production workflow');
  const directory = resolve('.cache', `bootstrap-${crypto.randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  const main = resolve(directory, 'unavailable.mjs');
  writeFileSync(
    main,
    'export default { fetch() { return new Response(null, { status: 503 }); } };\n',
  );
  for (const config of missing) {
    if (await workerExists(config.name))
      throw new Error(
        `Worker appeared after inspection; refusing to overwrite ${config.name}`,
      );
    const path = resolve(directory, `${config.name}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        name: config.name,
        main,
        compatibility_date: config.compatibility_date,
        workers_dev: false,
        preview_urls: false,
      }),
    );
    const deployed = spawnSync(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'deploy',
        '--env',
        '',
        '--config',
        path,
      ],
      { stdio: 'inherit' },
    );
    if (deployed.error || deployed.status !== 0)
      throw new Error(`Private bootstrap failed: ${config.name}`);
  }
  console.log(
    'Missing private Workers created; the workflow must now publish their complete configurations',
  );
} else {
  console.log('All Workers already exist; no deployments were performed');
}
