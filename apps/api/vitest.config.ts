import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@pocketrealm/shared/constants/gameConstants': resolve(__dirname, '../../packages/shared/src/constants/gameConstants.ts'),
      '@pocketrealm/shared/constants/npcDialogue': resolve(__dirname, '../../packages/shared/src/constants/npcDialogue.ts'),
      '@pocketrealm/shared/constants/achievementDefinitions': resolve(__dirname, '../../packages/shared/src/constants/achievementDefinitions.ts'),
      '@pocketrealm/shared/constants/expeditionDefinitions': resolve(__dirname, '../../packages/shared/src/constants/expeditionDefinitions.ts'),
      '@pocketrealm/shared/constants/worldEventTemplates': resolve(__dirname, '../../packages/shared/src/constants/worldEventTemplates.ts'),
      '@pocketrealm/shared/constants/combatActionDefinitions': resolve(__dirname, '../../packages/shared/src/constants/combatActionDefinitions.ts'),
      '@pocketrealm/shared/constants/combatEffectNames': resolve(__dirname, '../../packages/shared/src/constants/combatEffectNames.ts'),
      '@pocketrealm/shared/constants/talentTreeDefinitions': resolve(__dirname, '../../packages/shared/src/constants/talentTreeDefinitions.ts'),
      '@pocketrealm/shared/constants/bossTemplateDefinitions': resolve(__dirname, '../../packages/shared/src/constants/bossTemplateDefinitions.ts'),
      '@pocketrealm/shared/utils/titleDisplay': resolve(__dirname, '../../packages/shared/src/utils/titleDisplay.ts'),
      '@pocketrealm/shared/wiki/wikiNavigation': resolve(__dirname, '../../packages/shared/src/wiki/wikiNavigation.ts'),
      '@pocketrealm/shared/wiki/wikiSearch': resolve(__dirname, '../../packages/shared/src/wiki/wikiSearch.ts'),
      '@pocketrealm/shared/support/supportTickets': resolve(__dirname, '../../packages/shared/src/support/supportTickets.ts'),
      '@pocketrealm/shared/discord/discordIds': resolve(__dirname, '../../packages/shared/src/discord/discordIds.ts'),
      '@pocketrealm/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@pocketrealm/game-engine': resolve(__dirname, '../../packages/game-engine/src/index.ts'),
      '@pocketrealm/database': resolve(__dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
    },
    pool: 'forks',
    maxWorkers: 3,
  },
});
