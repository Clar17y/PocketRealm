# Persistent Discord Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PocketRealmBot as a persistent public-launch Discord companion with setup repair, AutoMod baseline, account linking, linked-title proof, wiki/player commands, support triage threads, Discord XP, and no-mutation friendly duels.

**Architecture:** Add a separate `apps/discord-bot` worker that uses `discord.js` for Gateway events, slash commands, buttons, modals, role sync, and threads. Keep the Express API authoritative for account linkage, player data, support tickets, and duel simulation; allow the bot to write only bot-owned XP/cooldown/audit state directly when that reduces API churn. Store durable state in Postgres and short-lived cooldowns in Redis.

**Tech Stack:** TypeScript, npm workspaces, Express 4, Prisma 6/PostgreSQL, Redis/ioredis, Vitest, discord.js, Zod, Render worker.

**Spec:** `docs/superpowers/specs/2026-06-03-discord-persistent-bot-design.md`

**Discord References:**
- Interactions and slash commands: https://docs.discord.com/developers/platform/interactions
- Gateway events: https://docs.discord.com/developers/topics/gateway
- Auto Moderation API: https://docs.discord.com/developers/resources/auto-moderation

---

## Scope

This plan implements the full v1 public-launch bot slice from the spec. The feature is broad, so work is split into independently testable phases with commit points. Each phase should leave the repo building and the existing support workflow intact.

V1 behavior decisions:

- PocketRealmBot has no kick or ban permissions.
- AutoMod handles first-line spam, mention raids, and blocked terms; humans handle judgment.
- Discord community XP is Discord-only and grants no gameplay power.
- Discord account linking grants only the `Linked Adventurer` achievement-backed title.
- `/report` creates a canonical ticket only for linked Discord users in v1. Unlinked users get an ephemeral prompt to link or use the in-game report flow, because the existing `SupportTicket` schema requires a reporter account.
- `/duel` is public, restricted to `#duels`, requires both users linked, requires target acceptance, and never mutates turns, resources, ratings, durability, achievements, quests, rewards, or cooldowns.
- Friendly Discord duels use current equipment, skills, skill tree, combat template, and combat formulas. Both sides start from max duel resources in v1 so Discord duels stay social and do not punish a player for being injured or recovering in-game.

Before connecting to a real guild:

- Rotate any Discord token that was used in local setup.
- Use a staging/test Discord guild first.
- Enable required privileged intents in the Discord developer portal: Server Members Intent and Message Content Intent.

---

## File Structure

### Database And Shared Packages

| File | Responsibility |
|---|---|
| `packages/database/prisma/schema.prisma` | Add Discord link, XP, duel, support-thread, and bot-audit models plus relations. |
| `packages/database/prisma/migrations/*_add_discord_bot_state/migration.sql` | Generated migration plus partial unique indexes for active links. |
| `packages/shared/src/constants/achievementDefinitions.ts` | Add `discord_linked` general achievement with `Linked Adventurer` title reward. |
| `packages/shared/src/wiki/wikiNavigation.ts` | Move reusable wiki navigation/search metadata out of the web app. |
| `packages/shared/src/wiki/wikiSearch.ts` | Shared deterministic wiki search over labels, slugs, aliases, and keywords. |
| `packages/shared/package.json` | Export the new wiki modules. |
| `apps/web/src/app/wiki/wikiNavigation.ts` | Re-export shared wiki navigation to keep existing imports stable. |

### API

| File | Responsibility |
|---|---|
| `apps/api/src/middleware/internalBotAuth.ts` | Authenticate bot-to-API calls with `x-pocketrealm-bot-key`. |
| `apps/api/src/services/discordSchemas.ts` | Zod schemas and response types for Discord-facing API routes. |
| `apps/api/src/services/discordAccountLinkService.ts` | Link-code creation, claim, active-link lookup, linked-title grant, unsynced role queue. |
| `apps/api/src/services/discordProfileService.ts` | Linked-user profile, turns, skills, and rank summaries safe for Discord. |
| `apps/api/src/services/discordDuelService.ts` | Pending duel validation, no-mutation simulation, stored summary/replay retrieval. |
| `apps/api/src/services/discordSupportThreadService.ts` | Triage-message tracking, ticket-thread mapping, staff status updates from Discord. |
| `apps/api/src/services/discordBotAuditService.ts` | Bot command/action audit rows. |
| `apps/api/src/services/wikiSearchService.ts` | API wrapper for shared wiki search with absolute web URLs. |
| `apps/api/src/routes/discord.ts` | Internal bot routes plus authenticated player link-claim/status routes. |
| `apps/api/src/routes/support.ts` | Keep existing support routes; call new service helpers only where needed. |
| `apps/api/src/services/supportTicketService.ts` | Allow Discord-created linked tickets and Discord staff update metadata. |
| `apps/api/src/app.ts` | Mount `/api/v1/discord`. |
| `apps/api/src/services/discordServerSetup.ts` | Extend idempotent setup with bot channels, roles, permissions, and AutoMod rules. |
| `apps/api/scripts/setup-discord-server.ts` | Print channel/role/env output for persistent bot deployment. |

### Discord Bot Worker

| File | Responsibility |
|---|---|
| `apps/discord-bot/package.json` | Worker package scripts and dependencies. |
| `apps/discord-bot/tsconfig.json` | TypeScript project reference config. |
| `apps/discord-bot/src/config.ts` | Required env parsing and channel/role config. |
| `apps/discord-bot/src/index.ts` | Process entrypoint, Discord client startup, shutdown, polling loops. |
| `apps/discord-bot/src/api/pocketRealmApi.ts` | Typed fetch wrapper for PocketRealm API with internal bot auth. |
| `apps/discord-bot/src/commands/definitions.ts` | Slash command definitions. |
| `apps/discord-bot/src/commands/register.ts` | Guild command registration script. |
| `apps/discord-bot/src/interactions/interactionRouter.ts` | Dispatch slash commands, buttons, and modals. |
| `apps/discord-bot/src/interactions/linkCommand.ts` | `/link` status/code response and role sync trigger. |
| `apps/discord-bot/src/interactions/wikiCommand.ts` | `/wiki` search response. |
| `apps/discord-bot/src/interactions/playerCommands.ts` | `/profile`, `/turns`, `/skills`, `/rank`. |
| `apps/discord-bot/src/interactions/duelCommand.ts` | `/duel`, accept, replay, builds, rematch. |
| `apps/discord-bot/src/interactions/reportCommand.ts` | `/report` modal and linked ticket creation. |
| `apps/discord-bot/src/interactions/staffCommands.ts` | Staff-only sync, repair, ticket update, XP adjust commands. |
| `apps/discord-bot/src/support/triageCards.ts` | Poll unposted tickets, post/update triage cards, handle staff buttons. |
| `apps/discord-bot/src/support/threadActions.ts` | Create/archive ticket-linked private follow-up threads. |
| `apps/discord-bot/src/xp/messageXp.ts` | Chat XP eligibility, cooldowns, duplicate detection, level-role sync. |
| `apps/discord-bot/src/discord/roleSync.ts` | Linked role and level role syncing. |
| `apps/discord-bot/src/discord/components.ts` | Custom ID builder/parser for buttons/modals. |
| `apps/discord-bot/src/discord/format.ts` | Embed and message formatting helpers. |

### Web

| File | Responsibility |
|---|---|
| `apps/web/src/lib/api/discord.ts` | Authenticated link-status and code-claim client helpers. |
| `apps/web/src/lib/api/index.ts` | Export Discord API helpers. |
| `apps/web/src/components/support/DiscordLinkCard.tsx` | Settings card where players enter link codes and see link status. |
| `apps/web/src/components/support/DiscordLinkCard.test.tsx` | Client behavior tests. |
| `apps/web/src/components/screens/Settings.tsx` | Render link card near Help & Support. |

### Documentation And Config

| File | Responsibility |
|---|---|
| `package.json` | Add `build:discord-bot`, `start:discord-bot`, and `discord:register-commands`. |
| `tsconfig.json` | Add `apps/discord-bot` project reference. |
| `apps/api/.env.example` | Add API-side Discord bot env vars. |
| `apps/discord-bot/.env.example` | Document worker env vars. |
| `docs/reference/deployment.md` | Add Discord worker deployment, intents, permissions, env, and smoke checks. |

---

## Phase 1: Server Setup, Roles, Channels, And AutoMod

### Task 1: Extend the setup plan shape

**Files:**
- Modify: `apps/api/src/services/discordServerSetup.ts`
- Modify: `apps/api/src/services/discordServerSetup.test.ts`

- [ ] **Step 1: Add setup-plan tests**

Add tests that assert the setup plan includes:

```ts
expect(plan.roles.map((role) => role.key)).toEqual(expect.arrayContaining([
  'linked',
  'level5',
  'level10',
  'level20',
  'level30',
  'level50',
]));

const channelNames = plan.categories.flatMap((category) => category.channels.map((channel) => channel.name));
expect(channelNames).toEqual(expect.arrayContaining([
  'duels',
  'bot-health',
  'support-triage',
  'mod-log',
]));
```

Also add a permissions test:

```ts
expect(buildRequiredBotPermissionBits()).not.toContain('KickMembers');
expect(buildRequiredBotPermissionBits()).not.toContain('BanMembers');
```

- [ ] **Step 2: Run setup tests to verify failure**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts
```

Expected: FAIL because the new role keys, channel names, and permission helper do not exist.

- [ ] **Step 3: Implement role/channel additions**

Extend `RoleKey`:

```ts
type RoleKey =
  | 'staff'
  | 'moderator'
  | 'triage'
  | 'tester'
  | 'founder'
  | 'linked'
  | 'level5'
  | 'level10'
  | 'level20'
  | 'level30'
  | 'level50';
```

Add roles:

```ts
{ key: 'linked', name: 'Linked Account', color: 0x2ecc71 },
{ key: 'level5', name: 'Realm Level 5', color: 0x95a5a6 },
{ key: 'level10', name: 'Realm Level 10', color: 0x3498db },
{ key: 'level20', name: 'Realm Level 20', color: 0x9b59b6 },
{ key: 'level30', name: 'Realm Level 30', color: 0xe67e22 },
{ key: 'level50', name: 'Realm Level 50', color: 0xf1c40f },
```

Add channels:

```ts
{
  name: 'duels',
  starterMessage: {
    title: 'Friendly duels',
    lines: [
      'Use /duel here for no-stakes simulations against linked players.',
      'Duels do not spend turns, change ratings, damage gear, grant rewards, or alter character state.',
      'Use the site to adjust equipment, skills, and combat templates before rematching.',
    ],
  },
},
{
  name: 'bot-health',
  privateToRoleKeys: ['staff', 'moderator', 'triage'],
  starterMessage: {
    title: 'Bot health',
    lines: ['PocketRealmBot startup, repair, and role-sync notices land here.'],
  },
},
{
  name: 'mod-log',
  privateToRoleKeys: ['staff', 'moderator'],
  starterMessage: {
    title: 'Moderation log',
    lines: ['Discord AutoMod alerts and staff moderation notes land here.'],
  },
},
```

- [ ] **Step 4: Add required permission helper**

Return named permission labels from a helper used by docs/tests:

```ts
export function buildRequiredBotPermissionBits(): string[] {
  return [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'UseApplicationCommands',
    'ManageChannels',
    'ManageRoles',
    'CreatePublicThreads',
    'CreatePrivateThreads',
    'SendMessagesInThreads',
    'ManageGuild',
  ];
}
```

Do not include `KickMembers` or `BanMembers`.

- [ ] **Step 5: Run tests**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/discordServerSetup.ts apps/api/src/services/discordServerSetup.test.ts
git commit -m "feat(discord): expand launch server setup plan"
```

### Task 2: Add idempotent AutoMod rule planning

**Files:**
- Modify: `apps/api/src/services/discordServerSetup.ts`
- Modify: `apps/api/src/services/discordServerSetup.test.ts`
- Modify: `apps/api/scripts/setup-discord-server.ts`

- [ ] **Step 1: Add AutoMod payload tests**

Add tests for `buildAutoModRules()`:

```ts
const rules = buildAutoModRules({ alertChannelId: 'mod-log-id', extraKeywords: ['gold spam'] });

expect(rules.map((rule) => rule.name)).toEqual(expect.arrayContaining([
  'PocketRealm: spam protection',
  'PocketRealm: mention protection',
  'PocketRealm: preset safety',
  'PocketRealm: private data guard',
]));
expect(rules.every((rule) => rule.actions.some((action) => action.type === 1))).toBe(true);
expect(rules.every((rule) => rule.actions.some((action) => action.type === 2))).toBe(true);
expect(JSON.stringify(rules)).not.toContain('"type":3');
```

`type === 3` is Discord's timeout action and is intentionally excluded from v1.

- [ ] **Step 2: Run setup tests to verify failure**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts
```

Expected: FAIL because AutoMod helpers do not exist.

- [ ] **Step 3: Implement AutoMod rule builder**

Add named constants for the Discord REST values used by the setup script:

```ts
const AutoModEventType = { MessageSend: 1 } as const;
const AutoModTriggerType = {
  Keyword: 1,
  Spam: 3,
  KeywordPreset: 4,
  MentionSpam: 5,
} as const;
const AutoModActionType = {
  BlockMessage: 1,
  SendAlertMessage: 2,
} as const;
```

Build rules:

```ts
export function buildAutoModRules(options: { alertChannelId: string; extraKeywords: string[] }) {
  const alertAction = {
    type: AutoModActionType.SendAlertMessage,
    metadata: { channel_id: options.alertChannelId },
  };

  return [
    {
      name: 'PocketRealm: spam protection',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.Spam,
      actions: [{ type: AutoModActionType.BlockMessage }, alertAction],
      enabled: true,
    },
    {
      name: 'PocketRealm: mention protection',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.MentionSpam,
      trigger_metadata: { mention_total_limit: 8, mention_raid_protection_enabled: true },
      actions: [{ type: AutoModActionType.BlockMessage }, alertAction],
      enabled: true,
    },
    {
      name: 'PocketRealm: preset safety',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.KeywordPreset,
      trigger_metadata: { presets: [1, 2, 3] },
      actions: [{ type: AutoModActionType.BlockMessage }, alertAction],
      enabled: true,
    },
    {
      name: 'PocketRealm: private data guard',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.Keyword,
      trigger_metadata: {
        keyword_filter: [
          'Bearer *',
          'access_token=*',
          'refreshToken=*',
          'password=*',
          ...options.extraKeywords,
        ],
      },
      actions: [{ type: AutoModActionType.BlockMessage }, alertAction],
      enabled: true,
    },
  ];
}
```

- [ ] **Step 4: Add REST client methods**

Add methods to `DiscordRestClient`:

```ts
async getAutoModRules(guildId: string): Promise<DiscordAutoModRule[]> {
  const data = await this.request(`/guilds/${guildId}/auto-moderation/rules`, { method: 'GET' });
  if (!Array.isArray(data)) throw new Error('Discord API returned invalid AutoMod rules payload');
  return data.map(parseAutoModRule);
}

async createAutoModRule(guildId: string, rule: AutoModRuleSpec): Promise<DiscordAutoModRule> {
  return parseAutoModRule(await this.request(`/guilds/${guildId}/auto-moderation/rules`, {
    method: 'POST',
    body: JSON.stringify(rule),
  }));
}

async updateAutoModRule(guildId: string, ruleId: string, rule: AutoModRuleSpec): Promise<DiscordAutoModRule> {
  return parseAutoModRule(await this.request(`/guilds/${guildId}/auto-moderation/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(rule),
  }));
}
```

Pass the guild id as a method parameter for update path construction; do not send unsupported fields to Discord.

- [ ] **Step 5: Wire AutoMod into setup**

After channels exist and `mod-log` id is known:

```ts
const extraKeywords = parseCsvEnv(process.env.DISCORD_AUTOMOD_EXTRA_KEYWORDS);
const autoModRules = buildAutoModRules({ alertChannelId: modLogChannel.id, extraKeywords });
const existingAutoModRules = await client.getAutoModRules(options.guildId);
```

For each planned rule, create it if missing by name; otherwise patch it by id. Store rule names in `result.createdAutoModRules` and `result.updatedAutoModRules`.

- [ ] **Step 6: Print setup outputs**

Update `setup-discord-server.ts` to print:

```text
DISCORD_DUELS_CHANNEL_ID=...
DISCORD_SUPPORT_TRIAGE_CHANNEL_ID=...
DISCORD_BOT_HEALTH_CHANNEL_ID=...
DISCORD_LINKED_ROLE_ID=...
DISCORD_LEVEL_ROLE_MAP=5:...,10:...,20:...,30:...,50:...
```

- [ ] **Step 7: Run tests**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/api/src/services/discordServerSetup.ts apps/api/src/services/discordServerSetup.test.ts apps/api/scripts/setup-discord-server.ts
git commit -m "feat(discord): add automod setup automation"
```

---

## Phase 2: Database State And Shared Title/Search Metadata

### Task 3: Add Discord bot Prisma models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/*_add_discord_bot_state/migration.sql`

- [ ] **Step 1: Add relations**

In `Account`:

```prisma
  discordAccountLinks DiscordAccountLink[]
```

In `Player`:

```prisma
  discordDuelsAsChallenger DiscordDuel[] @relation("DiscordDuelChallenger")
  discordDuelsAsTarget     DiscordDuel[] @relation("DiscordDuelTarget")
  discordDuelsWon          DiscordDuel[] @relation("DiscordDuelWinner")
```

In `SupportTicket`:

```prisma
  discordThread SupportTicketDiscordThread?
```

- [ ] **Step 2: Add models**

Add models near the existing support/social section:

```prisma
model DiscordAccountLink {
  id             String    @id @default(uuid())
  discordUserId  String    @map("discord_user_id") @db.VarChar(32)
  discordGuildId String    @map("discord_guild_id") @db.VarChar(32)
  accountId      String    @map("account_id")
  linkedAt       DateTime  @default(now()) @map("linked_at")
  unlinkedAt     DateTime? @map("unlinked_at")
  roleSyncedAt   DateTime? @map("role_synced_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([discordGuildId, discordUserId])
  @@index([accountId])
  @@index([unlinkedAt, roleSyncedAt])
  @@map("discord_account_links")
}

model DiscordLinkCode {
  id             String    @id @default(uuid())
  discordUserId  String    @map("discord_user_id") @db.VarChar(32)
  discordGuildId String    @map("discord_guild_id") @db.VarChar(32)
  codeHash       String    @unique @map("code_hash") @db.VarChar(64)
  expiresAt      DateTime  @map("expires_at")
  usedAt         DateTime? @map("used_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([discordGuildId, discordUserId, expiresAt])
  @@map("discord_link_codes")
}

model DiscordCommunityProfile {
  id                String    @id @default(uuid())
  discordUserId     String    @map("discord_user_id") @db.VarChar(32)
  discordGuildId    String    @map("discord_guild_id") @db.VarChar(32)
  xp                Int       @default(0)
  level             Int       @default(1)
  dailyXp           Int       @default(0) @map("daily_xp")
  dailyXpDate       DateTime? @map("daily_xp_date") @db.Date
  lastXpGrantedAt   DateTime? @map("last_xp_granted_at")
  lastRoleSyncAt    DateTime? @map("last_role_sync_at")
  excludedFromXp    Boolean   @default(false) @map("excluded_from_xp")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  @@unique([discordGuildId, discordUserId])
  @@index([discordGuildId, level])
  @@map("discord_community_profiles")
}

model DiscordXpEvent {
  id                 String   @id @default(uuid())
  discordUserId      String   @map("discord_user_id") @db.VarChar(32)
  discordGuildId     String   @map("discord_guild_id") @db.VarChar(32)
  channelId          String   @map("channel_id") @db.VarChar(32)
  messageId          String   @map("message_id") @db.VarChar(32)
  messageFingerprint String   @map("message_fingerprint") @db.VarChar(64)
  xp                 Int
  reason             String   @db.VarChar(32)
  createdAt          DateTime @default(now()) @map("created_at")

  @@unique([discordGuildId, messageId])
  @@index([discordGuildId, discordUserId, createdAt])
  @@index([messageFingerprint, createdAt])
  @@map("discord_xp_events")
}

model DiscordDuel {
  id                        String    @id @default(uuid())
  guildId                   String    @map("guild_id") @db.VarChar(32)
  channelId                 String    @map("channel_id") @db.VarChar(32)
  messageId                 String?   @map("message_id") @db.VarChar(32)
  threadId                  String?   @map("thread_id") @db.VarChar(32)
  challengerDiscordUserId   String    @map("challenger_discord_user_id") @db.VarChar(32)
  targetDiscordUserId       String    @map("target_discord_user_id") @db.VarChar(32)
  challengerPlayerId        String    @map("challenger_player_id")
  targetPlayerId            String    @map("target_player_id")
  status                    String    @default("pending") @db.VarChar(24)
  winnerPlayerId            String?   @map("winner_player_id")
  isDraw                    Boolean   @default(false) @map("is_draw")
  combatLog                 Json?     @map("combat_log")
  summary                   Json?
  createdAt                 DateTime  @default(now()) @map("created_at")
  acceptedAt                DateTime? @map("accepted_at")
  completedAt               DateTime? @map("completed_at")
  expiresAt                 DateTime  @map("expires_at")

  challenger Player  @relation("DiscordDuelChallenger", fields: [challengerPlayerId], references: [id], onDelete: Cascade)
  target     Player  @relation("DiscordDuelTarget", fields: [targetPlayerId], references: [id], onDelete: Cascade)
  winner     Player? @relation("DiscordDuelWinner", fields: [winnerPlayerId], references: [id], onDelete: SetNull)

  @@index([guildId, channelId, createdAt])
  @@index([status, expiresAt])
  @@map("discord_duels")
}

model SupportTicketDiscordThread {
  id                       String    @id @default(uuid())
  ticketId                 String    @unique @map("ticket_id")
  guildId                  String    @map("guild_id") @db.VarChar(32)
  triageChannelId          String    @map("triage_channel_id") @db.VarChar(32)
  triageMessageId          String    @map("triage_message_id") @db.VarChar(32)
  threadId                 String?   @map("thread_id") @db.VarChar(32)
  reporterDiscordUserId    String?   @map("reporter_discord_user_id") @db.VarChar(32)
  createdByDiscordUserId   String?   @map("created_by_discord_user_id") @db.VarChar(32)
  status                   String    @default("triage_posted") @db.VarChar(24)
  createdAt                DateTime  @default(now()) @map("created_at")
  archivedAt               DateTime? @map("archived_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([guildId, triageChannelId])
  @@index([threadId])
  @@map("support_ticket_discord_threads")
}

model DiscordBotAuditEvent {
  id                    String   @id @default(uuid())
  guildId               String   @map("guild_id") @db.VarChar(32)
  actorDiscordUserId    String?  @map("actor_discord_user_id") @db.VarChar(32)
  targetDiscordUserId   String?  @map("target_discord_user_id") @db.VarChar(32)
  command               String   @db.VarChar(80)
  status                String   @db.VarChar(24)
  errorCode             String?  @map("error_code") @db.VarChar(64)
  metadata              Json?
  createdAt             DateTime @default(now()) @map("created_at")

  @@index([guildId, createdAt])
  @@index([actorDiscordUserId, createdAt])
  @@map("discord_bot_audit_events")
}
```

- [ ] **Step 3: Generate migration**

```powershell
npm run db:migrate
```

Expected: Prisma creates a migration ending in `_add_discord_bot_state`.

- [ ] **Step 4: Add partial unique indexes**

Edit the generated migration SQL and append:

```sql
CREATE UNIQUE INDEX "discord_account_links_active_discord_unique"
ON "discord_account_links"("discord_guild_id", "discord_user_id")
WHERE "unlinked_at" IS NULL;

CREATE UNIQUE INDEX "discord_account_links_active_account_unique"
ON "discord_account_links"("account_id")
WHERE "unlinked_at" IS NULL;
```

These indexes enforce one active Discord link per guild user and one active Discord link per PocketRealm account. Do not model these as Prisma `@@unique` constraints because nullable `unlinked_at` would not enforce active-link uniqueness correctly.

- [ ] **Step 5: Generate Prisma client**

```powershell
npm run db:generate
```

Expected: Prisma Client generation succeeds.

- [ ] **Step 6: Commit**

```powershell
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(discord): add bot state schema"
```

### Task 4: Add linked title achievement

**Files:**
- Modify: `packages/shared/src/constants/achievementDefinitions.ts`
- Modify: `apps/api/src/services/achievementService.test.ts`

- [ ] **Step 1: Add achievement definition test**

Add a test that verifies:

```ts
const linked = ACHIEVEMENTS_BY_ID.get('discord_linked');
expect(linked).toMatchObject({
  category: 'general',
  titleReward: 'Linked Adventurer',
  threshold: 0,
  tier: 1,
});
```

- [ ] **Step 2: Add definition**

Add this entry at the top of `GENERAL_ACHIEVEMENTS`:

```ts
{
  id: 'discord_linked',
  category: 'general',
  title: 'Linked Adventurer',
  description: 'Link a Discord account to your PocketRealm account.',
  flavorText: 'Your Discord name and PocketRealm account now point at the same adventurer. This title proves the bridge works.',
  titleReward: 'Linked Adventurer',
  threshold: 0,
  tier: 1,
},
```

- [ ] **Step 3: Run shared tests**

```powershell
npm test -w packages/shared
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add packages/shared/src/constants/achievementDefinitions.ts apps/api/src/services/achievementService.test.ts
git commit -m "feat(discord): add linked account title"
```

### Task 5: Extract wiki search metadata to shared

**Files:**
- Create: `packages/shared/src/wiki/wikiNavigation.ts`
- Create: `packages/shared/src/wiki/wikiSearch.ts`
- Create: `packages/shared/src/wiki/wikiSearch.test.ts`
- Modify: `packages/shared/package.json`
- Modify: `apps/web/src/app/wiki/wikiNavigation.ts`

- [ ] **Step 1: Write search tests**

Create `packages/shared/src/wiki/wikiSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { searchWiki } from './wikiSearch';

describe('wikiSearch', () => {
  it('finds pages by title text', () => {
    const results = searchWiki('turn regen');
    expect(results[0]).toMatchObject({
      label: 'Turns & Regeneration',
      href: '/wiki/resources/turns',
    });
  });

  it('finds pages by alias keywords', () => {
    const results = searchWiki('elo rating');
    expect(results.some((result) => result.href === '/wiki/pvp/elo')).toBe(true);
  });

  it('returns deterministic limited results', () => {
    expect(searchWiki('combat', { limit: 3 })).toHaveLength(3);
    expect(searchWiki('combat', { limit: 3 })).toEqual(searchWiki('combat', { limit: 3 }));
  });
});
```

- [ ] **Step 2: Move navigation data**

Move the current `wikiNavigation` array from `apps/web/src/app/wiki/wikiNavigation.ts` to `packages/shared/src/wiki/wikiNavigation.ts`. Add optional metadata:

```ts
export interface WikiNavItem {
  label: string;
  href: string;
  aliases?: string[];
  keywords?: string[];
}
```

Add aliases to the high-value command targets:

```ts
{ label: 'Turns & Regeneration', href: '/wiki/resources/turns', aliases: ['turns', 'regen', 'turn bank'] }
{ label: 'ELO & Matchmaking', href: '/wiki/pvp/elo', aliases: ['elo', 'rating', 'ranked pvp'] }
{ label: 'PvP Combat', href: '/wiki/pvp/combat', aliases: ['duel', 'arena', 'pvp'] }
```

- [ ] **Step 3: Add deterministic search**

Create `packages/shared/src/wiki/wikiSearch.ts`:

```ts
import { wikiNavigation } from './wikiNavigation';

export interface WikiSearchResult {
  label: string;
  section: string;
  href: string;
  snippet: string;
  score: number;
}

export function searchWiki(query: string, options: { limit?: number } = {}): WikiSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: WikiSearchResult[] = [];
  for (const section of wikiNavigation) {
    for (const item of section.items) {
      const haystack = [
        item.label,
        section.label,
        item.href,
        ...(item.aliases ?? []),
        ...(item.keywords ?? []),
      ].join(' ').toLowerCase();

      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) {
        results.push({
          label: item.label,
          section: section.label,
          href: item.href,
          snippet: `${section.label}: ${item.label}`,
          score,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, options.limit ?? 5);
}
```

- [ ] **Step 4: Re-export from web path**

Replace `apps/web/src/app/wiki/wikiNavigation.ts` with:

```ts
export { wikiNavigation } from '@pocketrealm/shared/wiki/wikiNavigation';
export type { WikiNavItem, WikiNavSection } from '@pocketrealm/shared/wiki/wikiNavigation';
```

- [ ] **Step 5: Add package exports**

In `packages/shared/package.json`:

```json
"./wiki/wikiNavigation": {
  "types": "./dist/wiki/wikiNavigation.d.ts",
  "default": "./dist/wiki/wikiNavigation.js"
},
"./wiki/wikiSearch": {
  "types": "./dist/wiki/wikiSearch.d.ts",
  "default": "./dist/wiki/wikiSearch.js"
}
```

- [ ] **Step 6: Run tests and builds**

```powershell
npm test -w packages/shared -- --run src/wiki/wikiSearch.test.ts
npm run build -w packages/shared
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/shared/src/wiki packages/shared/package.json apps/web/src/app/wiki/wikiNavigation.ts
git commit -m "feat(discord): share wiki search metadata"
```

---

## Phase 3: API Boundary For Bot Workflows

### Task 6: Add internal bot authentication middleware

**Files:**
- Create: `apps/api/src/middleware/internalBotAuth.ts`
- Create: `apps/api/src/middleware/internalBotAuth.test.ts`

- [ ] **Step 1: Write middleware tests**

Create tests for:

```ts
expect(() => requireInternalBotAuth(reqWithoutHeader, res, next)).toThrow('Bot API key missing');
expect(next).toHaveBeenCalledOnce();
```

Use `process.env.DISCORD_INTERNAL_API_KEY = 'test-bot-key-that-is-long-enough'`.

- [ ] **Step 2: Implement middleware**

Create `apps/api/src/middleware/internalBotAuth.ts`:

```ts
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function requireInternalBotAuth(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.DISCORD_INTERNAL_API_KEY?.trim();
  if (!expected || expected.length < 32) {
    throw new AppError(500, 'Discord bot API key is not configured', 'BOT_AUTH_NOT_CONFIGURED');
  }

  const provided = req.header('x-pocketrealm-bot-key')?.trim();
  if (!provided || !safeEqual(provided, expected)) {
    throw new AppError(401, 'Bot API key missing or invalid', 'BOT_UNAUTHORIZED');
  }

  next();
}
```

- [ ] **Step 3: Run tests**

```powershell
npm test -w apps/api -- --run src/middleware/internalBotAuth.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/src/middleware/internalBotAuth.ts apps/api/src/middleware/internalBotAuth.test.ts
git commit -m "feat(discord): add internal bot auth"
```

### Task 7: Add account linking service and routes

**Files:**
- Create: `apps/api/src/services/discordSchemas.ts`
- Create: `apps/api/src/services/discordAccountLinkService.ts`
- Create: `apps/api/src/services/discordAccountLinkService.test.ts`
- Create: `apps/api/src/routes/discord.ts`
- Create: `apps/api/src/routes/discord.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write service tests**

Cover:

```ts
await expect(createDiscordLinkCode({ discordUserId: '1', discordGuildId: 'g' }))
  .resolves.toMatchObject({ code: expect.stringMatching(/^[A-Z0-9]{8}$/) });

await expect(claimDiscordLinkCode({
  accountId: 'account-1',
  playerId: 'player-1',
  code: 'ABC12345',
})).resolves.toMatchObject({
  discordUserId: '123',
  discordGuildId: 'guild-1',
  titleAchievementId: 'discord_linked',
});
```

Assert the transaction:

```ts
expect(tx.playerAchievement.upsert).toHaveBeenCalledWith({
  where: { playerId_achievementId: { playerId: 'player-1', achievementId: 'discord_linked' } },
  create: { playerId: 'player-1', achievementId: 'discord_linked' },
  update: {},
});
```

- [ ] **Step 2: Add schemas**

Create `apps/api/src/services/discordSchemas.ts`:

```ts
import { z } from 'zod';

export const discordSnowflakeSchema = z.string().regex(/^\d{16,22}$/);
export const discordGuildLinkSchema = z.object({
  discordUserId: discordSnowflakeSchema,
  discordGuildId: discordSnowflakeSchema,
}).strict();

export const claimDiscordLinkCodeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/),
}).strict();

export const discordDuelCreateSchema = z.object({
  guildId: discordSnowflakeSchema,
  channelId: discordSnowflakeSchema,
  challengerDiscordUserId: discordSnowflakeSchema,
  targetDiscordUserId: discordSnowflakeSchema,
}).strict();
```

- [ ] **Step 3: Implement link service**

Key service functions:

```ts
export async function createDiscordLinkCode(input: { discordUserId: string; discordGuildId: string }) {
  const code = randomLinkCode();
  const codeHash = hashLinkCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.discordLinkCode.create({
    data: { ...input, codeHash, expiresAt },
  });
  return { code, expiresAt };
}

export async function claimDiscordLinkCode(input: { accountId: string; playerId: string; code: string }) {
  const codeHash = hashLinkCode(input.code);
  return prisma.$transaction(async (tx) => {
    const code = await tx.discordLinkCode.findUnique({ where: { codeHash } });
    if (!code || code.usedAt || code.expiresAt <= new Date()) {
      throw new AppError(400, 'Discord link code expired or invalid', 'DISCORD_LINK_CODE_INVALID');
    }

    await assertNoActiveDiscordLinkConflict(tx, code.discordGuildId, code.discordUserId, input.accountId);

    const link = await tx.discordAccountLink.create({
      data: {
        discordGuildId: code.discordGuildId,
        discordUserId: code.discordUserId,
        accountId: input.accountId,
      },
    });
    await tx.discordLinkCode.update({ where: { id: code.id }, data: { usedAt: new Date() } });
    await tx.playerAchievement.upsert({
      where: { playerId_achievementId: { playerId: input.playerId, achievementId: 'discord_linked' } },
      create: { playerId: input.playerId, achievementId: 'discord_linked' },
      update: {},
    });
    return { ...link, titleAchievementId: 'discord_linked' as const };
  });
}
```

- [ ] **Step 4: Add routes**

Create route contract:

```text
POST   /api/v1/discord/link-codes             internal bot auth
POST   /api/v1/discord/link                   player JWT auth
GET    /api/v1/discord/link                   player JWT auth
DELETE /api/v1/discord/link                   player JWT auth
GET    /api/v1/discord/links/unsynced         internal bot auth
POST   /api/v1/discord/links/:id/synced       internal bot auth
```

Mount in `app.ts`:

```ts
import { discordRouter } from './routes/discord';
app.use('/api/v1/discord', discordRouter);
```

- [ ] **Step 5: Run route and service tests**

```powershell
npm test -w apps/api -- --run src/services/discordAccountLinkService.test.ts src/routes/discord.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/discordSchemas.ts apps/api/src/services/discordAccountLinkService.ts apps/api/src/services/discordAccountLinkService.test.ts apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts apps/api/src/app.ts
git commit -m "feat(discord): add account linking api"
```

### Task 8: Add Discord profile, wiki, and support API helpers

**Files:**
- Create: `apps/api/src/services/discordProfileService.ts`
- Create: `apps/api/src/services/discordProfileService.test.ts`
- Create: `apps/api/src/services/wikiSearchService.ts`
- Create: `apps/api/src/services/wikiSearchService.test.ts`
- Create: `apps/api/src/services/discordSupportThreadService.ts`
- Create: `apps/api/src/services/discordSupportThreadService.test.ts`
- Modify: `apps/api/src/services/supportTicketService.ts`
- Modify: `apps/api/src/routes/discord.ts`

- [ ] **Step 1: Write profile/wiki tests**

Assert:

```ts
expect(await getLinkedDiscordProfile({ guildId: 'g', discordUserId: 'u' }))
  .toMatchObject({ username: 'Mira', characterLevel: 12, activeTitle: 'Linked Adventurer' });

expect(await searchWikiForDiscord('forge', 'https://pocketrealm.example'))
  .toMatchObject([{ url: 'https://pocketrealm.example/wiki/items/forge' }]);
```

- [ ] **Step 2: Implement profile service**

Service functions:

```ts
export async function getLinkedDiscordProfile(input: DiscordUserLookup) { /* safe profile fields */ }
export async function getLinkedDiscordTurns(input: DiscordUserLookup) { /* getTurnState(activePlayerId) */ }
export async function getLinkedDiscordSkills(input: DiscordUserLookup) { /* compact top skills */ }
export async function getLinkedDiscordRank(input: DiscordUserLookup & { category: string }) { /* getLeaderboard around linked player */ }
```

Use `DiscordAccountLink` to resolve account, then `account.activePlayerId`. Never return account email, account id, player id, JWT data, or internal UUIDs to Discord responses.

- [ ] **Step 3: Implement wiki API wrapper**

```ts
import { searchWiki } from '@pocketrealm/shared/wiki/wikiSearch';

export function searchWikiForDiscord(query: string, webBaseUrl: string) {
  const base = webBaseUrl.replace(/\/$/, '');
  return searchWiki(query, { limit: 5 }).map((result) => ({
    title: result.label,
    section: result.section,
    snippet: result.snippet,
    url: `${base}${result.href}`,
  }));
}
```

- [ ] **Step 4: Extend support service for linked Discord reports**

Add a service wrapper:

```ts
export async function createDiscordSupportTicket(params: {
  discordGuildId: string;
  discordUserId: string;
  input: CreateSupportTicketInput;
}) {
  const linked = await resolveActiveDiscordLink(params);
  return createSupportTicket({
    accountId: linked.accountId,
    playerId: linked.activePlayerId,
    seasonId: linked.seasonId,
    reporterDisplayName: linked.username,
    realmLabel: linked.realmLabel,
    source: 'discord',
    input: params.input,
  });
}
```

If the user is unlinked, throw `DISCORD_LINK_REQUIRED`.

- [ ] **Step 5: Add Discord support thread helpers**

Implement:

```ts
export async function listUnpostedSupportTicketsForDiscord(limit = 10) { /* discordMessageId null */ }
export async function markSupportTriageMessage(input: { publicId: string; guildId: string; triageChannelId: string; triageMessageId: string }) { /* update ticket + mapping */ }
export async function markSupportThreadCreated(input: { publicId: string; threadId: string; createdByDiscordUserId: string }) { /* update mapping */ }
export async function archiveSupportThread(input: { publicId: string; actorDiscordUserId: string }) { /* archivedAt */ }
```

- [ ] **Step 6: Add route contracts**

Extend `discordRouter`:

```text
GET  /api/v1/discord/users/:discordUserId/profile?guildId=...
GET  /api/v1/discord/users/:discordUserId/turns?guildId=...
GET  /api/v1/discord/users/:discordUserId/skills?guildId=...
GET  /api/v1/discord/users/:discordUserId/rank/:category?guildId=...
GET  /api/v1/discord/wiki/search?q=...
POST /api/v1/discord/reports
GET  /api/v1/discord/support/tickets/unposted
POST /api/v1/discord/support/tickets/:publicId/triage-message
POST /api/v1/discord/support/tickets/:publicId/thread
POST /api/v1/discord/support/tickets/:publicId/archive-thread
```

All routes in this task require internal bot auth.

- [ ] **Step 7: Run tests**

```powershell
npm test -w apps/api -- --run src/services/discordProfileService.test.ts src/services/wikiSearchService.test.ts src/services/discordSupportThreadService.test.ts src/routes/discord.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/api/src/services/discordProfileService.ts apps/api/src/services/discordProfileService.test.ts apps/api/src/services/wikiSearchService.ts apps/api/src/services/wikiSearchService.test.ts apps/api/src/services/discordSupportThreadService.ts apps/api/src/services/discordSupportThreadService.test.ts apps/api/src/services/supportTicketService.ts apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts
git commit -m "feat(discord): add bot-facing support and player api"
```

### Task 9: Add no-mutation Discord duel service

**Files:**
- Create: `apps/api/src/services/discordDuelService.ts`
- Create: `apps/api/src/services/discordDuelService.test.ts`
- Modify: `apps/api/src/routes/discord.ts`

- [ ] **Step 1: Write no-mutation duel tests**

Test that `resolveDiscordDuel`:

```ts
expect(tx.turnBank.updateMany).not.toHaveBeenCalled();
expect(tx.pvpRating.update).not.toHaveBeenCalled();
expect(tx.player.update).not.toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ currentHp: expect.anything() }),
}));
expect(tx.discordDuel.update).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ status: 'completed' }),
}));
```

Also test:

```ts
await expect(createPendingDiscordDuel({ challengerDiscordUserId: '1', targetDiscordUserId: '1' }))
  .rejects.toMatchObject({ code: 'DISCORD_DUEL_SELF_CHALLENGE' });
```

- [ ] **Step 2: Implement duel combatant builder**

Create a helper inside `discordDuelService.ts`:

```ts
async function buildDiscordDuelCombatant(playerId: string, username: string) {
  const combatant = await buildPvpCombatant(playerId, username, false);
  return {
    ...combatant,
    stamina: combatant.maxStamina,
    mana: combatant.maxMana,
    stats: { ...combatant.stats, hp: combatant.stats.maxHp },
  };
}
```

If the existing `buildPvpCombatant(..., false)` omits equipment-based max resource bonuses, add a focused helper in `pvpCombatantBuilder.ts` that uses existing `getResourceState` max values and no writes.

- [ ] **Step 3: Implement pending and resolve functions**

```ts
export async function createPendingDiscordDuel(input: CreateDiscordDuelInput) {
  assertDuelChannel(input.channelId);
  const [challenger, target] = await Promise.all([
    resolveActiveDiscordLink({ guildId: input.guildId, discordUserId: input.challengerDiscordUserId }),
    resolveActiveDiscordLink({ guildId: input.guildId, discordUserId: input.targetDiscordUserId }),
  ]);

  return prisma.discordDuel.create({
    data: {
      guildId: input.guildId,
      channelId: input.channelId,
      challengerDiscordUserId: input.challengerDiscordUserId,
      targetDiscordUserId: input.targetDiscordUserId,
      challengerPlayerId: challenger.activePlayerId,
      targetPlayerId: target.activePlayerId,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    },
  });
}

export async function resolveDiscordDuel(duelId: string, acceptedByDiscordUserId: string) {
  const duel = await loadPendingDuelOrThrow(duelId);
  if (duel.targetDiscordUserId !== acceptedByDiscordUserId) {
    throw new AppError(403, 'Only the challenged player can accept this duel', 'DISCORD_DUEL_NOT_TARGET');
  }

  const [challengerCombatant, targetCombatant] = await Promise.all([
    buildDiscordDuelCombatant(duel.challengerPlayerId, duel.challenger.username),
    buildDiscordDuelCombatant(duel.targetPlayerId, duel.target.username),
  ]);
  const result = runTemplateCombat(challengerCombatant, targetCombatant, { combatMode: 'pvp' });
  const mappedLog = mapTemplateCombatLog(result.log);
  const summary = summarizeDiscordDuel(result, duel);

  return prisma.discordDuel.update({
    where: { id: duel.id },
    data: {
      status: 'completed',
      acceptedAt: new Date(),
      completedAt: new Date(),
      winnerPlayerId: summary.winnerPlayerId,
      isDraw: summary.isDraw,
      combatLog: mappedLog,
      summary,
    },
  });
}
```

- [ ] **Step 4: Add route contracts**

```text
POST /api/v1/discord/duels
POST /api/v1/discord/duels/:duelId/message
POST /api/v1/discord/duels/:duelId/resolve
GET  /api/v1/discord/duels/:duelId/replay?page=1
```

All require internal bot auth.

- [ ] **Step 5: Run tests**

```powershell
npm test -w apps/api -- --run src/services/discordDuelService.test.ts src/routes/discord.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/discordDuelService.ts apps/api/src/services/discordDuelService.test.ts apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts
git commit -m "feat(discord): add no-mutation duel api"
```

---

## Phase 4: Persistent Bot Worker Foundation

### Task 10: Add `apps/discord-bot` workspace app

**Files:**
- Create: `apps/discord-bot/package.json`
- Create: `apps/discord-bot/tsconfig.json`
- Create: `apps/discord-bot/src/config.ts`
- Create: `apps/discord-bot/src/config.test.ts`
- Create: `apps/discord-bot/src/api/pocketRealmApi.ts`
- Create: `apps/discord-bot/src/index.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Create package manifest**

Create `apps/discord-bot/package.json`:

```json
{
  "name": "@pocketrealm/discord-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "clean": "rimraf --glob \"dist\" \"src/**/*.js\" \"src/**/*.js.map\" \"src/**/*.d.ts\" \"src/**/*.d.ts.map\" \"**/*.tsbuildinfo\"",
    "dev": "tsx watch src/index.ts",
    "build": "npm run clean && tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "register-commands": "tsx src/commands/register.ts"
  },
  "dependencies": {
    "@pocketrealm/database": "*",
    "@pocketrealm/shared": "*",
    "discord.js": "^14.0.0",
    "dotenv": "^16.6.1",
    "ioredis": "^5.3.2",
    "pino": "^10.3.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "rimraf": "^6.1.2",
    "tsx": "^4.6.0",
    "typescript": "^5.3.0",
    "vitest": "^4.0.18"
  }
}
```

Run `npm install` after creating the package so `package-lock.json` records the workspace and dependency tree.

- [ ] **Step 2: Create tsconfig**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/database" }
  ]
}
```

- [ ] **Step 3: Update root scripts and references**

Root `package.json`:

```json
"build:discord-bot": "npm run build -w packages/shared && npm run build -w packages/database && npm run build -w apps/discord-bot",
"start:discord-bot": "npm run start -w apps/discord-bot",
"discord:register-commands": "npm run register-commands -w apps/discord-bot"
```

Root `tsconfig.json` references:

```json
{ "path": "./apps/discord-bot" }
```

- [ ] **Step 4: Write config tests**

Create `apps/discord-bot/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBotConfig } from './config';

describe('parseBotConfig', () => {
  it('parses required ids and level role map', () => {
    const config = parseBotConfig({
      DISCORD_BOT_TOKEN: 'token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_GUILD_ID: '123456789012345679',
      POCKETREALM_API_URL: 'https://api.example.test',
      POCKETREALM_WEB_URL: 'https://pocketrealm.example.test',
      DISCORD_INTERNAL_API_KEY: 'x'.repeat(32),
      DISCORD_DUELS_CHANNEL_ID: '123456789012345680',
      DISCORD_SUPPORT_TRIAGE_CHANNEL_ID: '123456789012345681',
      DISCORD_BOT_HEALTH_CHANNEL_ID: '123456789012345682',
      DISCORD_LINKED_ROLE_ID: '123456789012345683',
      DISCORD_LEVEL_ROLE_MAP: '5:123456789012345684,10:123456789012345685',
    });

    expect(config.levelRoles).toEqual(new Map([[5, '123456789012345684'], [10, '123456789012345685']]));
  });
});
```

- [ ] **Step 5: Implement config and API client**

`config.ts` should parse all required env vars and comma-separated ids. `pocketRealmApi.ts` should expose:

```ts
export class PocketRealmApi {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-pocketrealm-bot-key': this.apiKey,
      },
    });
    const json = await res.json().catch(() => null) as T | { error?: { message: string; code: string } } | null;
    if (!res.ok) {
      const error = json && 'error' in json ? json.error : undefined;
      throw new Error(error?.code ?? `HTTP_${res.status}`);
    }
    return json as T;
  }
}
```

- [ ] **Step 6: Implement minimal worker entrypoint**

Create a Discord client with intents:

```ts
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.GuildMembers,
```

On ready, log bot user and post a best-effort health message to `DISCORD_BOT_HEALTH_CHANNEL_ID`.

- [ ] **Step 7: Run install, tests, and build**

```powershell
npm install
npm test -w apps/discord-bot -- --run src/config.test.ts
npm run build:discord-bot
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json tsconfig.json apps/discord-bot
git commit -m "feat(discord): add persistent bot worker"
```

### Task 11: Add command definitions and registration

**Files:**
- Create: `apps/discord-bot/src/commands/definitions.ts`
- Create: `apps/discord-bot/src/commands/register.ts`
- Create: `apps/discord-bot/src/commands/definitions.test.ts`

- [ ] **Step 1: Write command definition tests**

Assert the command set includes:

```ts
expect(commandNames).toEqual(expect.arrayContaining([
  'link',
  'wiki',
  'profile',
  'turns',
  'skills',
  'rank',
  'duel',
  'report',
  'staff',
]));
```

Assert staff subcommands:

```ts
expect(staffSubcommandNames).toEqual(expect.arrayContaining([
  'sync-roles',
  'repair-ticket',
  'sync-ticket',
  'xp-adjust',
  'known-issue',
]));
```

- [ ] **Step 2: Implement definitions**

Use `SlashCommandBuilder` and `toJSON()`. Command details:

```text
/link
/wiki query:string
/profile user:user optional
/turns
/skills
/rank category:string
/duel opponent:user
/report
/staff sync-roles
/staff repair-ticket public_id:string
/staff sync-ticket public_id:string
/staff xp-adjust user:user amount:integer reason:string
/staff known-issue public_id:string
```

- [ ] **Step 3: Implement registration script**

`register.ts`:

```ts
const rest = new REST({ version: '10' }).setToken(config.discordBotToken);
await rest.put(
  Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
  { body: buildCommandDefinitions() },
);
```

Use guild registration for launch so command changes propagate quickly.

- [ ] **Step 4: Run tests**

```powershell
npm test -w apps/discord-bot -- --run src/commands/definitions.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/discord-bot/src/commands
git commit -m "feat(discord): add slash command registration"
```

---

## Phase 5: Linking UX And Core Commands

### Task 12: Add Settings link card

**Files:**
- Create: `apps/web/src/lib/api/discord.ts`
- Create: `apps/web/src/components/support/DiscordLinkCard.tsx`
- Create: `apps/web/src/components/support/DiscordLinkCard.test.tsx`
- Modify: `apps/web/src/lib/api/index.ts`
- Modify: `apps/web/src/components/screens/Settings.tsx`

- [ ] **Step 1: Write card tests**

Test:

```ts
fireEvent.change(screen.getByLabelText(/discord link code/i), { target: { value: 'ABC12345' } });
fireEvent.click(screen.getByRole('button', { name: /link discord/i }));
await waitFor(() => expect(onClaimCode).toHaveBeenCalledWith('ABC12345'));
expect(await screen.findByText(/linked adventurer/i)).toBeTruthy();
```

- [ ] **Step 2: Add web API helpers**

Create:

```ts
export interface DiscordLinkStatusResponse {
  linked: boolean;
  discordUserId?: string;
  discordGuildId?: string;
  linkedAt?: string;
  titleReward?: 'Linked Adventurer';
}

export function getDiscordLinkStatus() {
  return fetchApi<DiscordLinkStatusResponse>('/api/v1/discord/link');
}

export function claimDiscordLinkCode(code: string) {
  return fetchApi<DiscordLinkStatusResponse>('/api/v1/discord/link', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
```

- [ ] **Step 3: Implement `DiscordLinkCard`**

Use existing `PixelCard` styling. Show:

- linked state and `Linked Adventurer` title proof
- 8-character input
- claim button
- error text from API

- [ ] **Step 4: Wire Settings**

Render the card in the account tab below `HelpSupportCard`.

- [ ] **Step 5: Run tests and typecheck**

```powershell
npm test -w apps/web -- --run src/components/support/DiscordLinkCard.test.tsx
npm run typecheck -w apps/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/api/discord.ts apps/web/src/lib/api/index.ts apps/web/src/components/support/DiscordLinkCard.tsx apps/web/src/components/support/DiscordLinkCard.test.tsx apps/web/src/components/screens/Settings.tsx
git commit -m "feat(discord): add account link settings card"
```

### Task 13: Implement `/link` and linked role sync

**Files:**
- Create: `apps/discord-bot/src/interactions/linkCommand.ts`
- Create: `apps/discord-bot/src/discord/roleSync.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`
- Modify: `apps/discord-bot/src/index.ts`

- [ ] **Step 1: Write bot command tests**

Mock `PocketRealmApi.post('/api/v1/discord/link-codes')` and assert `/link` replies ephemeral with:

```text
Enter this code in PocketRealm Settings: ABC12345
```

Also test role sync calls `member.roles.add(config.linkedRoleId)` for unsynced active links.

- [ ] **Step 2: Implement `/link`**

Flow:

```ts
const response = await api.post<LinkCodeResponse>('/api/v1/discord/link-codes', {
  discordUserId: interaction.user.id,
  discordGuildId: interaction.guildId,
});
await interaction.reply({
  ephemeral: true,
  content: `Enter this code in PocketRealm Settings: ${response.code}\nIt expires at ${formatDiscordTimestamp(response.expiresAt)}.`,
});
```

- [ ] **Step 3: Implement role sync loop**

Every 60 seconds:

```ts
const links = await api.get<UnsyncedLinksResponse>(`/api/v1/discord/links/unsynced?guildId=${config.discordGuildId}`);
for (const link of links.links) {
  const member = await guild.members.fetch(link.discordUserId).catch(() => null);
  if (!member) continue;
  await member.roles.add(config.linkedRoleId);
  await api.post(`/api/v1/discord/links/${link.id}/synced`);
}
```

- [ ] **Step 4: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/interactions/linkCommand.test.ts src/discord/roleSync.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/discord-bot/src/interactions apps/discord-bot/src/discord apps/discord-bot/src/index.ts
git commit -m "feat(discord): add link command and role sync"
```

### Task 14: Implement wiki and player commands

**Files:**
- Create: `apps/discord-bot/src/interactions/wikiCommand.ts`
- Create: `apps/discord-bot/src/interactions/playerCommands.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write command tests**

Test that:

- `/wiki forge` returns up to 5 links with absolute URLs.
- `/turns` is ephemeral.
- `/profile @other` uses the selected user's Discord id.
- unlinked profile/turns/skills/rank responses are ephemeral and say to run `/link`.

- [ ] **Step 2: Implement command handlers**

Use API paths from Task 8:

```ts
await api.get(`/api/v1/discord/wiki/search?q=${encodeURIComponent(query)}`);
await api.get(`/api/v1/discord/users/${discordUserId}/profile?guildId=${guildId}`);
await api.get(`/api/v1/discord/users/${discordUserId}/turns?guildId=${guildId}`);
await api.get(`/api/v1/discord/users/${discordUserId}/skills?guildId=${guildId}`);
await api.get(`/api/v1/discord/users/${discordUserId}/rank/${category}?guildId=${guildId}`);
```

Use embeds for profile/rank and compact ephemeral text for turns/skills.

- [ ] **Step 3: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/interactions/wikiCommand.test.ts src/interactions/playerCommands.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/discord-bot/src/interactions/wikiCommand.ts apps/discord-bot/src/interactions/playerCommands.ts apps/discord-bot/src/interactions/interactionRouter.ts
git commit -m "feat(discord): add wiki and player commands"
```

---

## Phase 6: Support Triage Cards And Follow-Up Threads

### Task 15: Post bot-managed support triage cards

**Files:**
- Create: `apps/discord-bot/src/support/triageCards.ts`
- Create: `apps/discord-bot/src/discord/components.ts`
- Modify: `apps/discord-bot/src/index.ts`
- Modify: `apps/api/src/services/discordSupportNotifier.ts`

- [ ] **Step 1: Write triage card tests**

Assert card includes buttons:

```ts
expect(customIds).toEqual(expect.arrayContaining([
  'support:ask_reporter:SUP-1',
  'support:needs_info:SUP-1',
  'support:accepted:SUP-1',
  'support:closed:SUP-1',
]));
```

- [ ] **Step 2: Implement component id helpers**

```ts
export function supportButtonId(action: string, publicId: string): string {
  return `support:${action}:${publicId}`;
}

export function parseSupportButtonId(customId: string) {
  const [scope, action, publicId] = customId.split(':');
  return scope === 'support' && action && publicId ? { action, publicId } : null;
}
```

- [ ] **Step 3: Implement polling poster**

Every 30 seconds:

```ts
const { tickets } = await api.get<UnpostedTicketsResponse>('/api/v1/discord/support/tickets/unposted');
for (const ticket of tickets) {
  const message = await triageChannel.send(buildTriageCard(ticket));
  await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/triage-message`, {
    guildId: config.discordGuildId,
    triageChannelId: config.supportTriageChannelId,
    triageMessageId: message.id,
  });
}
```

Keep `discordSupportNotifier` as webhook fallback while `DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL` remains configured. Bot-managed cards become the preferred path because they support buttons/threads.

- [ ] **Step 4: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/support/triageCards.test.ts src/discord/components.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/discord-bot/src/support apps/discord-bot/src/discord/components.ts apps/discord-bot/src/index.ts apps/api/src/services/discordSupportNotifier.ts
git commit -m "feat(discord): post bot-managed support triage cards"
```

### Task 16: Add support follow-up thread actions

**Files:**
- Create: `apps/discord-bot/src/support/threadActions.ts`
- Modify: `apps/discord-bot/src/support/triageCards.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write button tests**

Test:

- `Ask Reporter` creates one thread and records it.
- second `Ask Reporter` reuses existing thread metadata.
- `Archive Thread` archives the thread and marks mapping archived.
- non-staff users get ephemeral forbidden response.

- [ ] **Step 2: Implement staff guard**

```ts
export function isStaffMember(member: GuildMember, staffRoleIds: Set<string>): boolean {
  return member.roles.cache.some((role) => staffRoleIds.has(role.id));
}
```

- [ ] **Step 3: Implement thread creation**

For `Ask Reporter`:

```ts
const thread = await triageChannel.threads.create({
  name: `${ticket.publicId} follow-up`,
  type: ChannelType.PrivateThread,
  invitable: false,
  reason: `Support follow-up for ${ticket.publicId}`,
});
await thread.members.add(reporterDiscordUserId);
await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/thread`, {
  threadId: thread.id,
  createdByDiscordUserId: interaction.user.id,
});
```

Post an opening message that includes only the ticket public id, sanitized title, and staff-safe instructions. Do not paste raw ticket descriptions into public or semi-public areas.

- [ ] **Step 4: Implement status buttons**

Map buttons:

```text
needs_info -> status needs_info
accepted -> status accepted
rejected -> status rejected
security -> status security
closed -> status closed
```

Call the Discord support API endpoint so ticket state remains canonical in Postgres.

- [ ] **Step 5: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/support/threadActions.test.ts src/support/triageCards.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/discord-bot/src/support apps/discord-bot/src/interactions/interactionRouter.ts
git commit -m "feat(discord): add support follow-up threads"
```

### Task 17: Implement `/report` modal

**Files:**
- Create: `apps/discord-bot/src/interactions/reportCommand.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write `/report` tests**

Assert linked user modal submission calls:

```ts
POST /api/v1/discord/reports
```

Assert unlinked user receives:

```text
Link your PocketRealm account first, or use the in-game report flow.
```

- [ ] **Step 2: Implement modal**

Fields:

```text
title
description
steps
area
privacy
```

Map to existing support schema with `category: 'bug'` by default.

- [ ] **Step 3: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/interactions/reportCommand.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/discord-bot/src/interactions/reportCommand.ts apps/discord-bot/src/interactions/interactionRouter.ts
git commit -m "feat(discord): add linked report command"
```

---

## Phase 7: Discord XP And Level Roles

### Task 18: Add chat XP service

**Files:**
- Create: `apps/discord-bot/src/xp/messageXp.ts`
- Create: `apps/discord-bot/src/xp/messageXp.test.ts`
- Modify: `apps/discord-bot/src/index.ts`

- [ ] **Step 1: Write XP tests**

Test:

```ts
expect(await evaluateXpMessage({ content: 'short' })).toMatchObject({ eligible: false, reason: 'too_short' });
expect(await evaluateXpMessage({ channelId: duelsChannelId })).toMatchObject({ eligible: false, reason: 'ignored_channel' });
expect(await grantXpForMessage(message)).toMatchObject({ xpGranted: 8, newLevel: 2 });
expect(prisma.discordXpEvent.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.not.objectContaining({ content: expect.any(String) }),
}));
```

- [ ] **Step 2: Implement constants**

```ts
const XP_PER_MESSAGE_MIN = 5;
const XP_PER_MESSAGE_MAX = 12;
const XP_COOLDOWN_SECONDS = 90;
const MIN_MESSAGE_LENGTH = 20;
const DAILY_SOFT_CAP = 500;

export function levelForDiscordXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}
```

- [ ] **Step 3: Implement eligibility**

Reject:

- bot users
- DMs
- commands
- configured ignored channels
- support/private/staff channels
- `#duels`
- messages shorter than 20 characters
- cooldown hits in Redis
- repeated near-identical fingerprints within the recent event window
- users with `excludedFromXp`

Store only message id, channel id, user id, guild id, fingerprint, xp, reason, and timestamps.

- [ ] **Step 4: Implement level role sync**

On level increase, add the highest configured level role the user qualifies for and remove lower level roles if desired by config:

```ts
const eligibleLevels = [...config.levelRoles.keys()].filter((level) => profile.level >= level).sort((a, b) => a - b);
const highest = eligibleLevels.at(-1);
if (highest) await member.roles.add(config.levelRoles.get(highest)!);
```

- [ ] **Step 5: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/xp/messageXp.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/discord-bot/src/xp apps/discord-bot/src/index.ts
git commit -m "feat(discord): add community xp"
```

### Task 19: Add staff XP adjustment command

**Files:**
- Create: `apps/discord-bot/src/interactions/staffCommands.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write staff command tests**

Assert:

- non-staff users are rejected ephemerally
- `xp-adjust` creates an audit event
- level roles sync after adjustment

- [ ] **Step 2: Implement staff commands**

Initial v1 behavior:

```text
/staff sync-roles
/staff xp-adjust @user amount reason
```

Ticket staff commands can route to support thread functions from Phase 6.

- [ ] **Step 3: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/interactions/staffCommands.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/discord-bot/src/interactions/staffCommands.ts apps/discord-bot/src/interactions/interactionRouter.ts
git commit -m "feat(discord): add staff xp controls"
```

---

## Phase 8: Friendly Discord Duels

### Task 20: Implement `/duel` interaction flow

**Files:**
- Create: `apps/discord-bot/src/interactions/duelCommand.ts`
- Create: `apps/discord-bot/src/interactions/duelCommand.test.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`

- [ ] **Step 1: Write duel command tests**

Assert:

- command outside `DISCORD_DUELS_CHANNEL_ID` is rejected ephemerally
- self challenge is rejected
- bot users are rejected
- target accept calls `POST /api/v1/discord/duels/:id/resolve`
- non-target button click is rejected
- result message contains `Friendly simulation`

- [ ] **Step 2: Implement command**

Flow:

```ts
if (interaction.channelId !== config.duelsChannelId) {
  return interaction.reply({ ephemeral: true, content: `Use /duel in <#${config.duelsChannelId}>.` });
}

const duel = await api.post<CreateDuelResponse>('/api/v1/discord/duels', {
  guildId: interaction.guildId,
  channelId: interaction.channelId,
  challengerDiscordUserId: interaction.user.id,
  targetDiscordUserId: opponent.id,
});

await interaction.reply({
  content: `<@${opponent.id}>, ${interaction.user} challenged you to a friendly simulation.`,
  components: [acceptDeclineRow(duel.id)],
});
```

- [ ] **Step 3: Implement accept and result formatting**

On accept:

```ts
const result = await api.post<DuelResultResponse>(`/api/v1/discord/duels/${duelId}/resolve`, {
  acceptedByDiscordUserId: interaction.user.id,
});
await interaction.update(buildDuelResultMessage(result));
```

Include buttons:

```text
Show Replay
Show Builds
Rematch
```

- [ ] **Step 4: Implement replay pagination**

Use `GET /api/v1/discord/duels/:duelId/replay?page=N`. For long logs, create or reuse a thread and post pages there. Keep the main `#duels` channel compact.

- [ ] **Step 5: Run tests/build**

```powershell
npm test -w apps/discord-bot -- --run src/interactions/duelCommand.test.ts
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/discord-bot/src/interactions/duelCommand.ts apps/discord-bot/src/interactions/duelCommand.test.ts apps/discord-bot/src/interactions/interactionRouter.ts
git commit -m "feat(discord): add friendly duel command"
```

---

## Phase 9: Deployment, Environment, And Launch Verification

### Task 21: Document worker deployment and env vars

**Files:**
- Create: `apps/discord-bot/.env.example`
- Modify: `apps/api/.env.example`
- Modify: `docs/reference/deployment.md`

- [ ] **Step 1: Add env examples**

`apps/api/.env.example`:

```env
DISCORD_INTERNAL_API_KEY=
DISCORD_AUTOMOD_EXTRA_KEYWORDS=
```

`apps/discord-bot/.env.example`:

```env
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/adventure
REDIS_URL=redis://localhost:6379
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_INTERNAL_API_KEY=
POCKETREALM_API_URL=http://localhost:4000
POCKETREALM_WEB_URL=http://localhost:3002
DISCORD_DUELS_CHANNEL_ID=
DISCORD_SUPPORT_TRIAGE_CHANNEL_ID=
DISCORD_BOT_HEALTH_CHANNEL_ID=
DISCORD_LINKED_ROLE_ID=
DISCORD_LEVEL_ROLE_MAP=
DISCORD_STAFF_ROLE_IDS=
DISCORD_XP_IGNORED_CHANNEL_IDS=
DISCORD_XP_ELIGIBLE_CHANNEL_IDS=
```

- [ ] **Step 2: Update deployment docs**

Add a `Discord Bot Worker (Render)` service:

```md
### Discord Bot Worker (Render)
- Background Worker, Node 20 environment
- Build: `npm install && npm run build:discord-bot`
- Start: `npm run start:discord-bot`
- Required Discord developer portal intents: Server Members Intent, Message Content Intent
- Bot permissions: application commands, view/send/read messages, manage channels, manage roles, create public/private threads, send in threads, manage server for AutoMod setup. Do not grant kick or ban permissions.
```

Add env table rows for API and Discord worker.

- [ ] **Step 3: Add launch runbook**

Document:

```powershell
npm run discord:setup-server
npm run discord:register-commands
```

State that these should run against staging first and that `discord:setup-server` prints channel/role ids for the worker env.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/.env.example apps/discord-bot/.env.example docs/reference/deployment.md
git commit -m "docs(discord): document bot worker deployment"
```

### Task 22: Focused verification

**Files:** none.

- [ ] **Step 1: Run API tests**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts src/services/discordAccountLinkService.test.ts src/services/discordProfileService.test.ts src/services/wikiSearchService.test.ts src/services/discordSupportThreadService.test.ts src/services/discordDuelService.test.ts src/routes/discord.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run bot tests**

```powershell
npm test -w apps/discord-bot
```

Expected: PASS.

- [ ] **Step 3: Run web focused tests**

```powershell
npm test -w apps/web -- --run src/components/support/DiscordLinkCard.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run shared tests**

```powershell
npm test -w packages/shared -- --run src/wiki/wikiSearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck and builds**

```powershell
rtk npm run typecheck
npm run build:api
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 6: Commit verification fixes**

Only if verification required fixes:

```powershell
rtk git status
git add apps/api apps/discord-bot apps/web packages/shared packages/database docs package.json package-lock.json tsconfig.json
git commit -m "fix(discord): address bot verification"
```

### Task 23: Manual staging smoke checks

**Files:** none.

Run these only after the user approves connecting a live staging Discord guild.

- [ ] **Step 1: Run setup against staging**

```powershell
npm run discord:setup-server
```

Expected:

- channels and roles are created or updated idempotently
- AutoMod rules are created or patched
- output includes role/channel ids for worker env

- [ ] **Step 2: Register commands**

```powershell
npm run discord:register-commands
```

Expected: Discord guild command list updates within a few seconds.

- [ ] **Step 3: Start worker for staging smoke**

```powershell
npm run start:discord-bot
```

Expected:

- bot logs in
- health message appears in `#bot-health`
- bot has no kick or ban permissions

- [ ] **Step 4: Verify core flows**

Manual checklist:

- `/link` returns a code; entering it in Settings links account and grants `Linked Adventurer`.
- linked role sync assigns `Linked Account`.
- `/wiki turns` returns a wiki link.
- `/profile`, `/turns`, `/skills`, `/rank` work for linked account and stay private where intended.
- new support report posts a triage card.
- `Ask Reporter` creates a private ticket-linked thread and only staff plus reporter can see it.
- AutoMod blocks the configured staging test spam and mention patterns.
- Discord chat XP increments in eligible channels and ignores `#duels`.
- `/duel` only works in `#duels`, requires target accept, posts compact result, and stores replay without mutating game state.

### Task 24: Final cleanup

**Files:** touched files only.

- [ ] **Step 1: Use simplify skill**

Invoke `superpowers:simplify` and review only the Discord bot implementation diff.

- [ ] **Step 2: Apply focused simplifications**

Keep changes scoped to Discord setup, API routes/services, bot app, linking UI, shared wiki search, docs, and Prisma schema.

- [ ] **Step 3: Re-run focused verification**

```powershell
npm test -w apps/api -- --run src/services/discordServerSetup.test.ts src/services/discordAccountLinkService.test.ts src/services/discordProfileService.test.ts src/services/wikiSearchService.test.ts src/services/discordSupportThreadService.test.ts src/services/discordDuelService.test.ts src/routes/discord.test.ts
npm test -w apps/discord-bot
npm test -w apps/web -- --run src/components/support/DiscordLinkCard.test.tsx
npm test -w packages/shared -- --run src/wiki/wikiSearch.test.ts
rtk npm run typecheck
npm run build:api
npm run build:discord-bot
```

Expected: PASS.

- [ ] **Step 4: Final status**

```powershell
rtk git status
```

Expected: clean working tree after final implementation commits.
