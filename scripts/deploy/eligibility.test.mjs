import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { githubClient, runnerExecution } from './github-client.mjs';
import { digest } from './manifest.mjs';
import { sha, version, manifest } from './fixtures.mjs';
const repository = 'owner/beauty';
const json = (value) => ({ ok: true, json: async () => value });
const encoded = (value) =>
  json({
    encoding: 'base64',
    content: Buffer.from(
      typeof value === 'string' ? value : JSON.stringify(value),
    ).toString('base64'),
  });
const job = (changes = {}) => ({
  id: 41,
  run_id: 100,
  name: 'verify',
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  ...changes,
});
function scenario(options = {}) {
  const manual = options.manual ?? false,
    attempt = options.attempt ?? 1;
  const ci = {
    id: 100,
    run_number: 9,
    run_attempt: attempt,
    event: 'push',
    head_branch: 'feature/microsservices',
    head_sha: sha,
    repository: { full_name: repository },
    path: '.github/workflows/ci.yml',
    status: manual ? 'completed' : 'in_progress',
    conclusion: manual ? 'failure' : null,
    ...options.ci,
  };
  const own = manual
    ? {
        ...ci,
        id: 200,
        event: 'workflow_dispatch',
        path: '.github/workflows/deploy-workers.yml',
        head_sha: 'b'.repeat(40),
        status: 'in_progress',
        run_attempt: 1,
      }
    : ci;
  const execution = {
    event: own.event,
    runId: String(own.id),
    runAttempt: String(own.run_attempt),
    controlSha: own.head_sha,
    repository,
    ref: 'refs/heads/feature/microsservices',
    ...options.execution,
  };
  const proof = {
    releaseOrigin: manual ? 'manual' : 'ci',
    releaseRunAttempt: 1,
    ciRunId: 100,
    ciRunAttempt: 1,
    verifyJobId: 41,
    controlSha: own.head_sha,
  };
  const payload = {
    worker: 'billing',
    commitSha: sha,
    versionId: version,
    manifestDigest: digest(manifest),
    runId: String(own.id),
    baseline: false,
    ...proof,
    ...options.proof,
  };
  const calls = [],
    writes = [];
  const client = githubClient({
    repository,
    token: 'fixture',
    execution,
    fetchImpl: async (url, init) => {
      const path = url.replace(
        `https://api.github.com/repos/${repository}`,
        '',
      );
      calls.push(path);
      if (init.method === 'POST') {
        writes.push(JSON.parse(init.body));
        return json({ id: 501 });
      }
      if (path.startsWith('/compare/'))
        return json({ status: 'ahead', merge_base_commit: { sha } });
      if (path === `/actions/runs/${own.id}`) return json(own);
      if (path.startsWith('/actions/workflows/'))
        return json({ workflow_runs: options.runs ?? [ci] });
      const jobs = path.match(
        /^\/actions\/runs\/100\/attempts\/(\d+)\/jobs\?.*page=(\d+)$/,
      );
      if (jobs) {
        const current = Number(jobs[1]),
          page = Number(jobs[2]);
        return json({
          jobs:
            options.pages?.[`${current}:${page}`] ??
            (page === 1 ? (options.jobs?.[current] ?? [job()]) : []),
        });
      }
      const historical = path.match(
        /^\/actions\/runs\/(100|200)\/attempts\/(\d+)$/,
      );
      if (historical)
        return json({
          ...(historical[1] === '200' ? own : ci),
          run_attempt: Number(historical[2]),
        });
      if (path.startsWith('/contents/.github/workflows/ci.yml'))
        return encoded(
          options.workflow ?? readFileSync('.github/workflows/ci.yml', 'utf8'),
        );
      if (path.startsWith('/contents/.github/deploy/request.json'))
        return encoded(
          options.request ?? {
            mode: 'deploy',
            worker: 'all',
            requestId: 'fixture',
          },
        );
      if (path.startsWith('/contents/scripts/deploy/manifest.json'))
        return encoded(manifest);
      if (path.startsWith('/deployments?'))
        return json([
          { id: 1, sha, creator: { login: 'github-actions[bot]' }, payload },
        ]);
      if (path.startsWith('/deployments/1/statuses'))
        return json([{ state: 'success' }]);
      assert.fail(`Unexpected fixture request ${path}`);
    },
  });
  return { client, calls, writes, ci, own, proof };
}
test('push release accepts its completed verify while the overall CI remains in progress', async () => {
  const f = scenario();
  const approved = await f.client.eligible(sha);
  assert.equal(approved.releaseOrigin, 'ci');
  assert.equal(approved.verifyJobId, 41);
  assert.equal(approved.ciRunId, 100);
  assert.ok(!f.calls.some((path) => path.includes('/actions/workflows/')));
});
test('manual recovery accepts a completed failed publication with successful verification', async () => {
  const f = scenario({ manual: true });
  const approved = await f.client.eligible(sha);
  assert.equal(approved.releaseOrigin, 'manual');
  assert.equal(approved.controlSha, 'b'.repeat(40));
  assert.ok(
    f.calls.includes(`/contents/.github/deploy/request.json?ref=${sha}`),
  );
});
test('manual release rejects an unfinished CI and does not fall back to an older success', async () => {
  const newer = {
    ...scenario({ manual: true }).ci,
    id: 101,
    run_number: 10,
    status: 'in_progress',
  };
  const f = scenario({
    manual: true,
    runs: [scenario({ manual: true }).ci, newer],
  });
  await assert.rejects(f.client.eligible(sha), { code: 'CI_NOT_APPROVED' });
});
test('publish-only rerun reuses earlier verify, but a newer failed or skipped verify blocks', async () => {
  const approved = await scenario({
    attempt: 2,
    jobs: { 2: [], 1: [job()] },
  }).client.eligible(sha);
  assert.equal(approved.ciRunAttempt, 1);
  assert.equal(approved.releaseRunAttempt, 2);
  for (const conclusion of ['failure', 'cancelled', 'skipped', null])
    await assert.rejects(
      scenario({
        attempt: 2,
        jobs: {
          2: [
            job({
              conclusion,
              status: conclusion ? 'completed' : 'in_progress',
            }),
          ],
          1: [job()],
        },
      }).client.eligible(sha),
      { code: 'CI_NOT_APPROVED' },
    );
});
test('verify search paginates and rejects duplicate or partial job names', async () => {
  const unrelated = Array.from({ length: 100 }, (_, index) =>
    job({ id: 1000 + index, name: `other-${index}` }),
  );
  const f = scenario({ pages: { '1:1': unrelated, '1:2': [job()] } });
  assert.equal((await f.client.eligible(sha)).verifyJobId, 41);
  for (const jobs of [
    [job(), job({ id: 42 })],
    [job({ name: 'publish / verify' })],
    [job({ head_sha: 'c'.repeat(40) })],
    [job({ run_id: 999 })],
  ])
    await assert.rejects(scenario({ jobs: { 1: jobs } }).client.eligible(sha), {
      code: 'CI_NOT_APPROVED',
    });
});
test('caller event, branch, SHA and current attempt must match the trusted run', async () => {
  for (const execution of [
    { event: 'pull_request' },
    { ref: 'refs/heads/main' },
    { repository: 'fork/beauty' },
    { runAttempt: '2' },
    { controlSha: 'c'.repeat(40) },
  ])
    await assert.rejects(scenario({ execution }).client.eligible(sha), {
      code: 'CI_NOT_APPROVED',
    });
  await assert.rejects(scenario().client.eligible('c'.repeat(40)), {
    code: 'SHA_INELIGIBLE',
  });
});
test('push must call the versioned local release workflow with the immutable SHA', async () => {
  for (const workflow of [
    'jobs: {}',
    'jobs:\n  publish:\n    uses: attacker/repo/deploy.yml@main\n    needs: verify',
  ])
    await assert.rejects(scenario({ workflow }).client.eligible(sha), {
      code: 'CI_NOT_APPROVED',
    });
});
test('validate request is returned without mutations or Cloudflare access', async () => {
  const f = scenario({
    request: {
      mode: 'validate',
      worker: 'clinical',
      requestId: 'validate-fixture',
    },
  });
  assert.equal((await f.client.eligible(sha)).mode, 'validate');
  assert.equal(f.writes.length, 0);
});
test('historical automatic and manual provenance survives later failed verify attempts', async () => {
  for (const manual of [false, true]) {
    const f = scenario({
      manual,
      attempt: 2,
      jobs: { 1: [job()], 2: [job({ conclusion: 'failure' })] },
    });
    assert.deepEqual(
      (await f.client.provenanceByVersion('billing', version)).workerManifest,
      manifest.workers.billing,
    );
  }
});
test('provenance rejects forged job, attempt, origin and control identity', async () => {
  for (const proof of [
    { verifyJobId: 999 },
    { releaseOrigin: 'other' },
    { controlSha: 'c'.repeat(40) },
    { ciRunAttempt: 2 },
  ])
    await assert.rejects(
      scenario({
        proof,
        jobs: { 2: [job({ conclusion: 'failure' })] },
      }).client.provenanceByVersion('billing', version),
    );
});
test('new deployment records include validated origin and verification evidence', async () => {
  const f = scenario();
  await f.client.recordPublished({
    worker: 'billing',
    commitSha: sha,
    versionId: version,
    manifest,
    runId: '100',
    ...f.proof,
  });
  assert.equal(f.writes[0].payload.verifyJobId, 41);
  assert.equal(f.writes[0].payload.releaseOrigin, 'ci');
  await assert.rejects(
    f.client.recordPublished({
      worker: 'billing',
      commitSha: sha,
      versionId: version,
      manifest,
      runId: '100',
    }),
    { code: 'INVALID_REQUEST' },
  );
});
test('runner execution is extracted only from GitHub identity fields', () => {
  assert.deepEqual(
    runnerExecution({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_RUN_ID: '100',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SHA: sha,
      GITHUB_REPOSITORY: repository,
      GITHUB_REF: 'refs/heads/feature/microsservices',
      DEPLOY_ORIGIN: 'forged',
    }),
    {
      event: 'push',
      runId: '100',
      runAttempt: '2',
      controlSha: sha,
      repository,
      ref: 'refs/heads/feature/microsservices',
    },
  );
});

test('renamed verify job preserves eligibility but duplicate old/new names are rejected', async () => {
  const renamed = job({ name: 'Validar código e testes' });
  assert.equal(
    (await scenario({ jobs: { 1: [renamed] } }).client.eligible(sha))
      .verifyJobId,
    41,
  );
  await assert.rejects(
    scenario({ jobs: { 1: [job(), { ...renamed, id: 42 }] } }).client.eligible(
      sha,
    ),
    { code: 'CI_NOT_APPROVED' },
  );
  await assert.rejects(
    scenario({
      jobs: {
        1: [job({ name: 'Validar código e testes', conclusion: 'failure' })],
      },
    }).client.eligible(sha),
    { code: 'CI_NOT_APPROVED' },
  );
});
