# Discord Announcement Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staff-only `/announcement` Discord slash command that posts to `DISCORD_ANNOUNCEMENT_CHANNEL_ID` with an optional explicit `@everyone` toggle.

**Architecture:** Keep the feature inside `apps/discord-bot`. Add the announcement channel id to bot config, register a top-level slash command, implement a focused interaction handler, and route the command through the existing interaction router. The handler reuses the existing staff-role check and controls `allowedMentions` so mentions only expand when the `everyone` option is true.

**Tech Stack:** TypeScript, discord.js 14, Zod config parsing, Vitest, npm workspaces.

---

## File Structure

- Modify `apps/discord-bot/src/config.ts`: parse and expose `DISCORD_ANNOUNCEMENT_CHANNEL_ID`.
- Modify `apps/discord-bot/src/config.test.ts`: cover the new required config field.
- Modify `apps/discord-bot/src/commands/definitions.ts`: register `/announcement`.
- Modify `apps/discord-bot/src/commands/definitions.test.ts`: cover command ordering, permissions, and options.
- Create `apps/discord-bot/src/interactions/announcementCommand.ts`: staff checks, channel resolution, mention-safe send payloads, and ephemeral responses.
- Create `apps/discord-bot/src/interactions/announcementCommand.test.ts`: focused handler behavior tests.
- Modify `apps/discord-bot/src/interactions/interactionRouter.ts`: route `/announcement`.
- Modify `apps/discord-bot/src/interactions/interactionRouter.test.ts`: assert router dispatch.

## Task 1: Add Announcement Channel Config

**Files:**
- Modify: `apps/discord-bot/src/config.test.ts`
- Modify: `apps/discord-bot/src/config.ts`

- [ ] **Step 1: Write the failing config test**

In `apps/discord-bot/src/config.test.ts`, add `DISCORD_ANNOUNCEMENT_CHANNEL_ID` to `validEnv` and include `announcementChannelId` in the first assertion:

```ts
const validEnv = {
  DISCORD_BOT_TOKEN: 'bot-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  POCKETREALM_API_BASE_URL: 'https://api.pocketrealm.test',
  POCKETREALM_WEB_BASE_URL: 'https://pocketrealm.test',
  REDIS_URL: 'redis://localhost:6379',
  DISCORD_INTERNAL_API_KEY: 'a'.repeat(32),
  DISCORD_BOT_HEALTH_CHANNEL_ID: '345678901234567890',
  DISCORD_ANNOUNCEMENT_CHANNEL_ID: '445566778899001122',
  DISCORD_SUPPORT_TRIAGE_CHANNEL_ID: '456789012345678901',
  DISCORD_SUPPORT_CATEGORY_ID: '567890123456789012',
  DISCORD_DUELS_CHANNEL_ID: '678901234567890123',
  DISCORD_PLAYER_ROLE_ID: '678901234567890123',
  DISCORD_VERIFIED_ROLE_ID: '789012345678901234',
  DISCORD_SUPPORT_STAFF_ROLE_IDS: '890123456789012345,901234567890123456',
  DISCORD_XP_IGNORED_CHANNEL_IDS: '112233445566778899,223344556677889900',
  DISCORD_XP_ELIGIBLE_CHANNEL_IDS: '334455667788990011,445566778899001122',
  DISCORD_LEVEL_ROLE_MAP: '5:556677889900112233,10:667788990011223344',
};
```

```ts
expect(parseBotConfig(validEnv)).toMatchObject({
  token: 'bot-token',
  clientId: '123456789012345678',
  guildId: '234567890123456789',
  apiBaseUrl: 'https://api.pocketrealm.test',
  webBaseUrl: 'https://pocketrealm.test',
  redisUrl: 'redis://localhost:6379',
  internalApiKey: 'a'.repeat(32),
  botHealthChannelId: '345678901234567890',
  announcementChannelId: '445566778899001122',
  welcomeChannelId: null,
  duelsChannelId: '678901234567890123',
});
```

Add this assertion to the invalid snowflake test:

```ts
expect(() => parseBotConfig({ ...validEnv, DISCORD_ANNOUNCEMENT_CHANNEL_ID: 'not-a-snowflake' })).toThrow();
```

- [ ] **Step 2: Run the config test to verify it fails**

Run: `npm run test -w apps/discord-bot -- src/config.test.ts`

Expected: FAIL because `announcementChannelId` is missing from the parsed config object.

- [ ] **Step 3: Add the minimal config implementation**

In `apps/discord-bot/src/config.ts`, add the env schema field:

```ts
DISCORD_ANNOUNCEMENT_CHANNEL_ID: snowflakeSchema,
```

Add the `BotConfig` property:

```ts
announcementChannelId: string;
```

Add the returned config property in `parseBotConfig`:

```ts
announcementChannelId: parsed.DISCORD_ANNOUNCEMENT_CHANNEL_ID,
```

- [ ] **Step 4: Run the config test to verify it passes**

Run: `npm run test -w apps/discord-bot -- src/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the config slice**

```powershell
git add -- apps/discord-bot/src/config.ts apps/discord-bot/src/config.test.ts
git commit -m "feat(discord): configure announcement channel"
```

## Task 2: Register the Slash Command

**Files:**
- Modify: `apps/discord-bot/src/commands/definitions.test.ts`
- Modify: `apps/discord-bot/src/commands/definitions.ts`

- [ ] **Step 1: Write the failing command definition tests**

In `apps/discord-bot/src/commands/definitions.test.ts`, update the command name expectation:

```ts
expect(commandNames).toEqual([
  'link',
  'wiki',
  'profile',
  'turns',
  'skills',
  'rank',
  'duel',
  'report',
  'notify',
  'announcement',
  'staff',
]);
expect(commands).toHaveLength(11);
```

Add this test after the public command options test:

```ts
it('builds the announcement command with staff permissions and mention toggle', () => {
  const commands = buildCommandDefinitions();
  const announcementCommand = commands.find((command) => command.name === 'announcement');

  expect(announcementCommand?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
  expect(announcementCommand?.options).toEqual([
    expect.objectContaining({
      name: 'message',
      type: ApplicationCommandOptionType.String,
      required: true,
    }),
    expect.objectContaining({
      name: 'everyone',
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    }),
  ]);
});
```

- [ ] **Step 2: Run the command definition test to verify it fails**

Run: `npm run test -w apps/discord-bot -- src/commands/definitions.test.ts`

Expected: FAIL because `/announcement` is not registered.

- [ ] **Step 3: Add the slash command definition**

In `apps/discord-bot/src/commands/definitions.ts`, insert this builder between `/notify` and `/staff`:

```ts
new SlashCommandBuilder()
  .setName('announcement')
  .setDescription('Post a Pocketrealm announcement.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option
      .setName('message')
      .setDescription('Announcement message to post.')
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName('everyone')
      .setDescription('Notify everyone in the announcement channel.'),
  ),
```

- [ ] **Step 4: Run the command definition test to verify it passes**

Run: `npm run test -w apps/discord-bot -- src/commands/definitions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the command registration slice**

```powershell
git add -- apps/discord-bot/src/commands/definitions.ts apps/discord-bot/src/commands/definitions.test.ts
git commit -m "feat(discord): register announcement command"
```

## Task 3: Implement the Announcement Handler

**Files:**
- Create: `apps/discord-bot/src/interactions/announcementCommand.test.ts`
- Create: `apps/discord-bot/src/interactions/announcementCommand.ts`

- [ ] **Step 1: Write the failing handler tests**

Create `apps/discord-bot/src/interactions/announcementCommand.test.ts`:

```ts
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import { handleAnnouncementCommand } from './announcementCommand.js';

const guildId = '234567890123456789';
const staffRoleId = '345678901234567890';
const userRoleId = '456789012345678901';
const announcementChannelId = '567890123456789012';
const actorUserId = '678901234567890123';

const config = {
  announcementChannelId,
  supportStaffRoleIds: [staffRoleId],
} satisfies Pick<BotConfig, 'announcementChannelId' | 'supportStaffRoleIds'>;

describe('handleAnnouncementCommand', () => {
  it('rejects usage outside the PocketRealm Discord server', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      guildId: null,
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: '/announcement only works in the PocketRealm Discord server.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects announcements when staff roles are not configured', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, {
      config: {
        announcementChannelId,
        supportStaffRoleIds: [],
      },
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement commands are not configured. Ask an administrator to set support staff roles.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects non-staff users ephemerally', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([userRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('posts trimmed announcements with mentions suppressed by default', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '  Patch notes are live @everyone <@123456789012345678>  ',
      everyone: false,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith(announcementChannelId);
    expect(channel.send).toHaveBeenCalledWith({
      content: 'Patch notes are live @everyone <@123456789012345678>',
      allowedMentions: { parse: [] },
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: `Announcement posted to <#${announcementChannelId}>.`,
    });
  });

  it('prepends and permits @everyone when the toggle is enabled', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: 'The realm event starts now.',
      everyone: true,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(channel.send).toHaveBeenCalledWith({
      content: '@everyone\n\nThe realm event starts now.',
      allowedMentions: { parse: ['everyone'] },
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: `Announcement posted to <#${announcementChannelId}>.`,
    });
  });

  it('rejects whitespace-only announcements before fetching the channel', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '   ',
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('reports an unavailable announcement channel ephemerally', async () => {
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: null,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
  });

  it('reports Discord send failures ephemerally', async () => {
    const channel = createAnnouncementChannel();
    channel.send.mockRejectedValueOnce(new Error('missing permissions'));
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Could not send the announcement right now. Check bot logs and channel permissions.',
    });
  });
});

function memberWithRoles(roleIds: string[]): GuildMember {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { id: string }) => boolean) => roleIds.some((id) => predicate({ id })),
      },
    },
  } as unknown as GuildMember;
}

function createAnnouncementChannel() {
  return {
    isSendable: vi.fn(() => true),
    send: vi.fn(async () => ({})),
  };
}

function createAnnouncementInteraction(input: {
  member: unknown;
  message?: string;
  everyone?: boolean | null;
  announcementChannel?: ReturnType<typeof createAnnouncementChannel> | null;
  guildId?: string | null;
}): ChatInputCommandInteraction {
  return {
    commandName: 'announcement',
    guildId: input.guildId === undefined ? guildId : input.guildId,
    member: input.member,
    user: {
      id: actorUserId,
    },
    client: {
      channels: {
        fetch: vi.fn(async () => input.announcementChannel ?? null),
      },
    },
    options: {
      getString: vi.fn(() => input.message ?? 'Server reset at 20:00 UTC'),
      getBoolean: vi.fn(() => input.everyone ?? null),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}
```

- [ ] **Step 2: Run the handler test to verify it fails**

Run: `npm run test -w apps/discord-bot -- src/interactions/announcementCommand.test.ts`

Expected: FAIL because `./announcementCommand.js` does not exist.

- [ ] **Step 3: Add the minimal handler implementation**

Create `apps/discord-bot/src/interactions/announcementCommand.ts`:

```ts
import type { ChatInputCommandInteraction, MessageMentionOptions } from 'discord.js';

import type { BotConfig } from '../config.js';
import { isStaffMember } from '../support/threadActions.js';

type AnnouncementConfig = Pick<BotConfig, 'announcementChannelId' | 'supportStaffRoleIds'>;

interface AnnouncementCommandOptions {
  config: AnnouncementConfig;
}

interface AnnouncementPayload {
  content: string;
  allowedMentions: MessageMentionOptions;
}

interface SendableAnnouncementChannel {
  isSendable(): boolean;
  send(payload: AnnouncementPayload): Promise<unknown>;
}

export async function handleAnnouncementCommand(
  interaction: ChatInputCommandInteraction,
  options: AnnouncementCommandOptions,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/announcement only works in the PocketRealm Discord server.',
    });
    return;
  }

  const staffRoleIds = new Set(options.config.supportStaffRoleIds);
  if (staffRoleIds.size === 0) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement commands are not configured. Ask an administrator to set support staff roles.',
    });
    return;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    return;
  }

  const message = interaction.options.getString('message', true).trim();
  if (!message) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels
    .fetch(options.config.announcementChannelId)
    .catch(() => null);

  if (!isSendableAnnouncementChannel(channel)) {
    await interaction.editReply({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
    return;
  }

  const everyone = interaction.options.getBoolean('everyone') ?? false;

  try {
    await channel.send(buildAnnouncementPayload(message, everyone));
  } catch {
    await interaction.editReply({
      content: 'Could not send the announcement right now. Check bot logs and channel permissions.',
    });
    return;
  }

  await interaction.editReply({
    content: `Announcement posted to <#${options.config.announcementChannelId}>.`,
  });
}

function buildAnnouncementPayload(message: string, everyone: boolean): AnnouncementPayload {
  const allowedMentions: MessageMentionOptions = everyone ? { parse: ['everyone'] } : { parse: [] };

  return {
    content: everyone ? `@everyone\n\n${message}` : message,
    allowedMentions,
  };
}

function isSendableAnnouncementChannel(channel: unknown): channel is SendableAnnouncementChannel {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  if (!('isSendable' in channel) || typeof channel.isSendable !== 'function') {
    return false;
  }

  if (!('send' in channel) || typeof channel.send !== 'function') {
    return false;
  }

  return channel.isSendable();
}
```

- [ ] **Step 4: Run the handler test to verify it passes**

Run: `npm run test -w apps/discord-bot -- src/interactions/announcementCommand.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the handler slice**

```powershell
git add -- apps/discord-bot/src/interactions/announcementCommand.ts apps/discord-bot/src/interactions/announcementCommand.test.ts
git commit -m "feat(discord): send staff announcements"
```

## Task 4: Route the Command

**Files:**
- Modify: `apps/discord-bot/src/interactions/interactionRouter.test.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write the failing router test**

In `apps/discord-bot/src/interactions/interactionRouter.test.ts`, add the import:

```ts
import { handleAnnouncementCommand } from './announcementCommand.js';
```

Add the mock:

```ts
vi.mock('./announcementCommand.js', () => ({
  handleAnnouncementCommand: vi.fn(),
}));
```

Add `announcementChannelId` to `routerConfig`:

```ts
announcementChannelId: 'announcement-channel-1',
```

Add this test near the other chat command routing tests:

```ts
it('routes announcement commands to the announcement handler', async () => {
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'announcement',
  } as unknown as Interaction;
  const api = createApi(null);

  await routeInteraction(interaction, { api, config: routerConfig });

  expect(handleAnnouncementCommand).toHaveBeenCalledWith(interaction, {
    config: routerConfig,
  });
});
```

- [ ] **Step 2: Run the router test to verify it fails**

Run: `npm run test -w apps/discord-bot -- src/interactions/interactionRouter.test.ts`

Expected: FAIL because `/announcement` falls through to the unhandled interaction reply.

- [ ] **Step 3: Add router support**

In `apps/discord-bot/src/interactions/interactionRouter.ts`, add the import:

```ts
import { handleAnnouncementCommand } from './announcementCommand.js';
```

Add `announcementChannelId` to the `InteractionRouterOptions` config pick:

```ts
| 'announcementChannelId'
```

Add this routing branch before the `/staff` branch:

```ts
if (interaction.commandName === 'announcement') {
  await handleAnnouncementCommand(interaction, { config: options.config });
  return;
}
```

- [ ] **Step 4: Run the router test to verify it passes**

Run: `npm run test -w apps/discord-bot -- src/interactions/interactionRouter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the routing slice**

```powershell
git add -- apps/discord-bot/src/interactions/interactionRouter.ts apps/discord-bot/src/interactions/interactionRouter.test.ts
git commit -m "feat(discord): route announcement command"
```

## Task 5: Focused Verification And Cleanup

**Files:**
- Review touched files only.

- [ ] **Step 1: Run focused Discord bot tests**

Run: `rtk npm run test -w apps/discord-bot`

Expected: PASS for all Discord bot test files.

- [ ] **Step 2: Run the Discord bot build**

Run: `rtk npm run build:discord-bot`

Expected: PASS with TypeScript compilation complete.

- [ ] **Step 3: Invoke the simplify skill**

Before final handoff, invoke `superpowers:simplify` and review only the touched diff. Apply changes only if they reduce duplication or clarify the implementation without expanding scope.

- [ ] **Step 4: Re-run focused verification after any simplification**

Run: `rtk npm run test -w apps/discord-bot`

Expected: PASS.

Run: `rtk npm run build:discord-bot`

Expected: PASS.

- [ ] **Step 5: Commit cleanup if files changed**

If the simplify pass changes code, commit the cleanup:

```powershell
git add -- apps/discord-bot/src/config.ts apps/discord-bot/src/config.test.ts apps/discord-bot/src/commands/definitions.ts apps/discord-bot/src/commands/definitions.test.ts apps/discord-bot/src/interactions/announcementCommand.ts apps/discord-bot/src/interactions/announcementCommand.test.ts apps/discord-bot/src/interactions/interactionRouter.ts apps/discord-bot/src/interactions/interactionRouter.test.ts
git commit -m "refactor(discord): simplify announcement command"
```

If the simplify pass does not change files, do not create an empty commit.

## Final Verification Summary

Before claiming completion, report:

- `npm run test -w apps/discord-bot`: pass or exact failure.
- `npm run build:discord-bot`: pass or exact failure.
- Final `git status --short`.
