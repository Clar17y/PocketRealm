import { resolve } from 'path';

import { loadLocalEnvFile, readDiscordSetupOptions, setupDiscordServer } from '../src/services/discordServerSetup';

async function main(): Promise<void> {
  loadLocalEnvFile(resolve(process.cwd(), '../..'));
  loadLocalEnvFile(process.cwd());
  const result = await setupDiscordServer(readDiscordSetupOptions());

  console.log('Discord server setup complete.');
  console.log(`Roles: ${result.createdRoles.length} created, ${result.existingRoles.length} existing.`);
  console.log(`Categories: ${result.createdCategories.length} created, ${result.existingCategories.length} existing.`);
  console.log(`Channels: ${result.createdChannels.length} created, ${result.existingChannels.length} existing.`);
  console.log(`Channel placement/permissions updated: ${result.updatedChannels.length}.`);
  console.log('');
  console.log('Set this on the API service:');
  console.log(`DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL=${result.webhookUrl}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
