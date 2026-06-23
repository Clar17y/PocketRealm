import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — delegates to workspace configs.
 * Run `npm run test` to use per-workspace configs with proper env/environment.
 * This config exists so bare `npx vitest` from root doesn't pick up wrong files.
 */
export default defineConfig({
  test: {
    projects: [
      'apps/api/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'packages/database/vitest.config.ts',
      'packages/game-engine/vitest.config.ts',
      'packages/shared/vitest.config.ts',
    ],
  },
});
