import { resolve } from 'path';

import { loadLocalEnvFile, readDiscordSetupOptions, setupDiscordServer } from '../src/services/discordServerSetup';

async function main(): Promise<void> {
  loadLocalEnvFile(resolve(process.cwd(), '../..'));
  loadLocalEnvFile(process.cwd());
  const result = await setupDiscordServer(readDiscordSetupOptions());
  const levelRoleMap = [5, 10, 20, 30, 50]
    .map((level) => `${level}:${result.roleIdsByKey[`level${level}`] ?? ''}`)
    .join(',');

  console.log('Discord server setup complete.');
  console.log(`Roles: ${result.createdRoles.length} created, ${result.existingRoles.length} existing.`);
  console.log(`Categories: ${result.createdCategories.length} created, ${result.existingCategories.length} existing.`);
  console.log(`Channels: ${result.createdChannels.length} created, ${result.existingChannels.length} existing.`);
  console.log(`Channel placement/permissions updated: ${result.updatedChannels.length}.`);
  console.log(`Starter messages: ${result.seededStarterMessages.length} posted, ${result.existingStarterMessages.length} existing.`);
  console.log(`AutoMod rules: ${result.createdAutoModRules.length} created, ${result.updatedAutoModRules.length} updated.`);
  console.log('');
  console.log('Set this on the API service if webhook mirroring is enabled:');
  console.log(`DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL=${result.webhookUrl}`);
  console.log('');
  console.log('Set these on the Discord bot worker:');
  console.log(`DISCORD_SUPPORT_CATEGORY_ID=${result.categoryIdsByName.Support ?? ''}`);
  console.log(`DISCORD_WELCOME_CHANNEL_ID=${result.channelIdsByName.welcome ?? ''}`);
  console.log(`DISCORD_DUELS_CHANNEL_ID=${result.channelIdsByName.duels ?? ''}`);
  console.log(`DISCORD_SUPPORT_TRIAGE_CHANNEL_ID=${result.channelIdsByName['support-triage'] ?? ''}`);
  console.log(`DISCORD_BOT_HEALTH_CHANNEL_ID=${result.channelIdsByName['bot-health'] ?? ''}`);
  console.log(`DISCORD_PLAYER_ROLE_ID=${result.roleIdsByKey.player ?? ''}`);
  console.log(`DISCORD_VERIFIED_ROLE_ID=${result.roleIdsByKey.linked ?? ''}`);
  console.log(`DISCORD_LEVEL_ROLE_MAP=${levelRoleMap}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
