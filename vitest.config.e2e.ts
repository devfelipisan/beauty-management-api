import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Explicit fixtures: a clean CI checkout has no developer .env file.
    env: {
      NODE_ENV: 'test',
      APP_ENV: 'test',
      SERVICE_ID: 'beauty-e2e',
      SERVICE_VERSION: 'e2e',
      AUTH_PROVIDER: 'mock',
      OBSERVE_ENABLED: 'false',
    },
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
