import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@pocketrealm/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@pocketrealm/game-engine': resolve(__dirname, '../../packages/game-engine/src/index.ts'),
      '@pocketrealm/database': resolve(__dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    setupFiles: ['src/__test__/setup.ts'],
    env: {
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 3,
      },
    },
  },
});
