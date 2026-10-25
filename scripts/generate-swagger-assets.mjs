import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const distribution = dirname(require.resolve('swagger-ui-dist/package.json'));
const output = fileURLToPath(
  new URL(
    '../packages/cloudflare-runtime/src/generated/swagger-assets.ts',
    import.meta.url,
  ),
);
const [bundle, css, license, notice, thirdPartyLicenses] = await Promise.all(
  [
    'swagger-ui-bundle.js',
    'swagger-ui.css',
    'LICENSE',
    'NOTICE',
    'swagger-ui-bundle.js.LICENSE.txt',
  ].map((name) => readFile(join(distribution, name), 'utf8')),
);
const source =
  '// Generated from swagger-ui-dist; do not edit.\n' +
  `export const swaggerBundle: string = ${JSON.stringify(bundle)};\n` +
  `export const swaggerCss: string = ${JSON.stringify(css)};\n` +
  `export const swaggerLicense: string = ${JSON.stringify([license, notice, thirdPartyLicenses].join('\n\n'))};\n`;
await mkdir(dirname(output), { recursive: true });
if ((await readFile(output, 'utf8').catch(() => '')) !== source)
  await writeFile(output, source);
