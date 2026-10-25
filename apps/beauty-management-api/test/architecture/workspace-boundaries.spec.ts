import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const normalize = (value: string) => value.replaceAll('\\', '/');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['dist', 'node_modules'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}
const workspaces = ['apps', 'domains', 'packages'].flatMap((base) =>
  readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = resolve(base, entry.name);
      return {
        directory,
        base,
        manifest: JSON.parse(
          readFileSync(resolve(directory, 'package.json'), 'utf8'),
        ),
      };
    }),
);
const production = workspaces.flatMap((workspace) =>
  files(resolve(workspace.directory, 'src'))
    .filter((file) => !/\.(spec|d)\.ts$/.test(file))
    .map((file) => ({ workspace, file })),
);

describe('workspace boundaries', () => {
  it('checks every production import, including type imports and re-exports', () => {
    const violations: string[] = [];
    expect(production.length).toBeGreaterThan(200);
    for (const { workspace, file } of production) {
      const source = readFileSync(file, 'utf8');
      const location = normalize(relative(root, file));
      const inner =
        workspace.base === 'domains' &&
        /\/(domain|application|ports)\//.test(location);
      const domain = /\/domain\//.test(location);
      const report = (reason: string) =>
        violations.push(`${location}: ${reason}`);
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        const dependencyLiteral =
          ts.isStringLiteral(node) &&
          (ts.isImportDeclaration(node.parent) ||
            ts.isExportDeclaration(node.parent) ||
            (ts.isLiteralTypeNode(node.parent) &&
              ts.isImportTypeNode(node.parent.parent)) ||
            (ts.isCallExpression(node.parent) &&
              node.parent.expression.kind === ts.SyntaxKind.ImportKeyword));
        if (dependencyLiteral) {
          const specifier = node.text;
          if (/(^|\/)libs\//.test(specifier))
            report(`obsolete import ${specifier}`);
          if (specifier.startsWith('.')) {
            const target = resolve(dirname(file), specifier);
            if (
              !normalize(target).startsWith(
                normalize(workspace.directory) + '/',
              )
            )
              report(`relative workspace escape ${specifier}`);
            if (
              inner &&
              /\/(infrastructure|adapters)\//.test(normalize(target))
            )
              report(`infrastructure import ${specifier}`);
            if (domain && /\/(application|ports)\//.test(normalize(target)))
              report(`outward domain dependency ${specifier}`);
          } else if (specifier.startsWith('@beauty/')) {
            const name = specifier.split('/').slice(0, 2).join('/');
            const target = workspaces.find(
              (entry) => entry.manifest.name === name,
            );
            if (!target) report(`unknown workspace ${name}`);
            else {
              if (
                name !== workspace.manifest.name &&
                !workspace.manifest.dependencies?.[name]
              )
                report(`undeclared dependency ${name}`);
              const subpath =
                specifier === name ? '.' : '.' + specifier.slice(name.length);
              if (!target.manifest.exports?.[subpath])
                report(`unexported dependency ${specifier}`);
              if (
                workspace.base === 'domains' &&
                target.base !== 'packages' &&
                name !== workspace.manifest.name
              )
                report(`domain crosses context ${specifier}`);
              if (workspace.base === 'packages' && target.base !== 'packages')
                report(`technical package depends on ${specifier}`);
              if (target.base === 'apps')
                report(`application imported by ${specifier}`);
              if (
                workspace.base === 'apps' &&
                target.base === 'domains' &&
                workspace.manifest.name !== `${name}-worker`
              )
                report(`worker imports another domain ${specifier}`);
              if (
                inner &&
                /\/(d1|adapters|infrastructure|guards|interceptors)\//.test(
                  specifier,
                )
              )
                report(`provider dependency ${specifier}`);
              if (
                inner &&
                target.base === 'packages' &&
                ![
                  '@beauty/kernel',
                  '@beauty/contracts',
                  '@beauty/reliability',
                ].includes(name)
              )
                report(`technical integration in inner layer ${specifier}`);
              if (inner && specifier.endsWith('.module'))
                report(`framework module ${specifier}`);
              if (
                domain &&
                (name === '@beauty/reliability' ||
                  /\/(application|ports)\//.test(specifier))
              )
                report(`outward domain dependency ${specifier}`);
              if (inner && name === '@beauty/reliability' && specifier === name)
                report('mixed reliability barrel in inner layer');
            }
          } else if (
            inner &&
            /^(?:@nestjs\/|cloudflare:|@cloudflare\/|pg$|express$)/.test(
              specifier,
            )
          )
            report(`framework dependency ${specifier}`);
        }
        if (
          inner &&
          ts.isIdentifier(node) &&
          /^(D1Database|D1DatabaseLike|KVNamespace|R2Bucket)$/.test(node.text)
        )
          report(`provider type ${node.text}`);
        if (
          inner &&
          ts.isStringLiteral(node) &&
          (node.text === 'D1_SQL' ||
            /^(?:SELECT\s|INSERT\s|UPDATE\s|DELETE\s)/i.test(node.text))
        )
          report('SQL in inner layer');
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
    expect(violations).toEqual([]);
  });

  it('keeps the workspace dependency graph acyclic', () => {
    const visit = (name: string, stack: string[]) => {
      expect(stack, `dependency cycle through ${name}`).not.toContain(name);
      const workspace = workspaces.find(
        (entry) => entry.manifest.name === name,
      )!;
      for (const dependency of Object.keys(
        workspace.manifest.dependencies ?? {},
      ).filter((name) => name.startsWith('@beauty/')))
        visit(dependency, [...stack, name]);
    };
    for (const workspace of workspaces) visit(workspace.manifest.name, []);
  });
});
