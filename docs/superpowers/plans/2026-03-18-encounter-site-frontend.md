# Encounter Site Frontend Rework — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential 1v1 encounter site combat UI with an expedition-style combat view for a solo player, extracting shared components from `GuildExpeditionsTab` so both features compose from the same building blocks.

**Architecture:** Extract 10 shared combat UI components from `GuildExpeditionsTab` (1882 lines) into `apps/web/src/components/common/combat/` (HpBar, EffectPill, RoomProgressBar, MobCardGrid, RoundLogContent, CombatRoundLog, ThreatMeter, PlayerResourceBars, CombatActionButtons, TemplateQuickSwitch — plus RoundLogAttackRow move and combatHelpers utility). `HealTargetSelector` extraction deferred — expedition-only with no second consumer yet. Build `EncounterSiteCombatView` composing these components with a 4-state machine (room_preview → auto_playback/manual_combat → room_result). Add backend support for `activeEncounterSiteId` lockout and per-round snapshots in auto-resolve responses.

**Tech Stack:** TypeScript, React, Next.js, Prisma 6, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-03-18-encounter-site-rework-frontend-design.md`
**Backend plan:** `docs/loop-balance/plans/08-encounter-site-rework.md`
**Backend spec:** `docs/superpowers/specs/2026-03-14-encounter-site-rework-design.md`

**Prerequisite:** The backend plan (Chunks 1–5) must be completed first. This plan builds the frontend on top of those backend changes.

---

## Chunk 1: Backend Additions (Frontend Prerequisites)

These tasks add backend capabilities required by the frontend spec that aren't covered by the existing backend plan.

### Task 1: Add activeEncounterSiteId to Player Model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add field to Player model**

In the `Player` model (find with `model Player`), add:

```prisma
activeEncounterSiteId String? @map("active_encounter_site_id")
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:migrate -- --name add-active-encounter-site-id`

- [ ] **Step 3: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client regenerated

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add activeEncounterSiteId to Player model for encounter lockout"
```

### Task 2: Include activeEncounterSiteId in Player State Response

**Files:**
- Modify: `apps/api/src/services/playerService.ts` (or wherever `getPlayerState`/`buildPlayerResponse` lives)

- [ ] **Step 1: Find the player state builder**

Search for where `isKnockedOut` and `isOverencumbered` are included in player state responses. This is the function that builds the standard player state object returned by most endpoints.

Run: `grep -rn "isOverencumbered" apps/api/src/`

- [ ] **Step 2: Add activeEncounterSiteId to the response**

In the same builder function, add:

```typescript
activeEncounterSiteId: player.activeEncounterSiteId ?? null,
```

- [ ] **Step 3: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: include activeEncounterSiteId in player state response"
```

### Task 3: Set/Clear activeEncounterSiteId in Combat Service

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts` (created by backend plan Task 11)

- [ ] **Step 1: Set lockout on room start and auto-resolve**

In both `autoResolveEncounterRoom` and `startManualEncounterRoom`, within the DB transaction, add:

```typescript
await tx.player.update({
  where: { id: playerId },
  data: { activeEncounterSiteId: siteId },
});
```

- [ ] **Step 2: Clear lockout on room clear, defeat, and abandon**

In all paths that end combat (room cleared → site done, defeat, abandon), add:

```typescript
await tx.player.update({
  where: { id: playerId },
  data: { activeEncounterSiteId: null },
});
```

For room clear where more rooms remain, keep the lockout active (player is still in combat).

- [ ] **Step 3: Add lockout validation to other action endpoints**

In the exploration, crafting, arena, and expedition signup routes, add a check:

```typescript
if (player.activeEncounterSiteId) {
  throw new AppError(409, 'Currently in encounter site combat', 'ENCOUNTER_LOCKOUT');
}
```

Search for existing patterns — `isKnockedOut` checks are a good template.

- [ ] **Step 4: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: set/clear activeEncounterSiteId lockout in encounter combat service"
```

### Task 4: Add Per-Round Snapshots to Auto-Resolve Response

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`

The existing backend plan's auto-resolve function returns round logs but not per-round mob/player state snapshots. The frontend needs these for animated playback with HP bar sync.

- [ ] **Step 1: Capture snapshots during auto-resolve loop**

In `autoResolveEncounterRoom`, after each `resolveRaidRound` call in the loop, capture:

```typescript
interface RoundSnapshot {
  roundNumber: number;
  log: ExpeditionRoundLog;
  mobStates: Array<{
    slot: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    activeEffects: BossActiveEffect[];
  }>;
  playerState: {
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    mana: number;
    maxMana: number;
    activeEffects: BossActiveEffect[];
  };
}

// Inside the loop, after resolveRaidRound returns:
roundSnapshots.push({
  roundNumber: round,
  log: result.roundLog,
  mobStates: result.mobsAfter.map(m => ({
    slot: /* map back from mob id to slot */,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.hp > 0,
    activeEffects: m.activeEffects,
  })),
  playerState: {
    hp: participant.hp,
    maxHp: participant.maxHp,
    stamina: participant.stamina,
    maxStamina: participant.maxStamina,
    mana: participant.mana,
    maxMana: participant.maxMana,
    activeEffects: participant.activeEffects,
  },
});
```

- [ ] **Step 2: Include snapshots in response**

Update the auto-resolve endpoint response to return `rounds: roundSnapshots` alongside the existing `outcome` field.

- [ ] **Step 3: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: include per-round state snapshots in encounter auto-resolve response"
```

---

## Chunk 2: Shared Combat Component Extraction — Helpers

Extract leaf/helper components first since the main components depend on them.

### Task 5: Extract HpBar, EffectPill, and Helper Functions

**Files:**
- Create: `apps/web/src/components/common/combat/HpBar.tsx`
- Create: `apps/web/src/components/common/combat/EffectPill.tsx`
- Create: `apps/web/src/components/common/combat/combatHelpers.ts`
- Create: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create combatHelpers.ts**

Extract from `GuildExpeditionsTab.tsx` lines 99-108 (`roomTypeBadge`), 165-170 (`isEffectDebuff`), 172-182 (`effectDetail`):

```typescript
// apps/web/src/components/common/combat/combatHelpers.ts
import type { BossActiveEffect, ExpeditionRoomType } from '@pocketrealm/shared';

export function roomTypeBadge(roomType: ExpeditionRoomType | null): { label: string; color: string } {
  switch (roomType) {
    case 'trash':      return { label: 'Trash',      color: 'var(--rpg-text-secondary)' };
    case 'elite':      return { label: 'Elite',      color: 'var(--rpg-blue-light)' };
    case 'mini_boss':  return { label: 'Mini-Boss',  color: 'var(--rpg-gold)' };
    case 'event':      return { label: 'Event',      color: 'var(--rpg-green-light)' };
    case 'final_boss': return { label: 'Final Boss', color: 'var(--rpg-red)' };
    default:           return { label: 'Unknown',    color: 'var(--rpg-text-secondary)' };
  }
}

export function isEffectDebuff(effect: BossActiveEffect): boolean {
  if (effect.stat === 'potionSickness') return true;
  if (effect.damagePerRound && effect.damagePerRound > 0) return true;
  if (effect.stat === 'rooted' || effect.stat === 'marked_for_death' || effect.stat === 'nature_cursed') return true;
  return (effect.modifier ?? 0) < 0;
}

export function effectDetail(effect: BossActiveEffect): string {
  const parts: string[] = [];
  if (effect.modifier && effect.modifier !== 0) {
    parts.push(`${effect.stat} ${effect.modifier > 0 ? '+' : ''}${effect.modifier}`);
  }
  if (effect.damagePerRound && effect.damagePerRound > 0) {
    parts.push(`${effect.damagePerRound} ${effect.dotDamageType ?? 'magic'} dmg/round`);
  }
  parts.push(`${effect.roundsRemaining}r remaining`);
  return parts.join(' · ');
}
```

- [ ] **Step 2: Create HpBar.tsx**

Extract from `GuildExpeditionsTab.tsx` lines 144-163:

```tsx
// apps/web/src/components/common/combat/HpBar.tsx
'use client';

export function HpBar({ current, max, label, color }: { current: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return (
    <div className="relative w-full h-4 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
      />
      <div className="absolute inset-0 flex items-center px-1.5">
        <span className="text-[8px] font-pixel text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {label} {Math.floor(current)}/{max}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create EffectPill.tsx**

Extract from `GuildExpeditionsTab.tsx` lines 184-211:

```tsx
// apps/web/src/components/common/combat/EffectPill.tsx
'use client';

import { useState } from 'react';
import type { BossActiveEffect } from '@pocketrealm/shared';
import { isEffectDebuff, effectDetail } from './combatHelpers';

export function EffectPill({ effect, isDebuff }: { effect: BossActiveEffect; isDebuff?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const debuff = isDebuff ?? isEffectDebuff(effect);

  return (
    <span className="relative">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setShowDetail(!showDetail); } }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer select-none ${
          debuff
            ? 'bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]'
            : 'bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]'
        }`}
      >
        {effect.name}
        <span className="opacity-70">{effect.roundsRemaining}r</span>
      </span>
      {showDetail && (
        <span className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded bg-[var(--rpg-surface)] border border-[var(--rpg-border)] text-[10px] text-[var(--rpg-text-primary)] whitespace-nowrap z-10 shadow-lg">
          {effectDetail(effect)}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Create barrel export index.ts**

```typescript
// apps/web/src/components/common/combat/index.ts
export { HpBar } from './HpBar';
export { EffectPill } from './EffectPill';
export { roomTypeBadge, isEffectDebuff, effectDetail } from './combatHelpers';
```

- [ ] **Step 5: Update GuildExpeditionsTab imports**

In `GuildExpeditionsTab.tsx`, replace the inline `HpBar`, `EffectPill`, `isEffectDebuff`, `effectDetail`, and `roomTypeBadge` definitions with imports:

```typescript
import { HpBar, EffectPill, roomTypeBadge, isEffectDebuff, effectDetail } from '@/components/common/combat';
```

Delete the inline definitions (lines 99-211 of the original file — read current file to get exact line ranges since other edits may have shifted them).

- [ ] **Step 6: Build web**

Run: `npm run build:web`
Expected: Clean build, expedition UI unchanged

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/common/combat/ apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "refactor: extract HpBar, EffectPill, and combat helpers into shared components"
```

---

## Chunk 3: Shared Combat Component Extraction — Main Components

### Task 6: Extract RoomProgressBar

**Files:**
- Create: `apps/web/src/components/common/combat/RoomProgressBar.tsx`
- Modify: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create RoomProgressBar.tsx**

Extract from `GuildExpeditionsTab.tsx` InProgressView lines 916-934 (the room progress section inside the first PixelCard). Read the current file to get exact code.

```tsx
// apps/web/src/components/common/combat/RoomProgressBar.tsx
'use client';

export interface RoomProgressBarProps {
  currentRoom: number;
  totalRooms: number;
  label?: string; // e.g., "Room" or custom text
}

export function RoomProgressBar({ currentRoom, totalRooms, label = 'Room' }: RoomProgressBarProps) {
  const pct = totalRooms > 0 ? Math.min((currentRoom / totalRooms) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-pixel text-[var(--rpg-text-secondary)]">
        {label} {currentRoom} / {totalRooms}
      </span>
      <div className="flex-1 h-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
        <div
          className="h-full bg-[var(--rpg-gold)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

Note: Read the actual expedition room progress bar code to match its exact styling. The snippet above is a starting point — adapt to match.

- [ ] **Step 2: Add to barrel export**

Add `export { RoomProgressBar } from './RoomProgressBar';` to `index.ts`.

- [ ] **Step 3: Replace in GuildExpeditionsTab**

Import `RoomProgressBar` and replace the inline room progress JSX in InProgressView.

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: extract RoomProgressBar into shared combat component"
```

### Task 7: Extract MobCardGrid

**Files:**
- Create: `apps/web/src/components/common/combat/MobCardGrid.tsx`
- Modify: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create MobCardGrid.tsx**

Extract from `GuildExpeditionsTab.tsx` lines 1017-1090 (the "Current Room" PixelCard with mob buttons). The component needs these props:

```tsx
// apps/web/src/components/common/combat/MobCardGrid.tsx
'use client';

import Image from 'next/image';
import { monsterImageSrc } from '@/lib/assets';
import { PixelCard } from '@/components/PixelCard';
import { HpBar } from './HpBar';
import { EffectPill } from './EffectPill';
import { mobDisplayName } from '@pocketrealm/shared';
import type { ExpeditionMobInfo } from '@pocketrealm/shared';

export interface MobCardGridProps {
  mobs: ExpeditionMobInfo[];
  myTargetMobId: string | null;
  targetCounts: Map<string, number>; // mobId → number of players targeting
  onSetTarget: (mobId: string | null) => void;
  disabled?: boolean; // true when knocked out or auto-playback
  title?: string; // default "Current Room"
}

export function MobCardGrid({ mobs, myTargetMobId, targetCounts, onSetTarget, disabled, title = 'Current Room' }: MobCardGridProps) {
  // Extract the exact JSX from GuildExpeditionsTab lines 1017-1090
  // Mob cards: clickable buttons with monster image, display name, HP bar, effect pills, targeting badges
  // Read the actual code and copy it here, replacing state references with props
}
```

Read `GuildExpeditionsTab.tsx` lines 1017-1090 to get the exact JSX. Replace `expedition.currentRoomMobs` with `mobs`, `myTargetMobId` from `myMember` with the prop, `amKnockedOut` with `disabled`, etc.

- [ ] **Step 2: Add to barrel export**

- [ ] **Step 3: Replace in GuildExpeditionsTab**

Import `MobCardGrid` and replace the inline mob grid. Pass:
```tsx
<MobCardGrid
  mobs={expedition.currentRoomMobs}
  myTargetMobId={myTargetMobId}
  targetCounts={targetCounts}
  onSetTarget={onSetTarget}
  disabled={amKnockedOut}
/>
```

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: extract MobCardGrid into shared combat component"
```

### Task 8: Extract CombatRoundLog

**Files:**
- Create: `apps/web/src/components/common/combat/RoundLogContent.tsx`
- Create: `apps/web/src/components/common/combat/CombatRoundLog.tsx`
- Modify: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create RoundLogContent.tsx**

Extract `RoundLogContent` from `GuildExpeditionsTab.tsx` lines 1133-1260. This is the core combat log renderer that shows all phases (attacks, defences, healing, mob actions, effect ticks, telegraphs, outcome).

It depends on `RoundLogAttackRow` from `guildExpeditionRoundLogView.tsx` — update the import path if needed, or move `RoundLogAttackRow` into the shared combat folder too.

```tsx
// apps/web/src/components/common/combat/RoundLogContent.tsx
'use client';

import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { RoundLogAttackRow } from './RoundLogAttackRow'; // or wherever it ends up

export interface RoundLogContentProps {
  roundLog: ExpeditionRoundLog;
  playerId: string;
  multiRoom?: boolean;
}

export function RoundLogContent({ roundLog, playerId, multiRoom }: RoundLogContentProps) {
  // Copy the exact JSX from GuildExpeditionsTab lines 1133-1260
}
```

- [ ] **Step 2: Move RoundLogAttackRow**

Move `apps/web/src/components/guild/guildExpeditionRoundLogView.tsx` (or its contents) to `apps/web/src/components/common/combat/RoundLogAttackRow.tsx`. Update the barrel re-export for backwards compatibility — other files import from `guildExpeditionRoundLog.ts` (not `guildExpeditionRoundLogView.tsx`):

```typescript
// apps/web/src/components/guild/guildExpeditionRoundLog.ts
export { RoundLogAttackRow } from '@/components/common/combat/RoundLogAttackRow';
```

- [ ] **Step 3: Create CombatRoundLog.tsx**

This wraps `RoundLogContent` with the LatestRoundLog card + PreviousRoundsLog accordion pattern. Extract from `GuildExpeditionsTab.tsx` lines 1266-1375 (LatestRoundLog + PreviousRoundsLog).

```tsx
// apps/web/src/components/common/combat/CombatRoundLog.tsx
'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { RoundLogContent } from './RoundLogContent';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';

export interface CombatRoundLogProps {
  roundLogs: ExpeditionRoundLog[];
  playerId: string;
  multiRoom?: boolean;
}

export function CombatRoundLog({ roundLogs, playerId, multiRoom }: CombatRoundLogProps) {
  // Latest round card (from LatestRoundLog, lines 1266-1306)
  // Previous rounds accordion (from PreviousRoundsLog, lines 1312-1375)
}
```

- [ ] **Step 4: Add to barrel export**

```typescript
export { RoundLogContent } from './RoundLogContent';
export { RoundLogAttackRow } from './RoundLogAttackRow';
export { CombatRoundLog } from './CombatRoundLog';
```

- [ ] **Step 5: Replace in GuildExpeditionsTab**

Import `CombatRoundLog` and replace the `<LatestRoundLog>` + `<PreviousRoundsLog>` usage in InProgressView with:

```tsx
<CombatRoundLog
  roundLogs={expedition.roundLogs}
  playerId={playerId}
  multiRoom={true}
/>
```

- [ ] **Step 6: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor: extract CombatRoundLog, RoundLogContent, RoundLogAttackRow into shared components"
```

### Task 9: Extract ThreatMeter and PlayerResourceBars

**Files:**
- Create: `apps/web/src/components/common/combat/ThreatMeter.tsx`
- Create: `apps/web/src/components/common/combat/PlayerResourceBars.tsx`
- Modify: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create ThreatMeter.tsx**

Extract from `GuildExpeditionsTab.tsx` lines 1684-1746. This shows horizontal threat bars ranked by threat value.

```tsx
// apps/web/src/components/common/combat/ThreatMeter.tsx
'use client';

export interface ThreatEntry {
  id: string;
  label: string;
  threatValue: number;
}

export interface ThreatMeterProps {
  entries: ThreatEntry[];
}

export function ThreatMeter({ entries }: ThreatMeterProps) {
  // Extract lines 1684-1746, replacing ExpeditionMemberData[] with ThreatEntry[]
  // The component internally sorts by threatValue descending and highlights the highest entry
  // (the "aggro holder"). Keep this internal computation — callers just provide entries.
  const sorted = [...entries].sort((a, b) => b.threatValue - a.threatValue);
  const maxThreat = sorted[0]?.threatValue ?? 0;
  // ... rest of existing rendering with sorted entries and maxThreat for bar width %
}
```

**Expedition adapter code** — in `GuildExpeditionsTab.tsx` where ThreatMeter is used (inside MemberList), convert members to entries:

```tsx
<ThreatMeter
  entries={members
    .filter(m => m.threatValue > 0)
    .map(m => ({
      id: m.playerId,
      label: m.username ?? m.playerId,
      threatValue: m.threatValue,
    }))}
/>
```

**Encounter site adapter** — in `EncounterSiteCombatView`, threat shows the player's threat per mob (from the round log threat data if available), but initially can just show the player as a single entry:

```tsx
<ThreatMeter
  entries={[{ id: 'self', label: 'You', threatValue: 100 }]}
/>
```

- [ ] **Step 2: Create PlayerResourceBars.tsx**

Extract the per-member resource bar rendering from MemberList (lines 1748-1882). Adapt it to work for a single player or multiple members.

```tsx
// apps/web/src/components/common/combat/PlayerResourceBars.tsx
'use client';

import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { EffectPill } from './EffectPill';
import type { BossActiveEffect } from '@pocketrealm/shared';

export interface PlayerResourceState {
  playerId: string;
  username?: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  activeEffects: BossActiveEffect[];
}

export interface PlayerResourceBarsProps {
  players: PlayerResourceState[];
  compact?: boolean;
}

export function PlayerResourceBars({ players, compact = true }: PlayerResourceBarsProps) {
  // Render HP/stamina/mana bars using ResourceStatusBar
  // Show active effect pills
  // For single player, renders one set of bars
  // For multiple players (expedition), renders per-member
}
```

- [ ] **Step 3: Add to barrel export**

- [ ] **Step 4: Replace in GuildExpeditionsTab**

In the MemberList component (lines 1748-1882), use `ThreatMeter` and `PlayerResourceBars` instead of inline rendering. The MemberList still handles expedition-specific concerns (heal target selection, recover button, contribution rankings) but delegates resource bars and threat meter to the shared components.

- [ ] **Step 5: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: extract ThreatMeter and PlayerResourceBars into shared components"
```

### Task 10: Extract CombatActionButtons and TemplateQuickSwitch

**Files:**
- Create: `apps/web/src/components/common/combat/CombatActionButtons.tsx`
- Create: `apps/web/src/components/common/combat/TemplateQuickSwitch.tsx`
- Modify: `apps/web/src/components/common/combat/index.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Create CombatActionButtons.tsx**

This is a composable button bar — consumers pass which buttons to show via a config array, not a fixed layout.

```tsx
// apps/web/src/components/common/combat/CombatActionButtons.tsx
'use client';

import { PixelButton } from '@/components/PixelButton';

export interface CombatAction {
  key: string;
  label: string;
  subtext?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary';
  visible?: boolean; // defaults to true
}

export interface CombatActionButtonsProps {
  actions: CombatAction[];
  loading?: boolean;
}

export function CombatActionButtons({ actions, loading }: CombatActionButtonsProps) {
  const visibleActions = actions.filter(a => a.visible !== false);
  if (visibleActions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleActions.map(action => (
        <div key={action.key} className="flex flex-col items-center">
          <PixelButton
            onClick={action.onClick}
            disabled={action.disabled || loading}
            variant={action.variant ?? 'primary'}
          >
            {action.label}
          </PixelButton>
          {action.subtext && (
            <span className="text-[10px] text-[var(--rpg-text-secondary)] mt-0.5">
              {action.subtext}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create TemplateQuickSwitch.tsx**

Extract from `GuildExpeditionsTab.tsx` lines 1000-1015:

```tsx
// apps/web/src/components/common/combat/TemplateQuickSwitch.tsx
'use client';

import type { CombatTemplateData } from '@pocketrealm/shared';

export interface TemplateQuickSwitchProps {
  templates: CombatTemplateData[];
  activeTemplateId: string | null;
  onActivate: (templateId: string) => void;
  disabled?: boolean;
}

export function TemplateQuickSwitch({ templates, activeTemplateId, onActivate, disabled }: TemplateQuickSwitchProps) {
  if (templates.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-[var(--rpg-text-secondary)]">Template:</label>
      <select
        className="text-xs bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-[var(--rpg-text-primary)]"
        value={activeTemplateId ?? ''}
        onChange={(e) => onActivate(e.target.value)}
        disabled={disabled}
      >
        {templates.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Add to barrel export**

- [ ] **Step 4: Replace in GuildExpeditionsTab**

Replace the inline action buttons (lines 945-997) and template dropdown (lines 1000-1015) with the shared components.

For the expedition action buttons, compose like:
```tsx
<CombatActionButtons
  loading={actionLoading}
  actions={[
    { key: 'refresh', label: 'Refresh', onClick: onRefresh, visible: true },
    { key: 'auto-resolve', label: 'Auto-Resolve', subtext: 'Instant clear — templates locked', onClick: () => setPendingConfirm('autoResolve'), visible: isOfficer && expedition.roundNumber === 0 && !!expedition.nextRoundAt },
    { key: 'force-round', label: 'Force Next Round', subtext: 'Skip wait — resolve next round now', onClick: onForceRound, visible: isOfficer && !!expedition.nextRoundAt },
    { key: 'abandon', label: 'Abandon', onClick: () => setPendingConfirm('abandon'), variant: 'danger', visible: isOfficer },
  ]}
/>
```

The auto-advance toggle stays inline in the expedition component since it's timer-specific (not relevant to encounter sites).

- [ ] **Step 5: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: extract CombatActionButtons and TemplateQuickSwitch into shared components"
```

---

## Chunk 4: Frontend API Types & Functions

### Task 11: Add Encounter Site Combat API Types and Functions

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`

- [ ] **Step 1: Add new types**

Add after the existing encounter site types:

```typescript
// --- Encounter Site Room Combat Types ---

export interface EncounterRoomMobState {
  slot: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  activeEffects: BossActiveEffect[];
}

export interface EncounterPlayerState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  activeEffects: BossActiveEffect[];
}

export interface EncounterRoundSnapshot {
  roundNumber: number;
  log: ExpeditionRoundLog;
  mobStates: EncounterRoomMobState[];
  playerState: EncounterPlayerState;
}

export interface EncounterAutoResolveResponse {
  outcome: 'cleared' | 'defeated';
  rounds: EncounterRoundSnapshot[];
  chestReward?: {
    rarity: string;
    materials: Array<{ itemTemplateId: string; name: string; quantity: number }>;
    recipe?: { recipeId: string; name: string } | null;
  };
  stateUpdates?: StateUpdates; // turns consumed, HP changes, XP, loot
}

export interface EncounterStartRoomResponse {
  room: number;
  mobs: Array<{
    id: string;
    slot: number;
    name: string;
    prefix: string | null;
    hp: number;
    maxHp: number;
    mobTemplateId: string;
  }>;
  turnCost: number;
  playerState: EncounterPlayerState;
  stateUpdates?: StateUpdates;
}

export interface EncounterManualRoundResponse {
  roundLog: ExpeditionRoundLog;
  mobStates: EncounterRoomMobState[];
  playerState: EncounterPlayerState;
  roomCleared: boolean;
  defeated: boolean;
  chestReward?: EncounterAutoResolveResponse['chestReward'];
  stateUpdates?: StateUpdates;
}
```

- [ ] **Step 2: Add API functions**

```typescript
export async function autoResolveEncounterRoom(siteId: string): Promise<EncounterAutoResolveResponse> {
  const res = await fetchApi<EncounterAutoResolveResponse>(`/combat/encounter-sites/${siteId}/auto-resolve`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Auto-resolve failed');
  return res.data;
}

export async function startEncounterRoom(siteId: string): Promise<EncounterStartRoomResponse> {
  const res = await fetchApi<EncounterStartRoomResponse>(`/combat/encounter-sites/${siteId}/start-room`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to start room');
  return res.data;
}

export async function resolveEncounterRound(
  siteId: string,
  action: { action: string; targetMobSlot?: number },
): Promise<EncounterManualRoundResponse> {
  const res = await fetchApi<EncounterManualRoundResponse>(`/combat/encounter-sites/${siteId}/round`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to resolve round');
  return res.data;
}

export async function abandonEncounterSite(siteId: string): Promise<{ success: boolean; stateUpdates?: StateUpdates }> {
  const res = await fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>(`/combat/encounter-sites/${siteId}/abandon`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to abandon');
  return res.data;
}
```

- [ ] **Step 3: Add import for shared types**

Ensure `ExpeditionRoundLog`, `BossActiveEffect`, and `StateUpdates` are imported from `@pocketrealm/shared` at the top of the file.

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: add encounter site room combat API types and functions"
```

---

## Chunk 5: EncounterSiteCombatView

### Task 12: Build EncounterSiteCombatView with Room Preview State

**Files:**
- Create: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Create the component with state machine**

```tsx
// apps/web/src/components/encounter/EncounterSiteCombatView.tsx
'use client';

import { useState, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import {
  RoomProgressBar,
  MobCardGrid,
  CombatActionButtons,
  TemplateQuickSwitch,
  ThreatMeter,
  PlayerResourceBars,
  CombatRoundLog,
  HpBar,
  roomTypeBadge,
} from '@/components/common/combat';
import type {
  EncounterAutoResolveResponse,
  EncounterStartRoomResponse,
  EncounterManualRoundResponse,
  EncounterRoundSnapshot,
  EncounterRoomMobState,
  EncounterPlayerState,
} from '@/lib/api/combat';
import type { ExpeditionMobInfo, ExpeditionRoundLog, CombatTemplateData } from '@pocketrealm/shared';

type CombatState = 'room_preview' | 'auto_playback' | 'manual_combat' | 'room_result';

interface EncounterSiteCombatViewProps {
  siteId: string;
  siteName: string;
  mobFamilyName: string;
  currentRoom: number;
  totalRooms: number;
  initialMobs: ExpeditionMobInfo[];
  playerState: EncounterPlayerState;
  templates: CombatTemplateData[];
  hasDecayedMobs: boolean; // true if any mob in current room has decayed
  onAutoResolve: () => Promise<EncounterAutoResolveResponse>;
  onStartRoom: () => Promise<EncounterStartRoomResponse>;
  onResolveRound: (action: { action: string; targetMobSlot?: number }) => Promise<EncounterManualRoundResponse>;
  onAbandon: () => Promise<void>;
  onAdvanceRoom: () => Promise<{
    currentRoom: number;
    mobs: ExpeditionMobInfo[];
    playerState: EncounterPlayerState;
    hasDecayedMobs: boolean;
  }>; // called when player continues to next room — parent refetches site data
  onRetryRoom: () => Promise<EncounterStartRoomResponse>; // resets room server-side, returns fresh state
  onComplete: () => void; // called when player exits combat view
  onActivateTemplate: (templateId: string) => void;
}

export function EncounterSiteCombatView(props: EncounterSiteCombatViewProps) {
  const [state, setState] = useState<CombatState>('room_preview');
  const [mobs, setMobs] = useState<ExpeditionMobInfo[]>(props.initialMobs);
  const [playerState, setPlayerState] = useState(props.playerState);
  const [roundLogs, setRoundLogs] = useState<ExpeditionRoundLog[]>([]);
  const [targetMobId, setTargetMobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<'cleared' | 'defeated' | null>(null);
  const [chestReward, setChestReward] = useState<EncounterAutoResolveResponse['chestReward'] | null>(null);

  // Auto-playback state
  const [playbackRounds, setPlaybackRounds] = useState<EncounterRoundSnapshot[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlayingBack, setIsPlayingBack] = useState(false);

  // Room preview: show mobs, auto-resolve and manual buttons
  // Auto playback: animated round-by-round
  // Manual combat: next round button, mob targeting
  // Room result: outcome, continue/retry/abandon

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky playback container - only during auto_playback */}
      {state === 'auto_playback' && (
        <div className="sticky top-0 z-20 bg-[var(--rpg-surface)] border-b border-[var(--rpg-border)] p-3">
          {/* Current round log + skip button */}
        </div>
      )}

      {/* Header */}
      <PixelCard>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-pixel text-[var(--rpg-gold)]">{props.siteName}</h3>
            <span className="text-xs text-[var(--rpg-text-secondary)]">{props.mobFamilyName}</span>
          </div>
        </div>
        <RoomProgressBar currentRoom={props.currentRoom} totalRooms={props.totalRooms} />
      </PixelCard>

      {/* Action buttons - context dependent */}
      {state === 'room_preview' && (
        <>
          {props.hasDecayedMobs && (
            <div className="text-xs text-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)]/30 rounded px-3 py-2">
              Decayed mobs detected — auto-resolve bonus disabled for this room.
            </div>
          )}
          <CombatActionButtons
            loading={loading}
            actions={[
              { key: 'auto', label: 'Auto-Resolve', subtext: 'Template locked — instant clear', onClick: handleAutoResolve },
              { key: 'manual', label: 'Fight Manually', subtext: 'Round by round', onClick: handleStartManual },
              { key: 'abandon', label: 'Abandon', onClick: handleAbandon, variant: 'danger' },
            ]}
          />
          <TemplateQuickSwitch
            templates={props.templates}
            activeTemplateId={props.templates.find(t => t.isActive)?.id ?? props.templates[0]?.id ?? null}
            onActivate={props.onActivateTemplate}
          />
        </>
      )}

      {state === 'manual_combat' && (
        <CombatActionButtons
          loading={loading}
          actions={[
            { key: 'next-round', label: 'Next Round', onClick: handleNextRound },
            { key: 'abandon', label: 'Abandon', onClick: handleAbandon, variant: 'danger' },
          ]}
        />
      )}

      {state === 'room_result' && (
        <PixelCard>
          {/* Outcome display, continue/retry/abandon buttons */}
          {/* See Task 15 for full implementation */}
        </PixelCard>
      )}

      {/* Mob grid */}
      <MobCardGrid
        mobs={mobs}
        myTargetMobId={targetMobId}
        targetCounts={new Map()}
        onSetTarget={setTargetMobId}
        disabled={state === 'auto_playback' || state === 'room_result'}
      />

      {/* Player resources */}
      <PlayerResourceBars
        players={[{
          playerId: 'self',
          hp: playerState.hp,
          maxHp: playerState.maxHp,
          stamina: playerState.stamina,
          maxStamina: playerState.maxStamina,
          mana: playerState.mana,
          maxMana: playerState.maxMana,
          activeEffects: playerState.activeEffects,
        }]}
      />

      {/* Round logs */}
      {roundLogs.length > 0 && (
        <CombatRoundLog roundLogs={roundLogs} playerId="self" />
      )}
    </div>
  );

  // Handler stubs — implemented in subsequent tasks
  async function handleAutoResolve() { /* Task 13 */ }
  async function handleStartManual() { /* Task 14 */ }
  async function handleNextRound() { /* Task 14 */ }
  async function handleAbandon() { /* Task 15 */ }
}
```

- [ ] **Step 2: Build web**

Run: `npm run build:web`
Expected: Clean build (component exists but isn't mounted anywhere yet)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/encounter/
git commit -m "feat: scaffold EncounterSiteCombatView with state machine and room_preview"
```

### Task 13: Implement Auto-Resolve with Animated Playback

**Files:**
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Implement handleAutoResolve**

```typescript
async function handleAutoResolve() {
  setLoading(true);
  try {
    const result = await props.onAutoResolve();
    setPlaybackRounds(result.rounds);
    setPlaybackIndex(0);
    setIsPlayingBack(true);
    setState('auto_playback');
    setOutcome(result.outcome);
    if (result.chestReward) setChestReward(result.chestReward);

    // Start animated playback
    playRounds(result.rounds);
  } catch (err) {
    // Use the project's toast queue: window.showToast?.({ message: (err as Error).message, type: 'error' })
    window.showToast?.({ message: (err as Error).message ?? 'Auto-resolve failed', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 2: Implement playRounds animation loop**

```typescript
async function playRounds(rounds: EncounterRoundSnapshot[]) {
  for (let i = 0; i < rounds.length; i++) {
    if (!isPlayingBackRef.current) break; // skip was pressed

    const snapshot = rounds[i];
    setPlaybackIndex(i);
    setRoundLogs(prev => [...prev, snapshot.log]);

    // Update mob HP bars
    // Mob IDs follow the pattern "encounter-mob-{slot}" (set by buildEncounterRaidMob in game-engine).
    // The slot number is embedded in the ID, and mobStates[].slot matches it.
    setMobs(prev => prev.map(mob => {
      const slot = parseInt(mob.id.replace('encounter-mob-', ''), 10);
      const mobState = snapshot.mobStates.find(ms => ms.slot === slot);
      if (!mobState) return mob;
      return { ...mob, hp: mobState.hp, maxHp: mobState.maxHp, activeEffects: mobState.activeEffects };
    }));

    // Update player resources
    setPlayerState(snapshot.playerState);

    // Pause between rounds
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  setIsPlayingBack(false);
  setState('room_result');
}
```

Use a ref (`isPlayingBackRef`) for the skip check since setState is async.

- [ ] **Step 3: Implement skip button**

In the sticky playback container:

```tsx
<PixelButton onClick={handleSkipPlayback} variant="secondary">
  Skip
</PixelButton>
```

```typescript
function handleSkipPlayback() {
  isPlayingBackRef.current = false;
  const lastRound = playbackRounds[playbackRounds.length - 1];
  if (lastRound) {
    setRoundLogs(playbackRounds.map(r => r.log));
    setMobs(prev => prev.map(mob => {
      const slot = parseInt(mob.id.replace('encounter-mob-', ''), 10);
      const mobState = lastRound.mobStates.find(ms => ms.slot === slot);
      if (!mobState) return mob;
      return { ...mob, hp: mobState.hp, maxHp: mobState.maxHp, activeEffects: mobState.activeEffects };
    }));
    setPlayerState(lastRound.playerState);
  }
  setIsPlayingBack(false);
  setState('room_result');
}
```

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: implement auto-resolve with animated playback and skip in EncounterSiteCombatView"
```

### Task 14: Implement Manual Combat Round-by-Round

**Files:**
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Implement handleStartManual**

```typescript
async function handleStartManual() {
  setLoading(true);
  try {
    const result = await props.onStartRoom();
    // Update mob list from server response
    setMobs(result.mobs.map(m => ({
      id: m.id,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: [],
    })));
    setPlayerState(result.playerState);
    setState('manual_combat');
  } catch (err) {
    window.showToast?.({ message: (err as Error).message ?? 'Failed to start room', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 2: Implement handleNextRound**

```typescript
async function handleNextRound() {
  setLoading(true);
  try {
    // Build action from selected target and active template
    // Mob IDs follow "encounter-mob-{slot}" pattern, so extract slot from ID
    const targetSlot = targetMobId ? parseInt(targetMobId.replace('encounter-mob-', ''), 10) : undefined;
    const action = {
      action: 'template', // uses the player's active template
      targetMobSlot: targetSlot,
    };
    const result = await props.onResolveRound(action);

    // Update round log
    setRoundLogs(prev => [...prev, result.roundLog]);

    // Update mob states
    setMobs(prev => prev.map(mob => {
      const slot = parseInt(mob.id.replace('encounter-mob-', ''), 10);
      const mobState = result.mobStates.find(ms => ms.slot === slot);
      if (!mobState) return mob;
      return { ...mob, hp: mobState.hp, maxHp: mobState.maxHp, activeEffects: mobState.activeEffects };
    }));

    // Update player state
    setPlayerState(result.playerState);

    // Check room outcome
    if (result.roomCleared) {
      setOutcome('cleared');
      if (result.chestReward) setChestReward(result.chestReward);
      setState('room_result');
    } else if (result.defeated) {
      setOutcome('defeated');
      setState('room_result');
    }
  } catch (err) {
    window.showToast?.({ message: (err as Error).message ?? 'Failed to resolve round', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: implement manual combat round-by-round in EncounterSiteCombatView"
```

### Task 15: Implement Room Transitions, Completion, and Defeat

**Files:**
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Implement room_result state rendering**

```tsx
{state === 'room_result' && (
  <PixelCard>
    {outcome === 'cleared' && props.currentRoom < props.totalRooms && (
      <>
        <h3 className="text-sm font-pixel text-[var(--rpg-green-light)]">
          Room {props.currentRoom} Cleared!
        </h3>
        <p className="text-xs text-[var(--rpg-text-secondary)]">
          {roundLogs.length} rounds — carry HP: {playerState.hp}/{playerState.maxHp}
        </p>
        <PixelButton onClick={handleContinue}>
          Continue to Room {props.currentRoom + 1}
        </PixelButton>
      </>
    )}

    {outcome === 'cleared' && props.currentRoom >= props.totalRooms && (
      <>
        <h3 className="text-sm font-pixel text-[var(--rpg-gold)]">
          Site Cleared!
        </h3>
        {chestReward && (
          <div className="mt-2">
            <span className="text-xs font-pixel text-[var(--rpg-gold)]">
              {chestReward.rarity.charAt(0).toUpperCase() + chestReward.rarity.slice(1)} Chest
            </span>
            {chestReward.materials.map(m => (
              <div key={m.itemTemplateId} className="text-xs text-[var(--rpg-text-primary)]">
                {m.name} x{m.quantity}
              </div>
            ))}
            {chestReward.recipe && (
              <div className="text-xs text-[var(--rpg-blue-light)]">
                Recipe: {chestReward.recipe.name}
              </div>
            )}
          </div>
        )}
        <PixelButton onClick={props.onComplete}>Done</PixelButton>
      </>
    )}

    {outcome === 'defeated' && (
      <>
        <h3 className="text-sm font-pixel text-[var(--rpg-red)]">
          Defeated in Room {props.currentRoom}
        </h3>
        <p className="text-xs text-[var(--rpg-text-secondary)]">
          Retrying charges the turn cost again.
        </p>
        <div className="flex gap-2 mt-2">
          <PixelButton onClick={handleRetry}>Retry Room</PixelButton>
          <PixelButton onClick={handleAbandon} variant="danger">Abandon Site</PixelButton>
        </div>
      </>
    )}
  </PixelCard>
)}
```

- [ ] **Step 2: Implement handleContinue**

```typescript
async function handleContinue() {
  setLoading(true);
  try {
    // Parent refetches site data and returns next room's state
    const nextRoom = await props.onAdvanceRoom();
    setMobs(nextRoom.mobs.map(m => ({
      id: m.id ?? `encounter-mob-${m.slot}`,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: [],
    })));
    setPlayerState(nextRoom.playerState);
    setRoundLogs([]);
    setOutcome(null);
    setChestReward(null);
    setTargetMobId(null);
    setState('room_preview');
  } catch (err) {
    window.showToast?.({ message: 'Failed to advance room', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Implement handleRetry**

Retry calls the server to reset the room. The server clears carry state and resets mobs to alive. Using stale props would be incorrect since the player's carry HP from previous rooms is not the right "retry" state.

```typescript
async function handleRetry() {
  setLoading(true);
  try {
    // Server resets room mobs to alive, clears carry state, charges turn cost again
    const result = await props.onRetryRoom();
    setMobs(result.mobs.map(m => ({
      id: m.id,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: [],
    })));
    setPlayerState(result.playerState);
    setRoundLogs([]);
    setOutcome(null);
    setTargetMobId(null);
    setState('room_preview');
  } catch (err) {
    window.showToast?.({ message: 'Failed to retry room', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 4: Implement handleAbandon**

```typescript
async function handleAbandon() {
  setLoading(true);
  try {
    await props.onAbandon();
    props.onComplete();
  } catch (err) {
    window.showToast?.({ message: 'Failed to abandon site', type: 'error' });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 5: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: implement room transitions, site completion, and defeat in EncounterSiteCombatView"
```

---

## Chunk 6: Integration

### Task 16: Wire EncounterSiteCombatView into CombatScreen

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add encounter combat state to useGameController**

In `useGameController.ts`, add state for tracking active encounter site combat:

```typescript
const [activeEncounterSiteId, setActiveEncounterSiteId] = useState<string | null>(null);
const [encounterCombatData, setEncounterCombatData] = useState<{
  siteId: string;
  siteName: string;
  mobFamilyName: string;
  currentRoom: number;
  totalRooms: number;
  mobs: ExpeditionMobInfo[];
  playerState: EncounterPlayerState;
  hasDecayedMobs: boolean;
} | null>(null);
```

- [ ] **Step 2: Sync activeEncounterSiteId from player state**

In the player state sync (where `isKnockedOut` and `isOverencumbered` are read), also read `activeEncounterSiteId`. On mount, if it's set, fetch the site data and enter combat view:

```typescript
// In the player state effect or load function:
if (playerState.activeEncounterSiteId) {
  setActiveEncounterSiteId(playerState.activeEncounterSiteId);
  // Fetch site data and populate encounterCombatData for reconnect
}
```

- [ ] **Step 3: Add enterEncounterCombat handler**

```typescript
const enterEncounterCombat = useCallback(async (siteId: string) => {
  // Fetch site details, build combat data, set state
  setActiveEncounterSiteId(siteId);
  // Build encounterCombatData from site details
  setState('encounters'); // ensure we're on the encounters screen
}, []);
```

- [ ] **Step 4: Render EncounterSiteCombatView in CombatScreen**

In `CombatScreen.tsx`, when `activeEncounterSiteId` is set, render the combat view instead of the encounter site list:

```tsx
{activeEncounterSiteId && encounterCombatData ? (
  <EncounterSiteCombatView
    siteId={encounterCombatData.siteId}
    siteName={encounterCombatData.siteName}
    mobFamilyName={encounterCombatData.mobFamilyName}
    currentRoom={encounterCombatData.currentRoom}
    totalRooms={encounterCombatData.totalRooms}
    initialMobs={encounterCombatData.mobs}
    playerState={encounterCombatData.playerState}
    templates={templates}
    hasDecayedMobs={encounterCombatData.hasDecayedMobs}
    onAutoResolve={async () => {
      const result = await autoResolveEncounterRoom(activeEncounterSiteId);
      if (result.stateUpdates) onStateUpdates(result.stateUpdates); // apply turns, HP, XP changes
      return result;
    }}
    onStartRoom={async () => {
      const result = await startEncounterRoom(activeEncounterSiteId);
      if (result.stateUpdates) onStateUpdates(result.stateUpdates);
      return result;
    }}
    onResolveRound={async (action) => {
      const result = await resolveEncounterRound(activeEncounterSiteId, action);
      if (result.stateUpdates) onStateUpdates(result.stateUpdates);
      return result;
    }}
    onAbandon={async () => {
      const result = await abandonEncounterSite(activeEncounterSiteId);
      if (result.stateUpdates) onStateUpdates(result.stateUpdates);
      setActiveEncounterSiteId(null); setEncounterCombatData(null);
    }}
    onAdvanceRoom={async () => {
      // Refetch site data for next room
      const sites = await getEncounterSites();
      const site = sites.sites.find(s => s.id === activeEncounterSiteId);
      if (!site) throw new Error('Site not found');
      // Build next room data from updated site
      return { currentRoom: site.currentRoom, mobs: /* build mob info from site.mobs */, playerState: /* from site.roomCarryState */, hasDecayedMobs: /* check decayed count in current room */ };
    }}
    onRetryRoom={async () => {
      // Call start-room again — server resets mobs, charges turns
      const result = await startEncounterRoom(activeEncounterSiteId);
      if (result.stateUpdates) onStateUpdates(result.stateUpdates);
      return result;
    }}
    onComplete={() => { setActiveEncounterSiteId(null); setEncounterCombatData(null); refreshPendingEncounters(); }}
    onActivateTemplate={handleActivateTemplate}
  />
) : (
  /* Existing encounter site list */
)}
```

- [ ] **Step 5: Update encounter site list "Fight" button**

Replace the existing "Fight" button click handler (which currently calls `startCombatFromEncounterSite`) with `enterEncounterCombat(siteId)`. The old sequential combat flow is no longer used for encounter sites.

- [ ] **Step 6: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git commit -am "feat: wire EncounterSiteCombatView into CombatScreen with state management"
```

### Task 17: Frontend Lockout Integration

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx` (or wherever navigation buttons are)

- [ ] **Step 1: Read activeEncounterSiteId from player state**

Ensure the game controller exposes `activeEncounterSiteId` to the UI. It should already be set from Task 16 Step 2.

- [ ] **Step 2: Disable navigation while in encounter combat**

Find where the explore, craft, arena, and guild buttons are rendered (likely in `page.tsx` or a navigation component). Add disabled state:

```tsx
const inEncounterCombat = !!activeEncounterSiteId;

// For each action button that should be locked:
<button
  disabled={inEncounterCombat || /* existing disabled conditions */}
  title={inEncounterCombat ? 'Currently in encounter site combat' : undefined}
>
```

- [ ] **Step 3: Add "Return to combat" on reconnect**

If `activeEncounterSiteId` is set but the player is not on the encounters screen, show a prompt:

```tsx
{activeEncounterSiteId && activeView !== 'encounters' && (
  <div className="bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)] rounded px-3 py-2 text-xs">
    You are in encounter site combat.
    <button onClick={() => setActiveView('encounters')}>Return to combat</button>
  </div>
)}
```

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: add frontend lockout for encounter site combat"
```

### Task 18: Update Encounter Site List for New Fields

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

- [ ] **Step 1: Update site list cards**

The encounter site API response now returns `totalRooms` and `roomStrategy` instead of `clearStrategy` and `fullClearActive`. Update the site list cards to show:

- Room count: "3 Rooms" instead of size badge
- Progress: "Room 2/3" if partially cleared
- Per-room turn cost instead of total turn cost

- [ ] **Step 2: Remove strategy selection modal**

Delete the strategy selection modal (lines 201-249 of CombatScreen.tsx) that offered Full Clear vs Room by Room. Strategy is now chosen per-room inside the combat view.

- [ ] **Step 3: Remove old fight flow**

Remove the `startCombatFromEncounterSite` call path. The "Fight" button now calls `enterEncounterCombat` (from Task 16 Step 5).

- [ ] **Step 4: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: update encounter site list for room-based display, remove old strategy selection"
```

---

## Chunk 7: Combat History & Cleanup

### Task 19: Update Combat History for Room-Level Grouping

**Files:**
- Modify: `apps/web/src/components/screens/CombatHistory.tsx` (or wherever combat history renders)
- Modify: `apps/web/src/lib/api/combat.ts`

- [ ] **Step 1: Update combat history list rendering**

Encounter site entries now have per-room logs instead of per-mob fight logs. Update the history list to show encounter site entries as:

- Site name + mob family + "X rooms"
- Total rewards from chest
- Expandable to show per-room round logs (same `CombatRoundLog` component)

- [ ] **Step 2: Remove old 1/N fight navigation**

The old `getEncounterSiteFights` function and `EncounterSiteFightSummary` type (per-mob fight navigation from the old UX plan) are no longer needed. Remove them or mark deprecated.

- [ ] **Step 3: Build web**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: update combat history for room-level encounter site grouping"
```

### Task 20: Remove Old Encounter Site Combat Code

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

- [ ] **Step 1: Remove old API functions**

In `combat.ts`, remove or mark deprecated:
- `startCombatFromEncounterSite` — replaced by new endpoints
- `selectSiteStrategy` — strategy selection removed
- `getEncounterSiteFights` — per-mob navigation removed

- [ ] **Step 2: Remove old state and handlers from useGameController**

Remove encounter-site-specific combat state that was used by the old flow:
- Old encounter site room transition state
- Old fight progress tracking
- Old combat playback queue for encounter sites
- Old strategy selection handler

Search for `encounterSite` references in `useGameController.ts` and remove anything that references the old 1v1 sequential flow. Keep `activeEncounterSiteId` and `encounterCombatData` (the new state).

- [ ] **Step 3: Clean up CombatScreen**

Remove:
- Old room transition interstitial (lines ~299-309)
- Old fight progress bar (lines ~317-321)
- Any remaining references to `clearStrategy`, `fullClearActive`, `startCombatFromEncounterSite`

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: Clean build across all packages

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: All tests pass (some encounter-site-specific tests may need updating — adjust assertions for new API shapes)

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor: remove old sequential encounter site combat code"
```

---

## Implementation Notes

### Dependency Order

This plan assumes the **backend plan** (Chunks 1–5 of `docs/loop-balance/plans/08-encounter-site-rework.md`) is complete. The backend provides:
- New encounter site schema (roomStrategy, roomCarryState, totalRooms)
- Raid resolver with splash cascade and crowded debuff
- Encounter site combat service (auto-resolve, manual, abandon)
- New API routes (start-room, round, auto-resolve, abandon)
- Chest service with room-count tiers

This frontend plan adds on top:
- Chunk 1 adds backend gaps (lockout field, per-round snapshots)
- Chunks 2-3 extract shared components (can be done in parallel with Chunk 1)
- Chunks 4-5 build the combat view (depends on Chunks 1-3)
- Chunk 6 integrates everything (depends on Chunks 4-5)
- Chunk 7 cleans up old code (depends on Chunk 6)

### Key Patterns

- **Expedition auto-resolve UI** (`GuildExpeditionsTab.tsx`): The encounter site auto-resolve playback mirrors this but adds animated round-by-round display.
- **Combat playback** (`CombatScreen.tsx`): The sticky top pattern is already used here — reuse the same CSS approach.
- **Player state sync**: Follow the `isKnockedOut` / `isOverencumbered` pattern for `activeEncounterSiteId`.

### Testing Strategy

- **Component tests**: Shared components should be visually verifiable by building and checking expedition UI still works (regression).
- **Integration tests**: Encounter site combat flow requires a running dev environment for manual verification.
- **Build verification**: Each commit runs `npm run build:web` as a type-safety check.
