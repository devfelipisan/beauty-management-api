import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configurations, settings, response, sha } from './fixtures.mjs';
import { requiredJwtSecretNames } from './config-contract.mjs';
test('legacy validator at the reviewed base reproduces 48 explicit calls without remote access', async () => {
  const source = execFileSync(
    'git',
    [
      'show',
      'e7429ecf8802dad90f74803b7893b042ff307cb4:scripts/worker-required-secrets.mjs',
    ],
    { encoding: 'utf8' },
  );
  const compatible = source.replace(
    "'./worker-deployment-config.mjs'",
    JSON.stringify(
      pathToFileURL(resolve('scripts/worker-deployment-config.mjs')).href,
    ),
  );
  const legacy = await import(
    `data:text/javascript;base64,${Buffer.from(compatible).toString('base64')}`
  );
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const worker = url.match(
      /beauty-(operations|billing|clinical)-worker/,
    )?.[1];
    if (url.endsWith('/secrets'))
      return response(
        requiredJwtSecretNames.map((name) => ({ name, type: 'secret_text' })),
      );
    if (url.endsWith('/settings')) return response(settings(worker));
    if (url.endsWith('/query'))
      return response([
        {
          success: true,
          results: [
            {
              inventory_approved: 1,
              policy_approved: 1,
              writers_coordinated: 1,
              approval_reference: 'fixture',
            },
          ],
        },
      ]);
    if (url.endsWith('/schedules'))
      return response({
        schedules: (configurations[worker].triggers?.crons ?? []).map(
          (cron) => ({ cron }),
        ),
      });
    if (url.endsWith('/subdomain'))
      return response({ enabled: false, previews_enabled: false });
    if (url.includes('/d1/database/')) return response({ name: 'beauty_db' });
    if (url.endsWith('/managed')) return response({ enabled: false });
    if (url.endsWith('/custom')) return response({ domains: [] });
    if (url.endsWith('/beauty-r2')) return response({ name: 'beauty-r2' });
    assert.fail('Unexpected legacy endpoint');
  };
  const options = { accountId: 'fixture', apiToken: 'fixture', fetchImpl };
  // Original workflow preflight, existing-Worker bootstrap inventory, script
  // preflight, then the original post-deploy validator for each destination.
  await legacy.requireRemoteSecrets(configurations, 'all', options);
  for (const config of Object.values(configurations))
    await fetchImpl(`/workers/scripts/${config.name}/settings`);
  await legacy.requireRemoteSecrets(configurations, 'all', options);
  for (const worker of ['billing', 'clinical', 'operations'])
    await legacy.requireRemoteSecrets(configurations, worker, {
      ...options,
      publishedSha: sha,
    });
  assert.equal(calls.length, 48);
});
