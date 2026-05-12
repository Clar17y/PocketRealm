import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@pocketrealm/shared/constants/achievementDefinitions': resolve(__dirname, '../shared/src/constants/achievementDefinitions.ts'),
      '@pocketrealm/shared/constants/bossTemplateDefinitions': resolve(__dirname, '../shared/src/constants/bossTemplateDefinitions.ts'),
      '@pocketrealm/shared/constants/combatActionDefinitions': resolve(__dirname, '../shared/src/constants/combatActionDefinitions.ts'),
      '@pocketrealm/shared/constants/combatEffectNames': resolve(__dirname, '../shared/src/constants/combatEffectNames.ts'),
      '@pocketrealm/shared/constants/expeditionDefinitions': resolve(__dirname, '../shared/src/constants/expeditionDefinitions.ts'),
      '@pocketrealm/shared/constants/gameConstants': resolve(__dirname, '../shared/src/constants/gameConstants.ts'),
      '@pocketrealm/shared/constants/npcDialogue': resolve(__dirname, '../shared/src/constants/npcDialogue.ts'),
      '@pocketrealm/shared/constants/talentTreeDefinitions': resolve(__dirname, '../shared/src/constants/talentTreeDefinitions.ts'),
      '@pocketrealm/shared/constants/worldEventTemplates': resolve(__dirname, '../shared/src/constants/worldEventTemplates.ts'),
      '@pocketrealm/shared/utils/titleDisplay': resolve(__dirname, '../shared/src/utils/titleDisplay.ts'),
      '@pocketrealm/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    pool: 'forks',
    maxWorkers: 3,
  },
});
