# Expedition Round Log Targets Design

## Goal

Show the target mob for other players and bots in the expedition round log so officers can understand who the party is focusing without losing the richer detail shown for the current player.

## Current State

`PlayerAttackEntry` already includes `targetMobName`, and the current player row in the expedition log already renders it. The compact rows used for everyone else omit that field, so logs like `SinStalker: aimed shot → HIT 8 dmg` hide who was attacked even though the data is available.

## Design

Keep the current-player row exactly as-is:

- action name
- target mob
- roll breakdown
- hit/crit state
- damage

Update only the compact non-player rows to include the target mob inline when `targetMobName` is present. The intended format is:

`SinStalker: aimed shot → Crystal Golem | HIT 8 dmg`

If the target name is missing, keep the current fallback behavior so the UI remains resilient to incomplete log entries.

## Data Flow

No API or shared-type changes are required. The data already flows from the expedition service into `PlayerAttackEntry.targetMobName`; this change is purely a rendering update in the guild expedition round log component.

## Testing

Add a focused web test around the round log renderer that proves:

- non-player rows include the target mob name when available
- the current-player row still renders the existing detailed format
- rows without a target name still render safely
