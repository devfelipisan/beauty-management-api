import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  await applyD1Migrations(env.D1_DATABASE, env.TEST_MIGRATIONS);
});
