import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { loadLocalEnvFile, readDiscordSetupOptions, setupDiscordServer } from '../src/services/discordServerSetup';

const SETUP_ENV_FILENAME = '.discord-setup.env';

function maskSecret(value: string): string {
  return `...${value.slice(-4)}`;
}

/** Update key=value in the env file (preserving other lines), appending when missing. */
function upsertEnvValue(filePath: string, key: string, value: string): void {
  const lines = existsSync(filePath)
    ? readFileSync(filePath, 'utf8').split(/\r?\n/)
    : [];

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }

  const line = `${key}=${value}`;
  const keyIndex = lines.findIndex((entry) => entry.trim().startsWith(`${key}=`));

  if (keyIndex >= 0) {
    lines[keyIndex] = line;
  } else {
    lines.push(line);
  }

  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

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
  if (result.webhookUrl) {
    // The webhook URL embeds its token; keep it out of stdout and write it to
    // the gitignored local setup env file instead.
    const setupEnvPath = resolve(__dirname, '..', SETUP_ENV_FILENAME);
    upsertEnvValue(setupEnvPath, 'DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL', result.webhookUrl);
    console.log('Set this on the API service if webhook mirroring is enabled:');
    console.log(`DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL=${maskSecret(result.webhookUrl)} (full value written to ${setupEnvPath})`);
  } else {
    console.log('No support triage webhook URL was returned by Discord.');
  }
  console.log('');
  console.log('Set these on the Discord bot worker:');
  console.log(`DISCORD_SUPPORT_CATEGORY_ID=${result.categoryIdsByName.Support ?? ''}`);
  console.log(`DISCORD_WELCOME_CHANNEL_ID=${result.channelIdsByName.welcome ?? ''}`);
  console.log(`DISCORD_DUELS_CHANNEL_ID=${result.channelIdsByName.duels ?? ''}`);
  console.log(`DISCORD_ANNOUNCEMENT_CHANNEL_ID=${result.channelIdsByName.announcements ?? ''}`);
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
