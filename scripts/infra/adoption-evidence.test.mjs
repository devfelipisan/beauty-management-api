import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubClient } from '../deploy/github-client.mjs';
import { digest } from '../deploy/manifest.mjs';
import { sha, version, manifest } from '../deploy/fixtures.mjs';
const repository = 'owner/beauty';
const json = (value) => ({ ok: true, json: async () => value });
const encoded = (value) =>
  json({
    encoding: 'base64',
    content: Buffer.from(
      typeof value === 'string' ? value : JSON.stringify(value),
    ).toString('base64'),
  });
function scenario(change = () => {}) {
  const entry = {
    commitSha: sha,
    versionId: version,
    evidence: {
      runId: 10,
      runAttempt: 1,
      artifactId: 20,
      artifactDigest: `sha256:${'a'.repeat(64)}`,
    },
  };
  const run = {
    id: 10,
    run_attempt: 1,
    event: 'push',
    status: 'completed',
    conclusion: 'failure',
    head_sha: sha,
    head_branch: 'feature/microsservices',
    path: '.github/workflows/ci.yml',
    repository: { full_name: repository },
  };
  const job = {
    id: 30,
    run_id: 10,
    head_sha: sha,
    name: 'verify',
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: 20,
    expired: false,
    digest: entry.evidence.artifactDigest,
    name: `deployment-${sha}-1`,
    workflow_run: {
      id: 10,
      head_sha: sha,
      head_branch: 'feature/microsservices',
    },
  };
  const report = {
    target: 'all',
    status: 'failed',
    commitSha: sha,
    manifestDigest: digest(manifest),
    eligibility: {
      releaseOrigin: 'ci',
      controlSha: sha,
      releaseRunAttempt: 1,
      ciRunId: 10,
      ciRunAttempt: 1,
      verifyJobId: 30,
    },
    workers: [
      {
        worker: 'billing',
        commitSha: sha,
        version,
        status: 'published',
        verification: 'passed',
        manifestDigest: digest(manifest),
      },
    ],
  };
  const values = {
    entry,
    run,
    job,
    artifact,
    report,
    publicationName: `Deploy after CI / Publish all at ${sha}`,
  };
  change(values);
  const client = githubClient({
    repository,
    token: 'fixture',
    artifactReader: async () => report,
    fetchImpl: async (url) => {
      const path = url.replace(
        `https://api.github.com/repos/${repository}`,
        '',
      );
      if (path.startsWith('/compare/'))
        return json({ status: 'ahead', merge_base_commit: { sha } });
      if (path === '/actions/runs/10/attempts/1') return json(run);
      if (path === '/actions/artifacts/20') return json(artifact);
      if (path.startsWith('/actions/runs/10/attempts/1/jobs'))
        return json({
          jobs: [
            job,
            {
              ...job,
              id: 31,
              name: values.publicationName,
              conclusion: 'failure',
            },
          ],
        });
      if (path.startsWith('/contents/.github/workflows/deploy-workers.yml'))
        return encoded('jobs:\n  deploy:\n    environment: production\n');
      if (path.startsWith('/contents/.github/workflows/ci.yml'))
        return encoded(
          'jobs:\n  publish:\n    uses: ./.github/workflows/deploy-workers.yml\n    needs: verify\n    with:\n      commit_sha: ${{ github.sha }}\n',
        );
      assert.fail(`Unexpected request ${path}`);
    },
  });
  return { client, entry };
}
test('independent historical artifact proves a successful Worker even when a later Worker failed', async () => {
  const f = scenario();
  assert.deepEqual(
    await f.client.adoptionEvidence('billing', f.entry, manifest),
    f.entry.evidence,
  );
});
test('arbitrary SHA, invalid artifact identity, unapproved workflow, failed verify and divergent manifest are rejected', async () => {
  for (const change of [
    (v) => {
      v.entry.commitSha = 'b'.repeat(40);
    },
    (v) => {
      v.run.path = '.github/workflows/untrusted.yml';
    },
    (v) => {
      v.run.repository.full_name = 'other/repo';
    },
    (v) => {
      v.run.head_branch = 'main';
    },
    (v) => {
      v.run.run_attempt = 2;
    },
    (v) => {
      v.artifact.expired = true;
    },
    (v) => {
      v.artifact.workflow_run.id = 50;
    },
    (v) => {
      v.artifact.digest = `sha256:${'b'.repeat(64)}`;
    },
    (v) => {
      v.report.manifestDigest = 'bad';
    },
    (v) => {
      v.report.workers[0].version = '11111111-1111-1111-1111-111111111111';
    },
    (v) => {
      v.report.workers[0].verification = 'published_unverified';
    },
    (v) => {
      v.report.workers.push(v.report.workers[0]);
    },
    (v) => {
      v.job.conclusion = 'failure';
    },
  ]) {
    const f = scenario(change);
    await assert.rejects(
      f.client.adoptionEvidence('billing', f.entry, manifest),
    );
  }
});
test('provenance diagnostics distinguish no records from rejected records without exposing metadata', async () => {
  for (const records of [[], [{ id: 1, payload: { commitSha: 'PRIVATE' } }]]) {
    const client = githubClient({
      repository,
      token: 'fixture',
      fetchImpl: async () => json(records),
    });
    await assert.rejects(client.provenanceByVersion('billing', version), {
      code: 'PROVENANCE_UNAVAILABLE',
      provenanceReason: records.length ? 'NO_ACCEPTED_RECORD' : 'NO_RECORDS',
    });
  }
});

test('renamed publication keeps historical artifact provenance verifiable', async () => {
  const f = scenario((values) => {
    values.job.name = 'Validar código e testes';
    values.publicationName = `Publicar após validação / Publicar all no commit ${sha}`;
  });
  const proof = await f.client.adoptionEvidence('billing', f.entry, manifest);
  assert.ok(proof);
});
