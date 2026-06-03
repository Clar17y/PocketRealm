# Persistent Discord Bot And Community Platform Design

## Overview

PocketRealmBot becomes a persistent public-launch Discord bot, deployed as its own long-running worker. It extends the existing Discord server setup and support-triage work into a full community companion without turning Discord into a replacement for the game site.

The bot owns PocketRealm-specific workflows: account linking, wiki lookup, support tickets, support follow-up threads, player commands, friendly duel simulations, Discord community XP, role sync, known issues, and staff workflow buttons. Discord AutoMod owns baseline enforcement. Human moderators own judgment-heavy actions.

## Existing Context

The current worktree already includes:

- `apps/api/scripts/setup-discord-server.ts` for one-shot Discord server setup.
- `apps/api/src/services/discordServerSetup.ts` for roles, channels, starter messages, and support webhook creation.
- `apps/api/src/services/discordSupportNotifier.ts` for webhook-based private support triage notifications.
- `SupportTicket` and `SupportTicketEvent` storage, export, redaction, admin triage, and `discordMessageId` support.
- A code-backed static wiki under `apps/web/src/app/wiki`.
- Pure template combat in `packages/game-engine`, PvP combatant builders, and friendly spar behavior in `apps/api/src/services/sparService.ts`.

This design keeps PocketRealm as the source of truth for accounts, support tickets, player data, combat simulation, and game state.

## Goals

- Run PocketRealmBot continuously for public launch with durable state across restarts.
- Keep moderation duties segregated: AutoMod blocks common abuse, moderators handle judgment, PocketRealmBot handles community/game workflows.
- Support account linking between Discord users and PocketRealm accounts.
- Grant a basic cosmetic in-game title when linking succeeds.
- Provide player-facing commands for wiki lookup, profile, turns, skills, rank, and friendly duels.
- Add Discord community XP and level roles as separate Discord-only progression.
- Create ticket-linked private Discord support threads when staff need follow-up from a reporter.
- Keep GitHub and public known issues sanitized and staff-approved.
- Make setup idempotent so roles, channels, permissions, starter messages, AutoMod rules, and bot-managed role mappings can be repaired.

## Non-Goals

- PocketRealmBot does not kick, ban, or act as the sole moderation system in v1.
- Discord XP does not grant gameplay power, turns, gold, items, game XP, or combat advantages.
- Friendly Discord duels do not mutate HP, resources, durability, PvP rating, achievements, quests, rewards, or cooldowns.
- No live turn-by-turn combat choices in Discord v1. Duels use each player's current in-game combat template.
- No automatic inference of "helpful answers" in v1. Helpfulness bonuses can come later from explicit staff/user signals.
- No always-on LLM moderation or AI wiki answer generation in v1.
- No automatic GitHub issue creation without staff approval.

## Duty Split

### Discord AutoMod

AutoMod is the first-line launch protection:

- block obvious spam and repeated text
- block mention raids
- block configured slurs, explicit terms, and banned phrases
- block or alert on suspicious links
- alert staff in `#mod-log` or a configured moderation channel
- optionally timeout for clear spam or mention-raid rules

### Human Moderators

Moderators handle:

- warnings, mutes/timeouts beyond AutoMod, kicks, bans, and appeals
- context-sensitive harassment or abuse decisions
- support escalation and private follow-up decisions
- publishing known issues and GitHub issue updates

### PocketRealmBot

PocketRealmBot handles:

- `/link`
- `/wiki`
- `/profile`, `/turns`, `/skills`, `/rank`
- `/duel`
- `/report`
- support triage cards, support follow-up threads, and staff buttons
- known-issue publishing workflow
- Discord XP and level-role sync
- leaderboard/crown announcements
- bot health and repair commands

PocketRealmBot v1 should not have Discord kick or ban permissions.

## Runtime Architecture

Add `apps/discord-bot` as a separate TypeScript workspace app.

Recommended runtime:

- `discord.js` for Gateway events, slash commands, buttons, modals, and threads.
- Render worker/service for the persistent bot process.
- Existing Render web service continues running the Express API.
- Existing Vercel web app continues serving the site/wiki.
- Postgres stores durable bot state.
- Redis stores cooldowns, rate limits, and short-lived interaction state.

Primary flow:

```text
Discord interaction
  -> PocketRealmBot
  -> PocketRealm API or shared API service
  -> Postgres
  -> PocketRealmBot updates Discord response/message/thread
```

The API remains the canonical boundary for account linking, player data, support tickets, and combat simulations. The bot may use direct database reads only for narrow bot-owned state such as XP cooldown audit data; game account behavior should go through API services or internal API endpoints.

## Setup Automation

Extend the existing `discord:setup-server` path so it remains idempotent and can create/update:

- roles: staff, moderator, support triage, linked account, level roles, tester/founder roles
- channel categories and permissions
- starter messages
- support triage webhook or bot-owned triage posting channel
- AutoMod rules
- managed command channel restrictions
- `#duels`
- `#bot-health`
- `#support-triage`
- support follow-up thread permissions

The setup command should never require committing secrets. Tokens, guild IDs, client IDs, webhook URLs, and internal API keys live in environment variables.

## V1 Commands

### `/link`

Creates a short-lived link code. The user enters the code in PocketRealm settings. The API validates it, stores the link, grants the Discord-linked title to the active player, and the bot assigns the `Linked Account` role.

Initial title:

- achievement ID: `discord_linked`
- title reward: `Linked Adventurer`
- tier: low/basic

For v1, the title is granted to the active player at link time. If the account later changes active character or joins a new seasonal realm, the API should lazily grant the title to that active player when a linked-account command or settings page notices the account is linked.

### `/wiki query`

Searches wiki navigation titles, aliases, and keywords. V1 returns links and short snippets, not AI-generated answers. This keeps answers grounded in the code-backed static wiki and avoids hallucinated mechanics.

### `/profile`

Shows the linked user's active character summary:

- character name
- realm label
- character level
- active title
- guild, if public/safe
- primary combat style or broad build summary

### `/turns`

Shows current turns, cap, and regen estimate for the linked active character. Responses should be ephemeral by default, with an explicit public option later if needed.

### `/skills`

Shows a compact skill summary for the linked active character.

### `/rank category`

Shows the linked active character's rank in a chosen public leaderboard category.

### `/duel @user`

Runs a public friendly simulation in `#duels`.

Rules:

- command only works in `#duels`
- both users must have linked accounts
- target must click accept
- uses each user's active player, current equipment, skills, skill tree, combat template, and balance formulas
- no turn cost
- no PvP rating change
- no HP, stamina, mana, or durability mutation
- no achievements, quests, rewards, or cooldown changes
- result and replay are labeled as a friendly simulation
- per-user and per-channel cooldowns prevent spam
- `#duels` gives no XP or reduced XP to prevent farming

Result message:

- winner or draw
- final HP/resources summary
- short "why it happened" highlights
- buttons for `Show Replay`, `Show Builds`, and `Rematch`

Replay should be compact and paginated or placed in a thread. The bot should avoid dumping long combat logs into the main channel.

### `/report`

Starts a Discord-side support report flow for users outside the game. Linked users get account context attached. Unlinked users are encouraged to link or use the in-game report flow.

### Staff Commands

Staff-only commands:

- `/staff sync-roles`
- `/staff repair-ticket SUP-123`
- `/staff sync-ticket SUP-123`
- `/staff xp-adjust @user amount reason`
- `/staff known-issue publish SUP-123`

## Support Triage And Follow-Up Threads

Canonical support state stays in PocketRealm.

Flow:

```text
In-game report or /report
  -> API creates SupportTicket
  -> bot posts private card in #support-triage
  -> staff clicks Ask Reporter
  -> bot creates ticket-specific private Discord thread
  -> reporter and staff discuss details
  -> staff updates ticket status through buttons/API
  -> bot updates triage card and thread status
```

Rules:

- every support thread is tied to a `SupportTicket`
- linked reporters can be added automatically
- unlinked reporters are asked to link or use in-game reporting before private follow-up
- support threads are staff-triggered, not user-spammable
- thread messages are support correspondence, not public chat
- transcript snippets or staff summaries may be added to the ticket
- raw transcripts are not dumped into GitHub or public known issues
- security, payment, account, harassment, exploit, and personal-data reports stay private
- threads are archived when tickets close

Triage buttons:

- `Ask Reporter`
- `Needs Info`
- `Mark Duplicate`
- `Link GitHub Issue`
- `Create GitHub Draft`
- `Accept`
- `Reject`
- `Publish Known Issue`
- `Escalate Security`
- `Close`
- `Archive Thread`

## Discord Community XP

Discord XP is separate community progression.

V1 source:

- normal chat activity in eligible public community channels

Anti-farming rules:

- cooldown per user, for example 60 to 120 seconds
- minimum message length
- no XP for bot commands
- no XP in staff/private/support channels
- no or reduced XP in `#duels`
- no XP for repeated near-identical messages
- daily soft cap or diminishing returns
- ignore bot users
- staff/admin controls for XP removal or user exclusion

Rewards:

- Discord level roles/flair
- no gameplay power
- later cosmetic in-game title eligibility can be added for linked users only

Helpful-answer XP is a later explicit-recognition feature, using signals such as staff reaction, `/thanks @user`, solved help threads, or moderator bonus XP.

## Data Model

### `DiscordAccountLink`

- `id`
- `discordUserId`
- `discordGuildId`
- `accountId`
- `linkedAt`
- `unlinkedAt`
- `createdAt`
- `updatedAt`

Constraints:

- one active link per Discord user per guild
- one active Discord link per PocketRealm account

### `DiscordLinkCode`

- `id`
- `discordUserId`
- `discordGuildId`
- `codeHash`
- `expiresAt`
- `usedAt`
- `createdAt`

The plaintext code is only shown once in Discord and is stored hashed.

### `DiscordCommunityProfile`

- `id`
- `discordUserId`
- `discordGuildId`
- `xp`
- `level`
- `dailyXp`
- `dailyXpDate`
- `lastXpGrantedAt`
- `lastRoleSyncAt`
- `createdAt`
- `updatedAt`

### `DiscordXpEvent`

- `id`
- `discordUserId`
- `discordGuildId`
- `channelId`
- `messageId`
- `messageFingerprint`
- `xp`
- `reason`
- `createdAt`

Do not store full message content for XP. Store only references and fingerprints needed for audit and anti-farming.

### `DiscordDuel`

- `id`
- `guildId`
- `channelId`
- `messageId`
- `threadId`
- `challengerDiscordUserId`
- `targetDiscordUserId`
- `challengerPlayerId`
- `targetPlayerId`
- `status`
- `winnerPlayerId`
- `isDraw`
- `combatLog`
- `summary`
- `createdAt`
- `acceptedAt`
- `completedAt`
- `expiresAt`

### `SupportTicketDiscordThread`

- `id`
- `ticketId`
- `guildId`
- `triageChannelId`
- `triageMessageId`
- `threadId`
- `reporterDiscordUserId`
- `createdByDiscordUserId`
- `status`
- `createdAt`
- `archivedAt`

### `DiscordBotAuditEvent`

- `id`
- `guildId`
- `actorDiscordUserId`
- `targetDiscordUserId`
- `command`
- `status`
- `errorCode`
- `metadata`
- `createdAt`

## Error Handling

- If Discord is down, in-game support tickets still save in Postgres.
- If the API is down, bot commands reply with a temporary failure message.
- If the bot restarts, links, XP, ticket mappings, duel logs, and thread state are rebuilt from Postgres.
- If Discord message or thread updates fail, the API state remains canonical and the bot logs a repair action.
- Expired link codes require rerunning `/link`.
- Failed role sync is retried and logged to `#bot-health`.
- Failed duel simulations do not create partial game mutations because duels are no-mutation API operations.

## Security And Privacy

- Rotate any bot token that was used in local setup before deploying the persistent bot.
- Store Discord tokens, webhook URLs, client IDs, guild IDs, and internal API keys in Render environment variables.
- Use a dedicated internal API authentication mechanism for bot-to-API calls.
- Grant the bot minimum Discord permissions.
- Do not give PocketRealmBot kick or ban permissions in v1.
- Do not expose internal account IDs, player UUIDs, emails, auth tokens, payment data, or raw support transcripts in public Discord.
- Keep support-thread data private and staff-gated.
- Sanitize known-issue and GitHub issue text before publishing.

## Testing And Verification

Unit tests:

- link code creation, hashing, expiry, one-time use
- account-link uniqueness and relink behavior
- Discord-linked title grant
- wiki search indexing and result formatting
- Discord XP cooldowns, caps, duplicate-message checks, and ignored channels
- duel validation, accept expiry, and no-mutation simulation path
- support thread creation rules and ticket linkage
- AutoMod plan generation payloads
- bot command permission checks

Integration tests:

- `/link` through API validation and role sync stubs
- support ticket creation to triage card/thread metadata
- staff button updates ticket state
- duel command creates a result using current player combat data without mutating turns/resources/rating
- setup script remains idempotent

Manual launch checks:

- AutoMod rules block the intended abuse patterns in a staging/test server
- bot cannot kick or ban
- `#duels` channel restriction works
- support thread privacy works for staff and reporter
- bot restart preserves links, XP, duel records, and support mappings
- bot health logs are visible

## V1 Implementation Work Packages

These work packages are all part of the persistent-bot v1 scope. They can be built sequentially, but public launch should not treat the bot as complete until the moderation baseline, linking, support, XP, and `#duels` pieces are ready.

### 1. Server Setup And AutoMod Baseline

- Extend setup plan to create/update baseline AutoMod rules.
- Create `#duels`, `#bot-health`, `#support-triage`, level roles, and bot-managed permissions.
- Document what AutoMod enforces versus what moderators handle.

### 2. Persistent Bot Foundation

- Add `apps/discord-bot`.
- Add bot env vars and Render worker deployment docs.
- Register slash commands.
- Add bot health logging.
- Keep setup script idempotent.

### 3. Account Linking And Title

- Add link tables and API endpoints.
- Add Settings link-code entry.
- Grant `Linked Adventurer` title.
- Sync `Linked Account` role.

### 4. Community Commands

- Add `/wiki`, `/profile`, `/turns`, `/skills`, and `/rank`.
- Keep sensitive responses ephemeral by default.

### 5. Support Threads

- Replace or augment webhook-only triage with bot-managed triage cards.
- Add staff buttons and ticket-linked follow-up threads.
- Archive threads on close.

### 6. Discord XP

- Add chat XP event handling.
- Add cooldowns, caps, ignored channels, and level role sync.
- Add staff repair/adjust commands.

### 7. Friendly Duels

- Add no-mutation duel simulation API service.
- Add `/duel` interaction flow in `#duels`.
- Add compact replay and rematch controls.

## References

- Discord Interactions and commands: https://docs.discord.com/developers/platform/interactions
- Discord Gateway: https://docs.discord.com/developers/topics/gateway
- Discord Auto Moderation API: https://docs.discord.com/developers/resources/auto-moderation
- Discord AutoMod FAQ: https://support.discord.com/hc/en-us/articles/4421269296535-AutoMod-FAQ
