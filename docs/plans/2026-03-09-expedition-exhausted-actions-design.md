# Expedition Exhausted Actions Design

## Goal

Make expedition round logs explain when a participant fails to execute their intended action because they lack the required stamina or mana, while also fixing the broken round-log helper module path that currently causes the web build to fail.

## Current State

The raid resolver preserves `wasExhausted` in `participantResults`, but the round log only stores executed attack, heal, and mob-action entries. If a player or bot falls back to `Defend` because they cannot afford an intended action like `counter`, `ward`, or `aimed shot`, that intent is lost before the round log is built. In the UI this looks like the participant simply did nothing offensive, which makes the log hard to interpret.

Separately, the web round-log helper currently exists only as `guildExpeditionRoundLog.tsx` while imports target `./guildExpeditionRoundLog`, and Next’s build pipeline is attempting to resolve a missing `guildExpeditionRoundLog.ts`.

## Design

Add explicit exhausted-action log entries into the existing round-log `Attacks` section.

Each exhausted entry should preserve:

- actor identity
- intended action id and label
- fallback action id and label (`Defend`)
- exhaustion reason: `stamina`, `mana`, `stamina_and_mana`, or `invalid_action`

The log line should read like:

- `BotName: aimed shot → Defend (Exhausted: stamina)`
- `TankBot: counter → Defend (Exhausted: mana)`

This should live in the same `Attacks` section as normal actions so players can answer “why did they not act?” in the exact place they already inspect.

## Data Flow

Preserve the intended action during action resolution in the game engine. When the resolver falls back to `Defend`, emit an exhausted-action log entry while still keeping `participantResults.wasExhausted` intact for downstream systems.

Extend the shared expedition round-log types so `phases.playerAttacks` can contain either a normal attack entry or an exhausted-action entry. Update the web round-log helper to render both shapes from the same action list.

## Build Fix

Normalize the round-log helper module path so `./guildExpeditionRoundLog` resolves cleanly in both test and Next build environments. The safest approach is:

- move the JSX renderer into a dedicated `.tsx` view file
- add a `.ts` module at `guildExpeditionRoundLog.ts` that re-exports the renderer and types from the JSX file

This gives Next the `.ts` source it is currently looking for without changing consumer import paths.

## Testing

Add:

- a game-engine regression test proving an unaffordable action logs the intended action plus the exhausted fallback
- a web renderer test proving exhausted entries appear in the `Attacks` section text
- a web build verification run to confirm the missing helper-module error is gone
