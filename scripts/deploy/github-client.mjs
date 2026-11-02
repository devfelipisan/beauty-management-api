import { fail } from './errors.mjs';
import {
  releaseBranch,
  manifestPath,
  workerConfigurations,
} from './config-contract.mjs';
import { deploymentRequest } from './validate-local.mjs';
import { digest } from './manifest.mjs';
import { load } from 'js-yaml';
import { readEvidenceArtifact } from '../infra/evidence-artifact.mjs';
import {
  firstPublicationRequest,
  firstPublicationRequestPath,
  firstPublicationWorkflow,
  versionId as validVersionId,
} from '../infra/first-publication-request.mjs';
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
  artifactReader = readEvidenceArtifact,
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
      const matches = jobs.filter((job) =>
        ['verify', 'Validar código e testes'].includes(job.name),
      );
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
  async function firstPublicationEligible(commitSha) {
    const scope = {
      ...context,
      commitSha,
      phase: 'eligibility',
      operation: 'github.ci',
    };
    if (
      !/^[0-9a-f]{40}$/.test(commitSha ?? '') ||
      execution.event !== 'workflow_dispatch' ||
      execution.repository !== repository ||
      execution.ref !== `refs/heads/${releaseBranch}` ||
      !positive(execution.runId) ||
      !positive(execution.runAttempt) ||
      !/^[0-9a-f]{40}$/.test(execution.controlSha ?? '')
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', scope);
    const own = await request(`/actions/runs/${execution.runId}`, {
      operation: 'github.ci',
    });
    if (
      String(own.id) !== String(execution.runId) ||
      own.run_attempt !== Number(execution.runAttempt) ||
      own.event !== 'workflow_dispatch' ||
      own.path !== firstPublicationWorkflow ||
      own.head_sha !== execution.controlSha ||
      own.head_branch !== releaseBranch ||
      own.repository?.full_name !== repository
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', scope);
    const comparison = await request(
      `/compare/${commitSha}...${encodeURIComponent(releaseBranch)}`,
    );
    if (
      !['ahead', 'identical'].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== commitSha
    )
      fail('SHA_INELIGIBLE', scope);
    const requested = firstPublicationRequest(
      await content(firstPublicationRequestPath, execution.controlSha),
      commitSha,
    );
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
        (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt,
      );
    const ci = candidates[0];
    if (ci?.status !== 'completed') fail('CI_NOT_APPROVED', scope);
    const proof = await approvedVerify(ci, ci.run_attempt, scope);
    return {
      commitSha,
      ...proof,
      releaseOrigin: 'first-publication',
      releaseRunAttempt: Number(execution.runAttempt),
      controlSha: execution.controlSha,
      runId: String(execution.runId),
      requested,
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
      const first = record.payload.releaseOrigin === 'first-publication';
      const allowedPath = record.payload.baseline
        ? record.payload.adoptionEvidence
          ? '.github/workflows/infrastructure-initial-adoption.yml'
          : '.github/workflows/infrastructure-readiness.yml'
        : first
          ? firstPublicationWorkflow
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
          !['ci', 'manual', 'first-publication'].includes(
            proof.releaseOrigin,
          ) ||
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
        if (first) {
          if (
            run.status !== 'completed' ||
            run.conclusion !== 'success' ||
            releaseAttempt.status !== 'completed' ||
            releaseAttempt.conclusion !== 'success'
          )
            continue;
          const approved = firstPublicationRequest(
            await content(firstPublicationRequestPath, proof.controlSha),
            commitSha,
          );
          if (
            !validVersionId(proof.firstPublication?.previousVersionId) ||
            proof.firstPublication.previousVersionId !==
              approved.workers[worker].versionId ||
            proof.firstPublication.requestDigest !== digest(approved)
          )
            continue;
        }
      }
      if (record.payload.baseline) {
        if (
          record.payload.adoptionEvidence &&
          (run.status !== 'completed' || run.conclusion !== 'success')
        )
          continue;
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
        if (
          record.payload.adoptionEvidence &&
          JSON.stringify(entry.evidence) !==
            JSON.stringify(record.payload.adoptionEvidence)
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
          record.payload.packageVersion !==
            manifest.workers[worker].packageVersion)
      )
        continue;
      if (record.payload.adoptionEvidence) {
        const historical = await content(manifestPath, commitSha);
        if (digest(historical) !== digest(manifest)) continue;
        // The successful protected adoption run is the durable attestation.
        // Historical artifacts may expire after qualification; do not depend on their retention.
      }
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
    fail('PROVENANCE_UNAVAILABLE', {
      ...scope,
      provenanceReason: records.length ? 'NO_ACCEPTED_RECORD' : 'NO_RECORDS',
    });
  }
  // Historical Actions artifacts are independent of GitHub Deployment records.
  async function adoptionEvidence(worker, entry, manifest) {
    const scope = {
      ...context,
      worker,
      phase: 'provenance',
      operation: 'github.deployment',
    };
    const evidence = entry.evidence;
    if (
      !evidence ||
      typeof evidence !== 'object' ||
      Array.isArray(evidence) ||
      Object.keys(evidence).some(
        (key) =>
          !['runId', 'runAttempt', 'artifactId', 'artifactDigest'].includes(
            key,
          ),
      ) ||
      !positive(evidence?.runId) ||
      !positive(evidence?.runAttempt) ||
      !positive(evidence?.artifactId) ||
      !/^sha256:[0-9a-f]{64}$/.test(evidence?.artifactDigest ?? '')
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const comparison = await request(
      `/compare/${entry.commitSha}...${encodeURIComponent(releaseBranch)}`,
    );
    if (
      !['ahead', 'identical'].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== entry.commitSha
    )
      fail('SHA_INELIGIBLE', scope);
    const run = await request(
      `/actions/runs/${evidence.runId}/attempts/${evidence.runAttempt}`,
      { operation: 'github.ci' },
    );
    const automatic = run.event === 'push';
    if (
      run.id !== evidence.runId ||
      Number(run.run_attempt) !== evidence.runAttempt ||
      run.status !== 'completed' ||
      run.head_branch !== releaseBranch ||
      run.repository?.full_name !== repository ||
      run.path !==
        (automatic
          ? '.github/workflows/ci.yml'
          : '.github/workflows/deploy-workers.yml') ||
      !['push', 'workflow_dispatch'].includes(run.event) ||
      (automatic && run.head_sha !== entry.commitSha)
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const artifact = await request(
      `/actions/artifacts/${evidence.artifactId}`,
      { operation: 'github.ci' },
    );
    if (
      artifact.id !== evidence.artifactId ||
      artifact.expired !== false ||
      artifact.digest !== evidence.artifactDigest ||
      artifact.name !==
        `deployment-${entry.commitSha}-${evidence.runAttempt}` ||
      artifact.workflow_run?.id !== run.id ||
      artifact.workflow_run?.head_sha !== run.head_sha ||
      artifact.workflow_run?.head_branch !== releaseBranch
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const report = await artifactReader({
      repository,
      token,
      artifactId: evidence.artifactId,
      digest: artifact.digest,
      fetchImpl,
    });
    let workflow;
    try {
      workflow = load(
        await file('.github/workflows/deploy-workers.yml', run.head_sha),
      );
    } catch {
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    }
    if (
      workflow?.jobs?.deploy?.environment !== 'production' ||
      !['all', worker].includes(report.target)
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const jobs = await pages(
      `/actions/runs/${run.id}/attempts/${evidence.runAttempt}/jobs`,
      'jobs',
      'github.ci',
    );
    // Keep immutable evidence from runs before the display-name migration valid.
    const jobNames = [
      `${automatic ? 'Deploy after CI / ' : ''}Publish ${report.target} at ${entry.commitSha}`,
      `${automatic ? 'Publicar após validação / ' : ''}Publicar ${report.target} no commit ${entry.commitSha}`,
    ];
    const publication = jobs.filter((job) => jobNames.includes(job.name));
    if (
      publication.length !== 1 ||
      publication[0].run_id !== run.id ||
      publication[0].head_sha !== run.head_sha ||
      publication[0].status !== 'completed' ||
      !['success', 'failure'].includes(publication[0].conclusion)
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const item = report.workers?.filter((value) => value.worker === worker);
    const proof = report.eligibility;
    if (
      report.commitSha !== entry.commitSha ||
      report.manifestDigest !== digest(manifest) ||
      item?.length !== 1 ||
      item[0].commitSha !== entry.commitSha ||
      item[0].version !== entry.versionId ||
      item[0].status !== 'published' ||
      item[0].verification !== 'passed' ||
      item[0].manifestDigest !== digest(manifest) ||
      proof?.releaseOrigin !== (automatic ? 'ci' : 'manual') ||
      proof.controlSha !== run.head_sha ||
      proof.releaseRunAttempt !== evidence.runAttempt ||
      !positive(proof.ciRunId) ||
      !positive(proof.ciRunAttempt) ||
      !positive(proof.verifyJobId) ||
      (automatic && proof.ciRunId !== run.id)
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const ci = await request(
      `/actions/runs/${proof.ciRunId}/attempts/${proof.ciRunAttempt}`,
      { operation: 'github.ci' },
    );
    if (
      !trustedCi(ci, entry.commitSha) ||
      ci.id !== proof.ciRunId ||
      ci.run_attempt !== proof.ciRunAttempt
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    const verified = await approvedVerify(ci, proof.ciRunAttempt, scope);
    if (
      verified.verifyJobId !== proof.verifyJobId ||
      verified.ciRunAttempt !== proof.ciRunAttempt
    )
      fail('ADOPTION_EVIDENCE_INVALID', scope);
    await authorizedCaller(entry.commitSha, scope);
    return {
      runId: evidence.runId,
      runAttempt: evidence.runAttempt,
      artifactId: evidence.artifactId,
      artifactDigest: evidence.artifactDigest,
    };
  }
  async function assertFirstPublicationNeeded(versions) {
    const scope = {
      ...context,
      phase: 'eligibility',
      operation: 'github.deployment',
    };
    if (
      !versions ||
      Object.keys(versions).sort().join() !==
        Object.keys(workerConfigurations).sort().join() ||
      Object.values(versions).some((version) => !validVersionId(version))
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', scope);
    let missing = 0;
    for (const [worker, version] of Object.entries(versions)) {
      try {
        await provenanceByVersion(worker, version);
      } catch (error) {
        // Existing but rejected records require recovery, not first adoption.
        if (
          error.code !== 'PROVENANCE_UNAVAILABLE' ||
          error.provenanceReason !== 'NO_RECORDS'
        )
          throw error;
        missing++;
      }
    }
    // A partially trusted topology must not use the initial-publication path.
    if (missing !== Object.keys(workerConfigurations).length)
      fail('FIRST_PUBLICATION_NOT_APPROVED', scope);
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
    adoptionEvidence: initialEvidence,
    firstPublication,
    verificationMethod,
  }) {
    if (verificationMethod !== undefined && verificationMethod !== 'wrangler')
      fail('INVALID_REQUEST', { ...context, operation: 'github.deployment' });
    if (
      !baseline &&
      (!['ci', 'manual', 'first-publication'].includes(releaseOrigin) ||
        !positive(releaseRunAttempt) ||
        !positive(ciRunId) ||
        !positive(ciRunAttempt) ||
        !positive(verifyJobId) ||
        !/^[0-9a-f]{40}$/.test(controlSha ?? ''))
    )
      fail('INVALID_REQUEST', { ...context, operation: 'github.deployment' });
    if (
      releaseOrigin === 'first-publication' &&
      (baseline ||
        !validVersionId(firstPublication?.previousVersionId) ||
        !/^[0-9a-f]{64}$/.test(firstPublication?.requestDigest ?? ''))
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
        description: `${verificationMethod === 'wrangler' ? 'Published' : 'Verified'} ${worker}`,
        payload: {
          worker,
          commitSha,
          versionId,
          packageVersion,
          manifestDigest: digest(manifest),
          runId: String(runId),
          baseline,
          ...(verificationMethod ? { verificationMethod } : {}),
          ...(releaseOrigin === 'first-publication'
            ? { firstPublication }
            : {}),
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
          ...(baseline
            ? {
                manifest,
                qualificationReference,
                ...(initialEvidence
                  ? { adoptionEvidence: initialEvidence }
                  : {}),
              }
            : {}),
        },
      },
    });
    await request(`/deployments/${deployment.id}/statuses`, {
      method: 'POST',
      operation: 'github.deployment',
      body: {
        state: 'success',
        auto_inactive: false,
        description:
          verificationMethod === 'wrangler'
            ? 'Wrangler confirmed publication; infrastructure not inspected'
            : 'Worker version and manifest verified',
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
    adoptionEvidence,
    firstPublicationEligible,
    assertFirstPublicationNeeded,
    metrics,
  };
}
