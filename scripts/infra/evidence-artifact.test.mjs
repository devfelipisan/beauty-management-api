import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readEvidenceArtifact, evidenceReport } from './evidence-artifact.mjs';
const archive = execFileSync('python3', [
  '-c',
  'import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:z.writestr("result.json",\'{"status":"success"}\')\nsys.stdout.buffer.write(b.getvalue())',
]);
const hash = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
test('archive checksum is verified before parsing the sole report', () => {
  assert.deepEqual(evidenceReport(archive, hash), { status: 'success' });
  assert.throws(() => evidenceReport(archive, `sha256:${'0'.repeat(64)}`), {
    code: 'ADOPTION_EVIDENCE_INVALID',
  });
  const invalid = Buffer.from('not a zip');
  assert.throws(
    () =>
      evidenceReport(
        invalid,
        `sha256:${createHash('sha256').update(invalid).digest('hex')}`,
      ),
    { code: 'ADOPTION_EVIDENCE_INVALID' },
  );
});
test('signed storage fetch never receives the GitHub token', async () => {
  const calls = [];
  const value = await readEvidenceArtifact({
    repository: 'owner/repo',
    token: 'private-fixture',
    artifactId: 1,
    digest: hash,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? {
            status: 302,
            headers: new Headers({
              location: 'https://storage.example.test/archive',
            }),
          }
        : new Response(archive);
    },
  });
  assert.equal(value.status, 'success');
  assert.equal(
    calls[0].options.headers.authorization,
    'Bearer private-fixture',
  );
  assert.equal(calls[1].options.headers, undefined);
  assert.equal(calls[1].options.redirect, 'error');
});
test('non-HTTPS redirect and denied artifact download are sanitized', async () => {
  for (const result of [
    { status: 403 },
    {
      status: 302,
      headers: new Headers({ location: 'http://storage.example.test/archive' }),
    },
  ])
    await assert.rejects(
      readEvidenceArtifact({
        repository: 'owner/repo',
        token: 'private-fixture',
        artifactId: 1,
        digest: hash,
        fetchImpl: async () => result,
      }),
      { code: 'ADOPTION_EVIDENCE_INVALID' },
    );
});
