import { fail } from './errors.mjs';
import { releaseBranch, manifestPath } from './config-contract.mjs';
import { deploymentRequest } from './validate-local.mjs';
import { digest } from './manifest.mjs';
export function githubClient({
  repository,
  token,
  fetchImpl = globalThis.fetch,
  context = {},
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !token)
    fail('REMOTE_CREDENTIALS_UNAVAILABLE', {
      ...context,
      operation: 'github.request',
    });
  const metrics = { calls: 0, operations: {} };
  const cache = new Map();
  async function request(path, options = {}) {
    if ((options.method ?? 'GET') !== 'GET') {
      cache.clear();
      return perform(path, options);
    }
    if (!cache.has(path)) cache.set(path, perform(path, options));
    return cache.get(path);
  }
  async function perform(
    path,
    { method = 'GET', body, operation = 'github.request' } = {},
  ) {
    metrics.calls++;
    metrics.operations[operation] = (metrics.operations[operation] ?? 0) + 1;
    let response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${repository}${path}`,
        {
          method,
          redirect: 'error',
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
    } catch {
      fail('REMOTE_TRANSPORT_ERROR', { ...context, operation });
    }
    if (!response.ok)
      fail(
        response.status === 403
          ? 'REMOTE_ACCESS_DENIED'
          : response.status === 401
            ? 'REMOTE_UNAUTHENTICATED'
            : 'REMOTE_HTTP_ERROR',
        { ...context, operation, status: response.status },
      );
    try {
      return await response.json();
    } catch {
      fail('REMOTE_RESPONSE_INVALID', { ...context, operation });
    }
  }
  async function pages(path, key, operation) {
    const all = [];
    for (let page = 1; ; page++) {
      const data = await request(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
        { operation },
      );
      const values = key ? data[key] : data;
      if (!Array.isArray(values))
        fail('REMOTE_RESPONSE_INVALID', { ...context, operation });
      all.push(...values);
      if (values.length < 100) return all;
    }
  }
  async function file(path, sha) {
    if (
      !/^[0-9a-f]{40}$/.test(sha ?? '') ||
      !/^([A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) ||
      path.split('/').includes('..')
    )
      fail('MANIFEST_INVALID', { ...context, operation: 'github.manifest' });
    const value = await request(`/contents/${path}?ref=${sha}`, {
      operation: 'github.manifest',
    });
    if (value.encoding !== 'base64' || typeof value.content !== 'string')
      fail('MANIFEST_UNAVAILABLE', {
        ...context,
        operation: 'github.manifest',
      });
    return Buffer.from(value.content, 'base64').toString('utf8');
  }
  async function content(path, sha) {
    const text = await file(path, sha);
    try {
      return JSON.parse(text);
    } catch {
      fail('MANIFEST_INVALID', { ...context, operation: 'github.manifest' });
    }
  }
  async function eligible(commitSha) {
    const scope = {
      ...context,
      phase: 'eligibility',
      operation: 'github.ci',
      commitSha,
    };
    if (!/^[0-9a-f]{40}$/.test(commitSha ?? '')) fail('SHA_INELIGIBLE', scope);
    const comparison = await request(
      `/compare/${commitSha}...${encodeURIComponent(releaseBranch)}`,
    );
    if (
      !['ahead', 'identical'].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== commitSha
    )
      fail('SHA_INELIGIBLE', scope);
    const runs = await pages(
      `/actions/workflows/ci.yml/runs?head_sha=${commitSha}&event=push&branch=${encodeURIComponent(releaseBranch)}`,
      'workflow_runs',
      'github.ci',
    );
    const candidates = runs
      .filter(
        (run) =>
          run.head_sha === commitSha &&
          run.head_branch === releaseBranch &&
          run.event === 'push' &&
          run.repository?.full_name === repository &&
          run.path === '.github/workflows/ci.yml',
      )
      .sort(
        (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt,
      );
    if (
      candidates[0]?.status !== 'completed' ||
      candidates[0]?.conclusion !== 'success'
    )
      fail('CI_NOT_APPROVED', scope);
    const requestValue = await content(
      '.github/deploy/request.json',
      commitSha,
    );
    return {
      ...deploymentRequest(requestValue),
      commitSha,
      ciRunId: candidates[0].id,
    };
  }
  async function provenance(worker, commitSha, versionId) {
    const scope = {
      ...context,
      phase: 'provenance',
      worker,
      operation: 'github.deployment',
    };
    const records = await pages(
      `/deployments?environment=production&task=beauty-release-${worker}&sha=${commitSha}`,
      null,
      'github.deployment',
    );
    for (const record of records) {
      if (
        record.creator?.login !== 'github-actions[bot]' ||
        record.sha !== commitSha ||
        record.payload?.worker !== worker ||
        record.payload?.versionId !== versionId ||
        record.payload?.commitSha !== commitSha
      )
        continue;
      const statuses = await request(
        `/deployments/${record.id}/statuses?per_page=1`,
        { operation: 'github.deployment' },
      );
      if (statuses[0]?.state !== 'success') continue;
      const run = await request(`/actions/runs/${record.payload.runId}`, {
        operation: 'github.ci',
      });
      const allowedPath = record.payload.baseline
        ? '.github/workflows/infrastructure-readiness.yml'
        : '.github/workflows/deploy-workers.yml';
      if (
        run.event !== 'workflow_dispatch' ||
        run.head_branch !== releaseBranch ||
        run.path !== allowedPath ||
        run.repository?.full_name !== repository
      )
        continue;
      if (record.payload.baseline) {
        const baseline = await content(
          '.github/deploy/baseline.json',
          run.head_sha,
        );
        const entry = baseline.workers?.[worker];
        if (
          entry?.commitSha !== commitSha ||
          entry?.versionId !== versionId ||
          !entry.qualificationReference?.trim() ||
          entry.qualificationReference !== record.payload.qualificationReference
        )
          continue;
      }
      const manifest = record.payload.baseline
        ? record.payload.manifest
        : await content(manifestPath, commitSha);
      if (
        digest(manifest) !== record.payload.manifestDigest ||
        manifest?.formatVersion !== 1 ||
        !manifest.workers?.[worker]
      )
        continue;
      return manifest.workers[worker];
    }
    fail('PROVENANCE_UNAVAILABLE', scope);
  }
  async function recordPublished({
    worker,
    commitSha,
    versionId,
    manifest,
    runId,
    baseline = false,
    qualificationReference,
  }) {
    if (
      !/^[0-9a-f]{40}$/.test(commitSha) ||
      !/^[0-9a-f-]{36}$/i.test(versionId) ||
      !/^\d+$/.test(String(runId))
    )
      fail('INVALID_REQUEST', { ...context, operation: 'github.deployment' });
    const deployment = await request('/deployments', {
      method: 'POST',
      operation: 'github.deployment',
      body: {
        ref: commitSha,
        task: `beauty-release-${worker}`,
        environment: 'production',
        auto_merge: false,
        required_contexts: [],
        description: `Verified ${worker}`,
        payload: {
          worker,
          commitSha,
          versionId,
          manifestDigest: digest(manifest),
          runId: String(runId),
          baseline,
          ...(baseline ? { manifest, qualificationReference } : {}),
        },
      },
    });
    await request(`/deployments/${deployment.id}/statuses`, {
      method: 'POST',
      operation: 'github.deployment',
      body: {
        state: 'success',
        auto_inactive: false,
        description: 'Worker version and manifest verified',
      },
    });
    return deployment.id;
  }
  return {
    request,
    file,
    content,
    eligible,
    provenance,
    recordPublished,
    metrics,
  };
}
