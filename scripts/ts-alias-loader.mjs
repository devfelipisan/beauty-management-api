import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();

function resolveTypeScriptFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const resolved = resolveTypeScriptFile(path.join(root, "src", relative));
    if (!resolved) throw new Error(`Unable to resolve TypeScript alias ${specifier}`);
    return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDirectory = path.dirname(fileURLToPath(context.parentURL));
    const resolved = resolveTypeScriptFile(path.resolve(parentDirectory, specifier));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
