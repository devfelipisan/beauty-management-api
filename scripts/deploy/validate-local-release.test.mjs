import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLocalRelease,
  validationSteps,
} from './validate-local-release.mjs';

test('local validation runs the existing gates once and never reports remote approval', () => {
  const calls = [],
    reports = [];
  const { report, exitCode } = validateLocalRelease({
    commitSha: 'a'.repeat(40),
    run: (args) => {
      calls.push(args);
      return { status: 0 };
    },
    persist: (value) => reports.push(structuredClone(value)),
  });
  assert.deepEqual(
    calls,
    validationSteps.map(([, args]) => args),
  );
  assert.equal(exitCode, 0);
  assert.equal(report.status, 'passed');
  assert.equal(report.remoteStateVerified, false);
  assert.equal(reports.at(-1).status, 'passed');
});

test('every gate fails closed, stops later commands and replaces previous success', () => {
  for (let failure = 0; failure < validationSteps.length; failure++) {
    for (const outcome of [
      { status: 9 },
      { status: null },
      undefined,
      'throw',
    ]) {
      let calls = 0,
        latest = { status: 'passed' };
      const { report, exitCode } = validateLocalRelease({
        run: () => {
          if (calls++ !== failure) return { status: 0 };
          if (outcome === 'throw') throw new Error('private diagnostic');
          return outcome;
        },
        persist: (value) => {
          latest = structuredClone(value);
        },
      });
      assert.equal(calls, failure + 1);
      assert.notEqual(exitCode, 0);
      assert.equal(latest.status, 'failed');
      assert.equal(report.steps.at(-1).name, validationSteps[failure][0]);
      assert.ok(!JSON.stringify(report).includes('private diagnostic'));
    }
  }
});
