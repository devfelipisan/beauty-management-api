export const DOMAIN_FORBIDDEN_IMPORTS = [
  '@nestjs/',
  'cloudflare',
  'D1Database',
  'KVNamespace',
  'R2Bucket',
] as const;

export function containsForbiddenImport(content: string): boolean {
  return DOMAIN_FORBIDDEN_IMPORTS.some((dependency) => content.includes(dependency));
}
