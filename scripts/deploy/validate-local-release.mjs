import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const validationSteps = [
  ['format', ['scripts/check-format-changes.mjs', '--local']],
  ['code-contracts-and-workers', ['npm', 'run', 'check']],
  ['release-regressions', ['scripts/test-deployment.mjs']],
  ['configuration', ['scripts/worker-deployment-config.mjs']],
  ['manifest', ['scripts/deploy/manifest-check.mjs']],
];

export function validateLocalRelease({ run, persist = () => {}, commitSha }) {
  const report = {
    status: 'running',
    commitSha,
    scope: 'local',
    remoteStateVerified: false,
    steps: [],
  };
  persist(report);
  for (const [name, args] of validationSteps) {
    let result;
    try {
      result = run(args);
    } catch {
      result = { status: 1 };
    }
    const exitCode =
      Number.isInteger(result?.status) && result.status >= 0
        ? result.status
        : 1;
    report.steps.push({
      name,
      status: exitCode === 0 ? 'passed' : 'failed',
      exitCode,
    });
    if (exitCode !== 0) {
      report.status = 'failed';
      persist(report);
      return { report, exitCode };
    }
    persist(report);
  }
  report.status = 'passed';
  persist(report);
  return { report, exitCode: 0 };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const directory = '.cache/deploy-validation';
  mkdirSync(directory, { recursive: true });
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const result = validateLocalRelease({
    commitSha,
    run(args) {
      const npm = args[0] === 'npm';
      return spawnSync(
        npm
          ? process.platform === 'win32'
            ? 'npm.cmd'
            : 'npm'
          : process.execPath,
        npm ? args.slice(1) : args,
        { stdio: 'inherit' },
      );
    },
    persist(report) {
      writeFileSync(
        `${directory}/result.json`,
        JSON.stringify(report, null, 2) + '\n',
      );
    },
  });
  console.log(
    `Local deploy validation: ${result.report.status}. Report: ${directory}/result.json`,
  );
  process.exitCode = result.exitCode;
}
