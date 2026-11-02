import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function requiresWorkerDeployment(paths) {
  return paths.some((path) => {
    if (
      /\.(md|txt|snap)$/i.test(path) ||
      /(^|\/)(__tests__|test|tests)\//.test(path) ||
      /\.(spec|test)\.[cm]?[jt]sx?$/.test(path)
    )
      return false;
    return (
      /^(apps\/(operations|billing|clinical)-worker|domains|packages)\//.test(
        path,
      ) ||
      /^(package(?:-lock)?\.json|\.nvmrc|\.npmrc|tsconfig(?:\.[\w-]+)?\.json|nest-cli\.json)$/.test(
        path,
      ) ||
      ['scripts/deploy/manifest.json', '.github/deploy/request.json'].includes(
        path,
      )
    );
  });
}

export function deploymentChanges(base, head = 'HEAD', cwd = process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(base ?? '') || !/^(HEAD|[0-9a-f]{40})$/.test(head))
    throw new Error('Immutable change range required');
  // No rename detection: moving a source file to docs must retain its deletion.
  const paths = execFileSync(
    'git',
    ['diff', '--no-renames', '--name-only', '-z', base, head],
    { cwd, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  return requiresWorkerDeployment(paths);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const required = deploymentChanges(process.argv[2], process.argv[3]);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `deployRequired=${required}\n`);
  console.log(`Worker deployment required: ${required}`);
}
