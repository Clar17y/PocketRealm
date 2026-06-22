# Discord Announcement Rich Text Design

**Date:** 2026-06-20
**Status:** Approved design target
**Branch:** `codex/discord-announcement-rich-text`

## Summary

Improve `/announcement` so staff can paste one changelog-style rich text message and have the bot publish it as a polished Discord Components V2 card instead of raw message content.

The command should stay fast to use: one required `message` option and one optional `everyone` toggle. The improvement is in the bot's formatter. It parses a small markdown subset, preserves changelog formatting and emojis, applies the existing V2 card treatment, and keeps mention handling explicit and safe.

## Goals

- Keep `/announcement` as a single-message staff command.
- Publish announcements as Components V2 cards with no top-level Discord `content`.
- Support changelog-style input with headings, bullets, blank lines, Discord markdown, links, and emojis.
- Use the first top-level heading as the card title when present.
- Preserve readable line breaks instead of collapsing the announcement into a wall of text.
- Keep accidental mentions suppressed by default.
- Preserve the existing `everyone` toggle behavior by allowing only the bot-prepended `@everyone` mention.
- Return clear ephemeral validation errors for empty or oversized announcements.

## Non-Goals

- No modal editor, draft workflow, scheduling, database persistence, attachments, or image upload support.
- No separate structured slash options such as `title`, `body`, `tag`, or `link`.
- No full markdown parser dependency unless the Discord formatting rules become too complex for a small local parser.
- No role-specific or user-specific announcement mentions beyond the explicit `everyone` toggle.
- No automatic import from the web app changelog.

## Staff Input Format

Staff can paste a compact changelog message into the existing `message` slash-command field:

```md
# Weekly Realm Update

## Combat
⚔️ Raid bosses now show threat progress.
- Duel replay damage order is fixed.

## Fixes
🛠️ Inventory sync is faster after crafting and selling.

Read more: https://pocketrealm.app/changelog
```

Supported formatting:

- `# Title` as the optional announcement title.
- `## Section` and `### Section` as bold section headings in the card body.
- `- item`, `* item`, and `• item` bullet lines, normalized to `• item`.
- Blank lines between sections.
- Discord-native inline formatting such as `**bold**`, `_italic_`, inline code, links, and emojis.

Unsupported or passthrough formatting:

- Tables, blockquotes, fenced code blocks, nested lists, and images are not interpreted in v1.
- Unknown markdown should be preserved as text when safe rather than rejected.

## Card Behavior

Add `apps/discord-bot/src/discord/announcementCard.ts` with a focused formatter:

- `buildAnnouncementCard(input, options): V2CardPayload`
- `input.message`: trimmed staff input.
- `input.everyone`: whether the command should notify everyone.
- `options.emojiMap`: existing semantic emoji map.

Rendering rules:

- If the first non-empty line is `# Title`, use `Title` as the card title and remove that line from the body.
- If there is no `# Title`, use `Announcement` as the card title.
- Render the card through the existing Components V2 helper pattern, with an announcement-oriented emoji key or the existing `info` key if no new emoji key is added.
- Preserve one blank line between non-empty sections.
- Normalize bullet prefixes to `•` for visual consistency.
- Convert `##` and `###` headings to bold body lines.
- Keep staff-supplied emojis and Discord markdown intact.
- Apply an announcement accent color through the existing `accentColor` V2 helper option.

Example output text inside the V2 card:

```md
📜 **Weekly Realm Update**

**Combat**
⚔️ Raid bosses now show threat progress.
• Duel replay damage order is fixed.

**Fixes**
🛠️ Inventory sync is faster after crafting and selling.

Read more: https://pocketrealm.app/changelog
```

## Mention Safety

Mention behavior must remain stricter than ordinary Discord messages.

When `everyone` is false:

- Send only the V2 card payload.
- Use `allowedMentions: { parse: [] }`.
- Do not allow user, role, `@here`, or `@everyone` mentions to expand.

When `everyone` is true:

- Prefix the V2 card text with one visible `@everyone` line before the announcement title/body.
- Use `allowedMentions: { parse: ['everyone'] }`.
- Neutralize any staff-supplied `@everyone` or `@here` inside the message body with the existing zero-width-space pattern.
- Do not expand role or user mentions from the body.

## Validation And Limits

Validation should happen before fetching or sending to the announcement channel where possible.

- Reject whitespace-only input ephemerally.
- Normalize CRLF and CR newlines to LF.
- Trim surrounding whitespace while preserving intentional internal blank lines.
- Enforce a conservative final text length limit below Discord's V2 text-display limit.
- If the parsed title is empty after removing `#`, fall back to `Announcement`.
- If the body is empty after extracting the title, allow a title-only card only when the original message had a meaningful title.
- If the final card would exceed the limit, respond ephemerally with a message asking staff to shorten the announcement.

## Command Flow

`apps/discord-bot/src/interactions/announcementCommand.ts` remains the orchestration point:

1. Validate guild usage.
2. Validate support staff configuration.
3. Validate the invoker is staff.
4. Read and trim `message`.
5. Read `everyone`.
6. Build the announcement card payload.
7. Defer ephemerally.
8. Fetch the configured announcement channel.
9. Send the V2 payload.
10. Edit the ephemeral reply with the posted-channel confirmation.

This preserves the existing permission model, configuration, and public/private response behavior.

## Implementation Boundary

Expected bot package changes:

- Modify `apps/discord-bot/src/interactions/announcementCommand.ts` to use the new card builder.
- Add `apps/discord-bot/src/discord/announcementCard.ts`.
- Add `apps/discord-bot/src/discord/announcementCard.test.ts`.
- Update `apps/discord-bot/src/interactions/announcementCommand.test.ts` to assert V2 payloads instead of raw `content`.
- Optionally add an `announcement` semantic emoji key in `apps/discord-bot/src/discord/emojis.ts`; otherwise use `info`.

No API, database, shared package, or web app changes are required.

## Testing Requirements

Focused tests:

- Rich changelog input preserves title, sections, blank lines, bullets, emojis, links, and Discord markdown.
- Missing title falls back to `Announcement`.
- Empty or whitespace-only input is rejected before channel fetch.
- Oversized formatted output is rejected ephemerally.
- Default announcement sends a Components V2 payload with no top-level `content` and `allowedMentions: { parse: [] }`.
- `everyone: true` allows only `parse: ['everyone']`, includes one intentional `@everyone`, and neutralizes body-level `@everyone` and `@here`.
- Existing permission, channel unavailable, send failure, and success confirmation behavior remains intact.

Verification commands:

```powershell
cd apps/discord-bot
npm test -- announcementCard announcementCommand
npm run build
```

Broader verification before handoff:

```powershell
rtk npm run test -w apps/discord-bot
rtk npm run build:discord-bot
git diff --check
```

## Acceptance Criteria

- Staff can paste a changelog-style message into `/announcement message`.
- The public announcement renders as a readable Components V2 card.
- Newlines, section headings, bullets, emojis, and inline Discord markdown survive formatting.
- Public announcements send no top-level raw `content`; the explicit `@everyone` line is rendered inside the V2 card text.
- Accidental body mentions do not ping users, roles, `@here`, or `@everyone`.
- The existing staff-only permission checks and ephemeral confirmations remain unchanged.
