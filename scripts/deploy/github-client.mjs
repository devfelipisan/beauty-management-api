import { fail } from './errors.mjs';
import { releaseBranch, manifestPath } from './config-contract.mjs';
import { deploymentRequest } from './validate-local.mjs';
import { digest } from './manifest.mjs';
import { load } from 'js-yaml';
export function runnerExecution(env = process.env) {
  return {
    event: env.GITHUB_EVENT_NAME,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    controlSha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF,
  };
}
export function githubClient({
  repository,
  token,
  fetchImpl = globalThis.fetch,
  context = {},
  execution = runnerExecution(),
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
  const positive = (value) =>
    /^\d+$/.test(String(value)) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0;
  const ciIdentity = (run, sha) =>
    run?.head_sha === sha &&
    run.head_branch === releaseBranch &&
    run.event === 'push' &&
    run.repository?.full_name === repository &&
    run.path === '.github/workflows/ci.yml';
  const trustedCi = (run, sha) =>
    ciIdentity(run, sha) && positive(run.id) && positive(run.run_attempt);
  async function approvedVerify(run, attempt, scope) {
    for (let current = Number(attempt); current > 0; current--) {
      const jobs = await pages(
        `/actions/runs/${run.id}/attempts/${current}/jobs`,
        'jobs',
        'github.ci',
      );
      const matches = jobs.filter((job) => job.name === 'verify');
      if (!matches.length) continue;
      const job = matches[0];
      if (
        matches.length !== 1 ||
        job.run_id !== run.id ||
        job.head_sha !== run.head_sha ||
        job.status !== 'completed' ||
        job.conclusion !== 'success' ||
        !positive(job.id)
      )
        fail('CI_NOT_APPROVED', scope);
      return { ciRunId: run.id, ciRunAttempt: current, verifyJobId: job.id };
    }
    fail('CI_NOT_APPROVED', scope);
  }
  async function authorizedCaller(sha, scope) {
    let workflow;
    try {
      workflow = load(await file('.github/workflows/ci.yml', sha));
    } catch {
      fail('CI_NOT_APPROVED', scope);
    }
    const call = workflow?.jobs?.publish;
    if (
      call?.uses !== './.github/workflows/deploy-workers.yml' ||
      call.needs !== 'verify' ||
      call.with?.commit_sha !== '${{ github.sha }}'
    )
      fail('CI_NOT_APPROVED', scope);
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
    if (
      !['push', 'workflow_dispatch'].includes(execution.event) ||
      execution.repository !== repository ||
      execution.ref !== `refs/heads/${releaseBranch}` ||
      !positive(execution.runId) ||
      !positive(execution.runAttempt) ||
      !/^[0-9a-f]{40}$/.test(execution.controlSha ?? '')
    )
      fail('CI_NOT_APPROVED', scope);
    const own = await request(`/actions/runs/${execution.runId}`, {
      operation: 'github.ci',
    });
    const automatic = execution.event === 'push';
    if (
      String(own.id) !== String(execution.runId) ||
      Number(own.run_attempt) !== Number(execution.runAttempt) ||
      own.event !== execution.event ||
      own.head_sha !== execution.controlSha ||
      own.head_branch !== releaseBranch ||
      own.repository?.full_name !== repository ||
      own.path !==
        (automatic
          ? '.github/workflows/ci.yml'
          : '.github/workflows/deploy-workers.yml')
    )
      fail('CI_NOT_APPROVED', scope);
    let candidate;
    if (automatic) {
      if (commitSha !== own.head_sha || !trustedCi(own, commitSha))
        fail('SHA_INELIGIBLE', scope);
      await authorizedCaller(commitSha, scope);
      candidate = own;
    } else {
      const runs = await pages(
        `/actions/workflows/ci.yml/runs?head_sha=${commitSha}&event=push&branch=${encodeURIComponent(releaseBranch)}`,
        'workflow_runs',
        'github.ci',
      );
      if (
        runs.some(
          (run) =>
            ciIdentity(run, commitSha) &&
            (!trustedCi(run, commitSha) || !positive(run.run_number)),
        )
      )
        fail('CI_NOT_APPROVED', scope);
      const candidates = runs
        .filter((run) => trustedCi(run, commitSha))
        .sort(
          (a, b) =>
            b.run_number - a.run_number || b.run_attempt - a.run_attempt,
        );
      if (candidates[0]?.status !== 'completed') fail('CI_NOT_APPROVED', scope);
      candidate = candidates[0];
    }
    const proof = await approvedVerify(candidate, candidate.run_attempt, scope);
    const requestValue = await content(
      '.github/deploy/request.json',
      commitSha,
    );
    return {
      ...deploymentRequest(requestValue),
      commitSha,
      ...proof,
      releaseOrigin: automatic ? 'ci' : 'manual',
      releaseRunAttempt: Number(execution.runAttempt),
      controlSha: execution.controlSha,
    };
  }
  async function provenanceByVersion(worker, versionId) {
    const scope = {
      ...context,
      phase: 'provenance',
      worker,
      operation: 'github.deployment',
    };
    const records = await pages(
      `/deployments?environment=production&task=beauty-release-${worker}`,
      null,
      'github.deployment',
    );
    for (const record of records) {
      const commitSha = record.payload?.commitSha;
      if (
        !/^[0-9a-f]{40}$/.test(commitSha ?? '') ||
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
      const automatic = record.payload.releaseOrigin === 'ci';
      const allowedPath = record.payload.baseline
        ? '.github/workflows/infrastructure-readiness.yml'
        : automatic
          ? '.github/workflows/ci.yml'
          : '.github/workflows/deploy-workers.yml';
      if (
        run.event !== (automatic ? 'push' : 'workflow_dispatch') ||
        run.head_branch !== releaseBranch ||
        run.path !== allowedPath ||
        run.repository?.full_name !== repository
      )
        continue;
      if (record.payload.releaseOrigin !== undefined) {
        const proof = record.payload;
        if (
          !['ci', 'manual'].includes(proof.releaseOrigin) ||
          proof.baseline ||
          !positive(proof.releaseRunAttempt) ||
          !positive(proof.ciRunId) ||
          !positive(proof.ciRunAttempt) ||
          !positive(proof.verifyJobId) ||
          proof.controlSha !== run.head_sha ||
          (automatic &&
            (run.head_sha !== commitSha ||
              String(proof.ciRunId) !== String(proof.runId)))
        )
          continue;
        const historical = await request(
          `/actions/runs/${proof.ciRunId}/attempts/${proof.ciRunAttempt}`,
          { operation: 'github.ci' },
        );
        if (
          !trustedCi(historical, commitSha) ||
          historical.id !== proof.ciRunId ||
          Number(historical.run_attempt) !== proof.ciRunAttempt
        )
          continue;
        const evidence = await approvedVerify(
          historical,
          proof.ciRunAttempt,
          scope,
        );
        if (
          evidence.verifyJobId !== proof.verifyJobId ||
          evidence.ciRunAttempt !== proof.ciRunAttempt ||
          (automatic && proof.ciRunAttempt > proof.releaseRunAttempt)
        )
          continue;
        const releaseAttempt = await request(
          `/actions/runs/${proof.runId}/attempts/${proof.releaseRunAttempt}`,
          { operation: 'github.ci' },
        );
        if (
          String(releaseAttempt.id) !== String(proof.runId) ||
          releaseAttempt.head_sha !== proof.controlSha ||
          releaseAttempt.path !== allowedPath ||
          releaseAttempt.event !== run.event ||
          releaseAttempt.repository?.full_name !== repository ||
          releaseAttempt.head_branch !== releaseBranch ||
          Number(releaseAttempt.run_attempt) !== proof.releaseRunAttempt
        )
          continue;
        if (automatic) await authorizedCaller(commitSha, scope);
      }
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
        !manifest.workers?.[worker] ||
        (record.payload.packageVersion !== undefined &&
          record.payload.packageVersion !== manifest.workers[worker].packageVersion)
      )
        continue;
      return {
        worker,
        commitSha,
        versionId,
        manifest,
        workerManifest: manifest.workers[worker],
        evidence: {
          runId: String(record.payload.runId),
          runAttempt: Number(record.payload.releaseRunAttempt ?? 1),
          verification: 'passed',
          deploymentId: record.id,
          manifestDigest: record.payload.manifestDigest,
        },
      };
    }
    fail('PROVENANCE_UNAVAILABLE', scope);
  }
  async function recordPublished({
    worker,
    commitSha,
    versionId,
    packageVersion,
    manifest,
    runId,
    baseline = false,
    qualificationReference,
    releaseOrigin,
    releaseRunAttempt,
    ciRunId,
    ciRunAttempt,
    verifyJobId,
    controlSha,
  }) {
    if (
      !baseline &&
      (!['ci', 'manual'].includes(releaseOrigin) ||
        !positive(releaseRunAttempt) ||
        !positive(ciRunId) ||
        !positive(ciRunAttempt) ||
        !positive(verifyJobId) ||
        !/^[0-9a-f]{40}$/.test(controlSha ?? ''))
    )
      fail('INVALID_REQUEST', { ...context, operation: 'github.deployment' });
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
          packageVersion,
          manifestDigest: digest(manifest),
          runId: String(runId),
          baseline,
          ...(!baseline
            ? {
                releaseOrigin,
                releaseRunAttempt,
                ciRunId,
                ciRunAttempt,
                verifyJobId,
                controlSha,
              }
            : {}),
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
    provenanceByVersion,
    recordPublished,
    metrics,
  };
}
