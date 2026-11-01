import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import {
  workerConfigurations,
  workerSpecifications,
  requiredProductionText,
  manifestPath,
} from './config-contract.mjs';
import { readConfiguration } from './validate-local.mjs';
import { fail } from './errors.mjs';
import { normalizeBinding } from './binding-contract.mjs';
export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const sha = (value) => /^[0-9a-f]{40}$/.test(value ?? '');
function tokens(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
  );
  const result = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken)
    result.push(scanner.getTokenText());
  return result.join('\n');
}
export function manifestFromSources(read, files, configs) {
  const contractFiles = files
    .filter(
      (path) =>
        path.startsWith('packages/contracts/src/') &&
        path.endsWith('.ts') &&
        !/\.(spec|test)\.ts$/.test(path),
    )
    .sort();
  const shared = digest(
    contractFiles.map((path) => [path, tokens(read(path))]),
  );
  const ownershipPath = 'packages/reliability/src/outbox/ownership.ts';
  const ownershipAst = ts.createSourceFile(
      ownershipPath,
      read(ownershipPath),
      ts.ScriptTarget.Latest,
      true,
    ),
    events = {};
  function ownership(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ownershipAst) === 'outboxOwnership'
    ) {
      const value = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isObjectLiteralExpression(value))
        for (const property of value.properties)
          if (
            ts.isPropertyAssignment(property) &&
            ts.isArrayLiteralExpression(property.initializer)
          )
            events[property.name.getText(ownershipAst)] =
              property.initializer.elements.map((element) => element.text);
    }
    ts.forEachChild(node, ownership);
  }
  ownership(ownershipAst);
  const workers = {};
  for (const name of Object.keys(workerConfigurations)) {
    const path = `apps/${name}-worker/src/worker.ts`,
      source = read(path),
      ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const methods = [];
    function visit(node) {
      if (
        ts.isClassDeclaration(node) &&
        node.name?.text === `${name[0].toUpperCase() + name.slice(1)}Worker`
      ) {
        for (const member of node.members) {
          if (
            ts.isMethodDeclaration(member) &&
            !['fetch', 'scheduled'].includes(member.name.getText(ast)) &&
            !member.modifiers?.some((m) =>
              [
                ts.SyntaxKind.PrivateKeyword,
                ts.SyntaxKind.ProtectedKeyword,
              ].includes(m.kind),
            )
          )
            methods.push({
              name: member.name.getText(ast),
              parameters: member.parameters.map((p) => tokens(p.getText(ast))),
              returns: member.type ? tokens(member.type.getText(ast)) : null,
            });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const composition = read(`apps/${name}-worker/src/composition-root.ts`);
    // Composition type signatures affect Parameters<Composition['method']> RPC contracts.
    const compAst = ts.createSourceFile(
        'composition.ts',
        composition,
        ts.ScriptTarget.Latest,
        true,
      ),
      signatures = [];
    function comp(node) {
      if (ts.isMethodDeclaration(node))
        signatures.push([
          node.name.getText(compAst),
          node.parameters.map((p) => tokens(p.getText(compAst))),
          node.type ? tokens(node.type.getText(compAst)) : null,
        ]);
      ts.forEachChild(node, comp);
    }
    comp(compAst);
    const config = configs[name];
    const packageVersion = JSON.parse(read(`apps/${name}-worker/package.json`)).version;
    workers[name] = {
      packageVersion,
      provided: {
        revision: digest({ shared, methods, signatures, events: events[name] }),
        rpcMethods: methods.map((method) => method.name),
        events: events[name],
      },
      requires: {},
      minMigration: workerSpecifications[name].minMigration,
      productionText: requiredProductionText(name),
      requiredSecrets: config.secrets?.required ?? [],
      configurationHash: digest({
        name: config.name,
        main: config.main,
        d1: config.d1_databases,
        services: config.services,
        r2: config.r2_buckets ?? [],
        crons: config.triggers?.crons ?? [],
        workers_dev: config.workers_dev,
        preview_urls: config.preview_urls,
      }),
      transitions: [],
    };
  }
  for (const [name, worker] of Object.entries(workers))
    for (const service of configs[name].services) {
      const dependency = service.service.match(
        /^beauty-(operations|billing|clinical)-worker$/,
      )?.[1];
      if (!dependency)
        fail('MANIFEST_INVALID', {
          phase: 'validation',
          operation: 'configuration',
        });
      worker.requires[dependency] = [workers[dependency].provided.revision];
    }
  const migrations = files
    .filter((path) => /^database\/d1\/migrations\/\d+.*\.sql$/.test(path))
    .sort()
    .map((path) => ({
      name: path.split('/').at(-1),
      hash: digest(read(path).replace(/\r\n/g, '\n')),
    }));
  return { formatVersion: 1, workers, migrations };
}
export function localManifest() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  // Initial generation also sees files tracked in Git before this manifest is committed.
  return manifestFromSources(
    (path) => readFileSync(path, 'utf8'),
    files,
    Object.fromEntries(
      Object.entries(workerConfigurations).map(([name, path]) => [
        name,
        readConfiguration(path),
      ]),
    ),
  );
}
export function manifestAtCommit(commitSha) {
  if (!sha(commitSha))
    fail('MANIFEST_INVALID', {
      phase: 'provenance',
      operation: 'github.manifest',
    });
  const read = (path) =>
    execFileSync('git', ['show', `${commitSha}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const files = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', commitSha],
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/);
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => {
      const parsed = ts.parseConfigFileTextToJson(path, read(path));
      if (parsed.error)
        fail('MANIFEST_INVALID', {
          phase: 'provenance',
          operation: 'github.manifest',
        });
      return [name, parsed.config];
    }),
  );
  return manifestFromSources(read, files, configs);
}
export function validateManifest(value, computed) {
  const context = { phase: 'validation', operation: 'configuration' };
  if (
    value?.formatVersion !== 1 ||
    !value.workers ||
    JSON.stringify(value.migrations) !== JSON.stringify(computed.migrations)
  )
    fail('MANIFEST_INVALID', context);
  for (const name of Object.keys(workerConfigurations)) {
    const worker = value.workers[name],
      expected = computed.workers[name];
    if (
      !worker ||
      worker.packageVersion !== expected.packageVersion ||
      JSON.stringify(worker.provided) !== JSON.stringify(expected.provided) ||
      worker.configurationHash !== expected.configurationHash ||
      worker.minMigration !== expected.minMigration ||
      JSON.stringify(worker.productionText) !==
        JSON.stringify(expected.productionText) ||
      JSON.stringify(worker.requiredSecrets) !==
        JSON.stringify(expected.requiredSecrets) ||
      !Array.isArray(worker.transitions) ||
      Object.keys(worker.requires ?? {})
        .sort()
        .join() !== Object.keys(expected.requires).sort().join()
    )
      fail('MANIFEST_INVALID', context);
    const transitionNames = new Set();
    for (const transition of worker.transitions) {
      if (
        !transition ||
        Object.keys(transition).some(
          (key) => !['name', 'previous', 'reason'].includes(key),
        ) ||
        !/^[A-Z][A-Z0-9_]{0,63}$/.test(transition.name ?? '') ||
        transitionNames.has(transition.name) ||
        typeof transition.reason !== 'string' ||
        !transition.reason.trim() ||
        transition.reason.length > 256
      )
        fail('MANIFEST_INVALID', context);
      transitionNames.add(transition.name);
      const previous = transition.previous;
      if (
        previous !== null &&
        (!previous ||
          previous.name !== transition.name ||
          !['d1', 'service', 'r2_bucket'].includes(previous.type) ||
          Object.keys(previous).some(
            (key) =>
              ![
                'name',
                'type',
                ...({
                  d1: ['database_id', 'id'],
                  service: ['service', 'entrypoint', 'environment', 'props'],
                  r2_bucket: ['bucket_name'],
                }[previous.type] ?? []),
              ].includes(key),
          ))
      )
        fail('MANIFEST_INVALID', context);
      if (previous) {
        try {
          normalizeBinding(previous);
        } catch {
          fail('MANIFEST_INVALID', context);
        }
      }
    }
    for (const revisions of Object.values(worker.requires))
      if (
        !Array.isArray(revisions) ||
        !revisions.length ||
        revisions.some((r) => !/^[0-9a-f]{64}$/.test(r))
      )
        fail('MANIFEST_INVALID', context);
  }
  return value;
}
export function readManifest() {
  return validateManifest(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    localManifest(),
  );
}
export function simulateRelease(current, candidate, order) {
  const topology = { ...current };
  function check() {
    for (const [name, worker] of Object.entries(topology))
      for (const [dependency, revisions] of Object.entries(worker.requires)) {
        if (!revisions.includes(topology[dependency]?.provided?.revision))
          fail('CONTRACT_INCOMPATIBLE', {
            phase: 'preflight',
            operation: 'github.manifest',
            worker: name,
          });
      }
  }
  check();
  for (const name of order) {
    topology[name] = candidate.workers[name];
    check();
  }
}
