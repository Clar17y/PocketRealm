import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@pocketrealm/shared/constants/gameConstants': path.resolve(__dirname, '../../packages/shared/src/constants/gameConstants.ts'),
      '@pocketrealm/shared/constants/npcDialogue': path.resolve(__dirname, '../../packages/shared/src/constants/npcDialogue.ts'),
      '@pocketrealm/shared/constants/achievementDefinitions': path.resolve(__dirname, '../../packages/shared/src/constants/achievementDefinitions.ts'),
      '@pocketrealm/shared/constants/expeditionDefinitions': path.resolve(__dirname, '../../packages/shared/src/constants/expeditionDefinitions.ts'),
      '@pocketrealm/shared/constants/worldEventTemplates': path.resolve(__dirname, '../../packages/shared/src/constants/worldEventTemplates.ts'),
      '@pocketrealm/shared/constants/combatActionDefinitions': path.resolve(__dirname, '../../packages/shared/src/constants/combatActionDefinitions.ts'),
      '@pocketrealm/shared/constants/combatEffectNames': path.resolve(__dirname, '../../packages/shared/src/constants/combatEffectNames.ts'),
      '@pocketrealm/shared/constants/talentTreeDefinitions': path.resolve(__dirname, '../../packages/shared/src/constants/talentTreeDefinitions.ts'),
      '@pocketrealm/shared/constants/bossTemplateDefinitions': path.resolve(__dirname, '../../packages/shared/src/constants/bossTemplateDefinitions.ts'),
      '@pocketrealm/shared/utils/titleDisplay': path.resolve(__dirname, '../../packages/shared/src/utils/titleDisplay.ts'),
      '@pocketrealm/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@pocketrealm/game-engine': path.resolve(__dirname, '../../packages/game-engine/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
    environment: 'jsdom',
  },
});
