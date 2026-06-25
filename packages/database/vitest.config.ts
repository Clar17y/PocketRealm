import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@pocketrealm/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@pocketrealm/game-engine': resolve(__dirname, '../game-engine/src/index.ts'),
    },
  },
  test: {
    include: ['prisma/seed-data/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    pool: 'forks',
    maxWorkers: 3,
  },
});
