import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { conditions: ['beauty'] },
  test: { globals: true, root: './', include: ['**/*.spec.ts'] },
});
