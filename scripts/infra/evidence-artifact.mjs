import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail } from '../deploy/errors.mjs';

// Only the report is read; archive paths are never extracted to the checkout.
export function evidenceReport(archive, expectedDigest) {
  const context = { phase: 'provenance', operation: 'github.deployment' };
  if (
    archive.length > 10 * 1024 * 1024 ||
    `sha256:${createHash('sha256').update(archive).digest('hex')}` !==
      expectedDigest
  )
    fail('ADOPTION_EVIDENCE_INVALID', context);
  const directory = mkdtempSync(join(tmpdir(), 'beauty-evidence-'));
  try {
    const path = join(directory, 'artifact.zip');
    writeFileSync(path, archive, { mode: 0o600 });
    const names = execFileSync('unzip', ['-Z1', path], {
      encoding: 'utf8',
      maxBuffer: 65536,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n');
    if (names.length !== 1 || names[0] !== 'result.json')
      fail('ADOPTION_EVIDENCE_INVALID', context);
    return JSON.parse(
      execFileSync('unzip', ['-p', path, 'result.json'], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    fail('ADOPTION_EVIDENCE_INVALID', context);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function readEvidenceArtifact({
  repository,
  token,
  artifactId,
  digest,
  fetchImpl = globalThis.fetch,
}) {
  const context = { phase: 'provenance', operation: 'github.deployment' };
  try {
    const redirect = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`,
      {
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (redirect.status !== 302) fail('ADOPTION_EVIDENCE_INVALID', context);
    const location = new URL(redirect.headers.get('location'));
    if (
      location.protocol !== 'https:' ||
      location.username ||
      location.password ||
      location.port
    )
      fail('ADOPTION_EVIDENCE_INVALID', context);
    // Signed storage URL: never forward the GitHub Authorization header.
    const response = await fetchImpl(location.href, { redirect: 'error' });
    if (!response.ok || !response.body)
      fail('ADOPTION_EVIDENCE_INVALID', context);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) fail('ADOPTION_EVIDENCE_INVALID', context);
      chunks.push(chunk);
    }
    return evidenceReport(Buffer.concat(chunks), digest);
  } catch {
    fail('ADOPTION_EVIDENCE_INVALID', context);
  }
}
