import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@pocketrealm/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@pocketrealm/game-engine': path.resolve(__dirname, '../../packages/game-engine/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    environment: 'jsdom',
  },
});
