import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { containsForbiddenImport } from '../../../../libs/testing/src/index.js';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('architecture dependency boundaries', () => {
  it('keeps kernel domain independent from framework and providers', () => {
    const domainDirectory = join(process.cwd(), 'libs', 'kernel', 'src', 'domain');
    const violations = sourceFiles(domainDirectory).filter((file) =>
      containsForbiddenImport(readFileSync(file, 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it('keeps application primitives free of infrastructure dependencies', () => {
    const applicationDirectory = join(process.cwd(), 'libs', 'kernel', 'src', 'application');
    const violations = sourceFiles(applicationDirectory).filter((file) =>
      /D1Database|KVNamespace|R2Bucket|cloudflare/.test(readFileSync(file, 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it('keeps kernel primitives independent from auth and tenancy adapters', () => {
    const kernelDirectory = join(process.cwd(), 'libs', 'kernel', 'src');
    const violations = sourceFiles(kernelDirectory).filter((file) =>
      /authentication|tenancy|@nestjs\/observe/.test(readFileSync(file, 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it('keeps the current application boundary free of D1 bindings', () => {
    const appModule = readFileSync(
      join(process.cwd(), 'apps', 'beauty-management-api', 'src', 'app.module.ts'),
      'utf8',
    );
    expect(appModule).not.toContain('DatabaseModule');
    expect(appModule).not.toContain('D1_DATABASE');
  });

  it('keeps database adapters independent from business contexts', () => {
    const databaseDirectory = join(process.cwd(), 'libs', 'database', 'src');
    const violations = sourceFiles(databaseDirectory).filter((file) =>
      /(?:^|[^A-Za-z])(Customer|Appointment|Payment|Session|authentication|tenancy)(?:$|[^A-Za-z])/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(violations).toEqual([]);
  });
});
