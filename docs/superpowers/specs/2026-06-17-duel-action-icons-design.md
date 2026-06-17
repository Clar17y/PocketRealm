# Duel Replay Action Icons — Design

**Date:** 2026-06-17
**Status:** Approved
**Scope:** `apps/discord-bot` only (renderer-side). No API or DB changes.

## Goal

Prefix every Discord duel replay log line with a single leading icon that
reflects the **outcome** of that action, and append a knockout marker when the
action drops a fighter to 0 HP. This makes the per-round log scannable at a
glance (Codex's idea), building on the existing Components V2 duel cards.

Deliberately **outcome-based only** — no melee/ranged/magic distinction, because
that would require the action's `scalingStat` (known only to the game-engine via
`getActionDefinition`) and thus server-side enrichment of the replay DTO. Out of
scope for now.

## Data source

All classification uses fields already present on each replay entry (confirmed
to pass through `combatLogMapper`/`discordDuelService` unchanged):
`action` (`'attack' | 'spell' | 'defend' | 'counter' | 'ward' | 'potion' |
'cleanse' | 'heal' | 'regen' | …`), `isCritical`, `healAmount`,
`forcedActionReason` (`'pinned'`), `hitChance` / `hitRollValue` (miss
derivation), and `combatantAHpAfter` / `combatantBHpAfter` (KO derivation).

## Behaviour

**Leading icon — first matching rule wins:**

| Condition | Icon (Unicode placeholder) |
|---|---|
| `healAmount` present | 💚 `heal` |
| `action` ∈ {`defend`, `counter`, `ward`} or `forcedActionReason === 'pinned'` | 🛡️ `defend` |
| `action === 'potion'` | 🧪 `potion` |
| `action === 'cleanse'` | 🫧 `cleanse` |
| `isCritical === true` | 💥 `crit` |
| `action === 'attack'` and `hitRollValue >= hitChance` (a miss) | 💨 `miss` |
| `action === 'spell'` | ✨ `spell` |
| otherwise (a normal landed attack) | ⚔️ `attack` |

**Knockout marker:** when `combatantAHpAfter === 0` or `combatantBHpAfter === 0`
on the entry, append ` 💀 ko` after the line text. A critical killing blow
therefore reads `💥 … 💀`.

**Line shape:** `{icon} **#{index}** {existing formatted entry}{ ko?}`.

Redundant regen entries are already filtered before rendering, so they never
reach the classifier.

## Components

- **`duelEmoji.ts`** — add `DuelActionIcons` interface + `DEFAULT_DUEL_ACTION_ICONS`
  map (Unicode defaults). This is the single swap-point: replacing each string
  with a custom `<:name:id>` server emoji is the only change needed when Codex's
  icon set is ready. Mirrors the existing `DEFAULT_DUEL_EMOJI` bar pattern.
- **`duelCard.ts`** — add pure helpers `actionIcon(entry, icons?)` and
  `isKnockout(entry)`; `buildReplayCard` prefixes/suffixes each log line.

## Testing

Unit tests (vitest) for `actionIcon` precedence (each rule + the default), miss
derivation, and `isKnockout`; plus a `buildReplayCard` assertion that a crit
killing-blow line carries both the crit and KO icons. No behaviour change to any
non-replay path.

## Update (2026-06-17): custom art + full taxonomy

Codex delivered a pixel-art emoji pack (`docs/assets/discord-duel-emojis/`),
which is richer than the original outcomes-only set, so the classifier was
expanded (still renderer-only, no API change):

- **Attacks split into `physical` / `magic`** — magic when `action === 'spell'`,
  a `spellName` is present, or `targetMagicDefence` is set without
  `targetDefence`; physical otherwise.
- **Heal split by resource** into `heal_hp` / `heal_sta` / `heal_mp` via
  `healResourceType`.
- **`counter` and `ward` are distinct** from `defend`.

Icon kinds now: physical, magic, crit, miss, heal_hp, heal_sta, heal_mp, defend,
counter, ward, potion, cleanse, ko (matching the asset filenames), plus the
result-card victory/draw icons.

**Custom-emoji pipeline.** Every duel emoji resolves through
`customEmoji(name, fallback)` (duelEmoji.ts): it returns the uploaded
application emoji `<:name:id>` when present in `duelCustomEmoji.ts`, else the
Unicode fallback — so the bot works identically with or without the art
uploaded. `npm run upload-duel-emojis` (src/scripts/uploadDuelEmojis.ts) uploads
the PNG pack as **application-owned** emoji using the bot token + client id,
skips ones already uploaded, and regenerates `duelCustomEmoji.ts` with the
name→id map to commit. Run it locally (the token stays on the operator's
machine); pass the asset dir as an argument when running from a worktree where
`docs/assets/` is absent.
