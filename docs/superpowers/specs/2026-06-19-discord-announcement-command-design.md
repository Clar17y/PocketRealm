# Discord Announcement Command Design

## Overview

Add a dedicated `/announcement` slash command to PocketRealmBot so authorized staff can publish announcements through the bot into one configured Discord channel.

The command is intentionally narrow: it posts one text announcement to `DISCORD_ANNOUNCEMENT_CHANNEL_ID` and optionally includes `@everyone` when the invoker explicitly enables the command toggle.

## Goals

- Register `/announcement` as a top-level slash command.
- Send every announcement to the channel configured by `DISCORD_ANNOUNCEMENT_CHANNEL_ID`.
- Let staff include `@everyone` through an optional boolean command option.
- Keep confirmation and errors ephemeral so command usage does not clutter public channels.
- Prevent accidental mention expansion when the `everyone` option is false.

## Non-Goals

- No scheduling, drafts, rich embed builder, attachments, or preview/confirm flow in this version.
- No per-channel destination option.
- No API or database persistence for announcement history.
- No support for role-specific mentions beyond the explicit `@everyone` toggle.

## Command Shape

`/announcement`

Options:

- `message`: required string, the announcement body to publish.
- `everyone`: optional boolean, defaults to false. When true, the bot prepends `@everyone` to the announcement and permits Discord to parse the everyone mention.

The command should use Discord's default member permission gate for `ManageGuild`, matching the existing staff command posture, and should also enforce the existing runtime staff-role check using `supportStaffRoleIds`.

## Configuration

Add `DISCORD_ANNOUNCEMENT_CHANNEL_ID` to the bot configuration. The value is required for the announcement command to publish.

The command handler should fetch this channel by id through the Discord client. If the channel cannot be fetched or is not sendable, the handler should respond ephemerally with a configuration/unavailable message and should not attempt a fallback channel.

## Message Behavior

When `everyone` is false:

- Send exactly the normalized announcement body.
- Use `allowedMentions: { parse: [] }` so user-supplied `@everyone`, role, or user mentions do not expand.

When `everyone` is true:

- Send `@everyone`, a blank line, then the normalized announcement body.
- Use `allowedMentions: { parse: ['everyone'] }`.

The handler should trim surrounding whitespace from the message before sending. Empty or whitespace-only messages should be rejected ephemerally before any channel send.

## Error Handling

- If the command is used outside a guild, reply ephemerally that it only works in the PocketRealm Discord server.
- If staff roles are not configured, reply ephemerally that announcement commands are not configured.
- If the invoker lacks a configured staff role, reply ephemerally that only support staff can send announcements.
- If the announcement channel is missing, unavailable, or not sendable, reply ephemerally that the announcement channel is unavailable.
- If Discord rejects the send, reply ephemerally that the announcement could not be sent and to check bot logs.
- On success, reply ephemerally that the announcement was posted.

## Implementation Plan Boundary

Implementation should stay in the Discord bot package:

- Extend `apps/discord-bot/src/config.ts` and its tests for `DISCORD_ANNOUNCEMENT_CHANNEL_ID`.
- Extend `apps/discord-bot/src/commands/definitions.ts` and its tests for `/announcement`.
- Add `apps/discord-bot/src/interactions/announcementCommand.ts` plus focused tests.
- Route the new command from `apps/discord-bot/src/interactions/interactionRouter.ts` and update router tests.

## Verification

Focused verification:

- `npm run test -w apps/discord-bot`
- `npm run build:discord-bot`

The first implementation test should be written before production code and should fail for the missing `/announcement` command or handler behavior.
