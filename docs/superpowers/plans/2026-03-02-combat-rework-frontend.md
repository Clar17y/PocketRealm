# Combat Rework — Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build all 5 frontend tasks for the combat rework: resource bars, template editor, skill tree, combat playback updates, and boss panel rework.

**Architecture:** Extends the existing `useGameController` state management pattern. New screens (`Templates`, `TalentTree`) added to the `Screen` union under the `combat` tab. New API layer files follow the `fetchApi<T>()` pattern in `apps/web/src/lib/api/`. Components use existing `StatBar`, `PixelCard`, `PixelButton` primitives.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, RPG theme variables (`--rpg-*`).

**Design Doc:** `docs/superpowers/specs/2026-03-02-combat-rework-frontend-design.md`

**Worktree:** `D:\Code\Adventure\.worktrees\adventure-combat-rework` (branch: `combat-rework`)

---

## Task 1: Resource Bars — API Layer + State

**Files:**
- Create: `apps/web/src/lib/api/resources.ts`
- Modify: `apps/web/src/lib/api/index.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create resource API functions**

Backend `GET /api/v1/resources` returns `{ stamina: ResourceState, mana: ResourceState }` where each has `{ current, max, regenPerRound, regenPerSecond }`.

Create `apps/web/src/lib/api/resources.ts`:

```typescript
import { fetchApi } from './core';

export interface ResourcePoolState {
  current: number;
  max: number;
  regenPerRound: number;
  regenPerSecond: number;
}

export interface CombatResourceResponse {
  stamina: ResourcePoolState;
  mana: ResourcePoolState;
}

export async function getResources() {
  return fetchApi<CombatResourceResponse>('/api/v1/resources');
}
```

**Step 2: Export from barrel**

In `apps/web/src/lib/api/index.ts`, add:

```typescript
export { getResources } from './resources';
export type { ResourcePoolState, CombatResourceResponse } from './resources';
```

**Step 3: Add state to useGameController**

In `apps/web/src/app/game/useGameController.ts`:

1. Add `ResourcePoolState` type import from API layer
2. Add state:
```typescript
const [staminaState, setStaminaState] = useState<ResourcePoolState>({ current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 });
const [manaState, setManaState] = useState<ResourcePoolState>({ current: 50, max: 50, regenPerRound: 5, regenPerSecond: 0.5 });
```
3. Update `loadTurnsAndHp` to also fetch resources:
```typescript
const loadTurnsAndHp = useCallback(async () => {
  const [turnRes, hpRes, resourceRes] = await Promise.all([getTurns(), getHpState(), getResources()]);
  if (turnRes.data) setTurns(turnRes.data.currentTurns);
  if (hpRes.data) setHpState(hpRes.data);
  if (resourceRes.data) {
    setStaminaState(resourceRes.data.stamina);
    setManaState(resourceRes.data.mana);
  }
}, []);
```
4. Add `getResources()` to the `loadAll` parallel fetch alongside `getHpState()`
5. Expose `staminaState` and `manaState` in the returned controller object

**Step 4: Build and verify**

Run: `npm run build:web`
Expected: Builds without errors

**Step 5: Commit**

```
feat(web): add resource state (stamina/mana) to game controller
```

---

## Task 2: Resource Bars — Dashboard UI

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/components/StatBar.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add 'stamina' color to StatBar**

In `StatBar.tsx`, add `'stamina'` to the color union. Map it to `bg-[var(--rpg-blue-light)]` (teal). `mana` color already exists (maps to `--rpg-blue-light`). If they'd look identical, use a different shade — check the color palette in `docs/assets/color-palette.md`. If no teal exists, use `bg-teal-400` for stamina and keep `mana` on `--rpg-blue-light`.

**Step 2: Add stamina/mana to Dashboard props**

In `DashboardProps.playerData`, add:
```typescript
currentStamina: number;
maxStamina: number;
staminaRegenRate: number;
currentMana: number;
maxMana: number;
manaRegenRate: number;
```

**Step 3: Render stamina + mana bars**

Below the HP bar section in `Dashboard.tsx`, add:

```tsx
{/* Stamina */}
<div className="flex items-center gap-2">
  <span className="text-xs text-[var(--rpg-text-secondary)] w-10">Stam</span>
  <div className="flex-1">
    <StatBar current={playerData.currentStamina} max={playerData.maxStamina} color="stamina" size="sm" showNumbers={false} />
  </div>
  <span className="text-xs text-[var(--rpg-text-secondary)]">
    {playerData.currentStamina}/{playerData.maxStamina}
  </span>
</div>

{/* Mana */}
<div className="flex items-center gap-2">
  <span className="text-xs text-[var(--rpg-text-secondary)] w-10">Mana</span>
  <div className="flex-1">
    <StatBar current={playerData.currentMana} max={playerData.maxMana} color="mana" size="sm" showNumbers={false} />
  </div>
  <span className="text-xs text-[var(--rpg-text-secondary)]">
    {playerData.currentMana}/{playerData.maxMana}
  </span>
</div>
```

**Step 4: Thread stamina/mana from controller to Dashboard in page.tsx**

In the `case 'home'` section of `renderScreen()`, add to the `playerData` object:
```typescript
currentStamina: staminaState.current,
maxStamina: staminaState.max,
staminaRegenRate: staminaState.regenPerSecond,
currentMana: manaState.current,
maxMana: manaState.max,
manaRegenRate: manaState.regenPerSecond,
```

**Step 5: Build and verify**

Run: `npm run build:web`

**Step 6: Commit**

```
feat(web): add stamina and mana resource bars to Dashboard
```

---

## Task 3: Template Editor — API Layer

**Files:**
- Create: `apps/web/src/lib/api/templates.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Create template API functions**

Backend routes:
- `GET /api/v1/templates` → `{ templates: CombatTemplateData[] }`
- `POST /api/v1/templates` → `CombatTemplateData`
- `GET /api/v1/templates/active` → `{ actions: CombatTemplateAction[] }`
- `PATCH /api/v1/templates/:id` → `CombatTemplateData`
- `DELETE /api/v1/templates/:id` → `{ success: true }`
- `POST /api/v1/templates/:id/activate` → `{ success: true }`

Create `apps/web/src/lib/api/templates.ts`:

```typescript
import { fetchApi } from './core';

export interface TemplateAction {
  actionId: string;
  label?: string;
}

export interface TemplateResponse {
  id: string;
  playerId: string;
  name: string;
  isActive: boolean;
  actions: TemplateAction[];
  createdAt: string;
  updatedAt: string;
}

export async function getTemplates() {
  return fetchApi<{ templates: TemplateResponse[] }>('/api/v1/templates');
}

export async function getActiveTemplate() {
  return fetchApi<{ actions: TemplateAction[] }>('/api/v1/templates/active');
}

export async function createTemplate(name: string, actions: TemplateAction[]) {
  return fetchApi<TemplateResponse>('/api/v1/templates', {
    method: 'POST',
    body: JSON.stringify({ name, actions }),
  });
}

export async function updateTemplate(id: string, name?: string, actions?: TemplateAction[]) {
  return fetchApi<TemplateResponse>(`/api/v1/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, actions }),
  });
}

export async function deleteTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}`, { method: 'DELETE' });
}

export async function activateTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}/activate`, { method: 'POST' });
}
```

**Step 2: Export from barrel**

Add exports to `apps/web/src/lib/api/index.ts`.

**Step 3: Build and commit**

```
feat(web): add template CRUD API layer
```

---

## Task 4: Template Editor — Screen Component

**Files:**
- Create: `apps/web/src/components/screens/Templates.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` (add `'templates'` to Screen type, `getActiveTab`, state + handlers)
- Modify: `apps/web/src/app/game/page.tsx` (add case for `'templates'`)

**Step 1: Add screen routing**

In `useGameController.ts`:
1. Add `'templates'` to the `Screen` type union
2. Add `'templates'` to the `combat` array in `getActiveTab()`
3. Add template state and handlers:
```typescript
const [templates, setTemplates] = useState<TemplateResponse[]>([]);
const handleLoadTemplates = useCallback(async () => {
  const res = await getTemplates();
  if (res.data) setTemplates(res.data.templates);
}, []);
```
4. Expose `templates`, `handleLoadTemplates`, and the template API functions in the controller return

**Step 2: Create Templates.tsx**

Build the screen with two views: **list** (default) and **editor** (when a template is selected for editing).

**List view:**
- Header with title + "+ New Template" button
- Each template as a `PixelCard`: star icon if active, name, action count, [Edit] [Activate] [Delete] buttons
- Activate calls `activateTemplate(id)` then reloads

**Editor view (inline replace):**
- Template name input field
- Ordered slot list: each slot shows action name (from `BASE_ACTION_DEFINITIONS` lookup), category badge color, stamina/mana cost. Up/Down/Remove buttons
- "Add Action" button opens a modal/dropdown action picker
- Action picker: lists all `BASE_ACTION_DEFINITIONS` entries grouped by category. Locked entries (not in `unlockedActions`) shown greyed with lock icon
- Resource preview section: compute total stamina/mana cost per cycle, compare with regen per round, show "Sustain: N rounds before exhaustion" or "Sustainable" if cost <= regen
- Save and Cancel buttons

The component imports `BASE_ACTION_DEFINITIONS` from `@adventure/shared` for client-side action lookups.

**Step 3: Wire in page.tsx**

Add `case 'templates':` in `renderScreen()`:
```tsx
case 'templates':
  return <Templates
    templates={templates}
    unlockedActions={skillPointState?.unlockedActions ?? []}
    staminaState={staminaState}
    manaState={manaState}
    onLoadTemplates={handleLoadTemplates}
    onNavigate={setActiveScreen}
  />;
```

**Step 4: Build and commit**

```
feat(web): add combat template editor screen
```

---

## Task 5: Skill Tree — API Layer + State

**Files:**
- Create: `apps/web/src/lib/api/skillPoints.ts`
- Modify: `apps/web/src/lib/api/index.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create skill point API functions**

Backend routes:
- `GET /api/v1/skillpoints` → `{ totalPointsEarned, totalPointsSpent, availablePoints, allocations, unlockedActions, trees }`
- `POST /api/v1/skillpoints/allocate` → same shape
- `POST /api/v1/skillpoints/respec` → same shape

Create `apps/web/src/lib/api/skillPoints.ts`:

```typescript
import { fetchApi } from './core';
import type { TalentNodeDefinition } from '@adventure/shared';

export interface SkillPointState {
  totalPointsEarned: number;
  totalPointsSpent: number;
  availablePoints: number;
  allocations: Record<string, number>;
  unlockedActions: string[];
  trees: Record<string, TalentNodeDefinition[]>;
}

export async function getSkillPointState() {
  return fetchApi<SkillPointState>('/api/v1/skillpoints');
}

export async function allocateSkillPoint(nodeId: string) {
  return fetchApi<SkillPointState>('/api/v1/skillpoints/allocate', {
    method: 'POST',
    body: JSON.stringify({ nodeId }),
  });
}

export async function respecSkillPoints() {
  return fetchApi<SkillPointState>('/api/v1/skillpoints/respec', { method: 'POST' });
}
```

**Step 2: Export from barrel**

**Step 3: Add state to controller**

```typescript
const [skillPointState, setSkillPointState] = useState<SkillPointState | null>(null);

const handleLoadSkillPoints = useCallback(async () => {
  const res = await getSkillPointState();
  if (res.data) setSkillPointState(res.data);
}, []);
```

Add `getSkillPointState()` to `loadAll()`. Expose state + handlers.

**Step 4: Build and commit**

```
feat(web): add skill point API layer and controller state
```

---

## Task 6: Skill Tree — Screen Component

**Files:**
- Create: `apps/web/src/components/screens/TalentTree.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` (add `'talentTree'` to Screen + getActiveTab)
- Modify: `apps/web/src/app/game/page.tsx` (add case)

**Step 1: Add screen routing**

Add `'talentTree'` to `Screen` type and to `combat` array in `getActiveTab()`.

**Step 2: Create TalentTree.tsx**

Props:
```typescript
interface TalentTreeProps {
  skillPointState: SkillPointState;
  skills: Array<{ name: string; level: number }>;
  onAllocate: (nodeId: string) => Promise<void>;
  onRespec: () => Promise<void>;
  onNavigate: (screen: string) => void;
}
```

Layout:
- Header: "Skill Points: N available" with point count badge
- Four tree tabs: Melee / Ranged / Magic / General
- For each tree, group nodes by `tier` (1-5)
- Tier header: "Tier N" + skill level gate if applicable (e.g., "Requires Melee Lv 35")
- Each node row: lock/unlock icon, name, cost badge, description text, allocate button (only enabled if affordable and prerequisites met)
- Unlocked nodes: green checkmark, allocated point count shown
- Locked nodes: lock icon, grey text, prerequisite text below
- Affordable but unallocated: highlight border, enabled button
- Nodes that unlock an action: show action name in accent color
- Respec button at bottom: "Respec (500 turns)" with confirmation dialog

Gating logic (computed from `allocations`, `availablePoints`, node `prerequisites`, and skill levels — all available client-side from the `SkillPointState.trees` definitions):
- Tier N requires 2+ allocations in tier N-1
- Node requires all `prerequisites` IDs present in `allocations`
- Skill level gate: compare player skill level from `skills` prop

**Step 3: Wire in page.tsx**

```tsx
case 'talentTree':
  return <TalentTree
    skillPointState={skillPointState!}
    skills={skills}
    onAllocate={handleAllocateSkillPoint}
    onRespec={handleRespecSkillPoints}
    onNavigate={setActiveScreen}
  />;
```

**Step 4: Build and commit**

```
feat(web): add talent tree screen with tiered node layout
```

---

## Task 7: Combat Playback Updates

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts` (extend `CombatLogEntryResponse`)
- Modify: `apps/web/src/components/combat/CombatLogEntry.tsx`
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx`

**Step 1: Extend CombatLogEntryResponse**

Add optional fields to `CombatLogEntryResponse` in `api/combat.ts`:

```typescript
actionId?: string;
actionName?: string;
wasExhausted?: boolean;
staminaAfter?: number;
manaAfter?: number;
staminaCost?: number;
manaCost?: number;
interactionResult?: string;  // 'countered' | 'warded' | 'defended' | null
```

All optional — old combat logs won't have these.

**Step 2: Update CombatLogEntry.tsx**

- If `entry.actionName` exists, show it as the primary label (e.g., "Heavy Attack" instead of "attack")
- Color the action name by category: look up in `BASE_ACTION_DEFINITIONS` if available, else infer from `entry.action` field
- If `entry.interactionResult === 'countered'`, show "Countered!" badge in yellow
- If `entry.interactionResult === 'warded'`, show "Warded!" badge in purple
- If `entry.wasExhausted`, show "(Exhausted → Defend)" in muted text
- In expanded detail view: show stamina/mana cost if present

**Step 3: Update CombatPlayback.tsx**

- Below each combatant's HP bar, conditionally render small stamina + mana bars (only when `log[0]?.staminaAfter !== undefined` — indicates resource data exists)
- Use `StatBar` with `size="sm"` for these mini-bars
- Update resource bars as rounds reveal, reading from `currentEntry.staminaAfter` / `currentEntry.manaAfter`
- Action flash label: use `actionName ?? action` for display text

**Step 4: Build and commit**

```
feat(web): show action names, interaction results, and resource bars in combat playback
```

---

## Task 8: Boss Panel — API Type Updates

**Files:**
- Modify: `apps/web/src/lib/api/social.ts`

**Step 1: Update BossEncounterResponse**

Remove `raidPoolHp`, `raidPoolMax`. Add `bossEffects`:

```typescript
export interface BossEncounterResponse {
  // ... existing fields ...
  // REMOVE: raidPoolHp, raidPoolMax
  bossEffects?: Array<{ name: string; stat: string; modifier: number; roundsRemaining: number }>;
  // ... rest unchanged ...
}
```

**Step 2: Update BossParticipantResponse**

Remove `role`. Add resource fields:

```typescript
export interface BossParticipantResponse {
  // ... existing fields ...
  // REMOVE: role
  currentStamina: number;
  currentMana: number;
  threat: number;
  damageAbsorbed: number;
  templateRound: number;
  // ... rest unchanged ...
}
```

**Step 3: Update BossRoundSummary**

```typescript
export interface BossRoundSummary {
  round: number;
  bossDamage: number;
  totalPlayerDamage: number;
  bossHpPercent: number;
  // REMOVE: raidPoolPercent
  playersAlive: number;
  playersDead: number;
}
```

**Step 4: Update signUpForBoss**

Remove `role` parameter:

```typescript
export async function signUpForBoss(id: string, autoSignUp = false) {
  return fetchApi<{ participant: BossParticipantResponse }>(`/api/v1/boss/${id}/signup`, {
    method: 'POST',
    body: JSON.stringify({ autoSignUp }),
  });
}
```

**Step 5: Build and commit**

```
fix(web): update boss API types for individual HP model
```

---

## Task 9: Boss Panel — UI Rework

**Files:**
- Modify: `apps/web/src/components/BossEncounterPanel.tsx`
- Modify: `apps/web/src/components/screens/BossHistory.tsx`

**Step 1: Remove role picker from BossEncounterPanel**

- Delete `role` state and the attacker/healer toggle buttons
- Replace with active template display: fetch `getActiveTemplate()` on mount, show "Active: {templateName} ({actionCount}r)" with a "Change Template" button that calls `onClose()` and navigates to templates screen (or just shows the name as info)
- Update `signUpForBoss` call to remove `role` argument

**Step 2: Remove raid pool bar**

- Delete the `raidPoolHp`/`raidPoolMax` conditional section
- Delete `raidPoolPercent` from round summary rendering

**Step 3: Update participant display**

- Remove `role` column
- Add small inline stamina/mana bars per participant (use `StatBar` with `size="sm"`)
- Show threat value with shield icon. Highlight the aggro holder (highest threat among alive participants)
- Show `damageAbsorbed` in participant stats
- Show template round indicator ("R3/6")

**Step 4: Update round summaries**

- Replace `raidPoolPercent` with `playersAlive`/`playersDead` display (e.g., "5 alive, 1 dead")
- Show boss effect badges if `bossEffects` is non-empty

**Step 5: Update defeated summary**

- Add `damageAbsorbed` column to top contributors table

**Step 6: Update BossHistory.tsx**

- Remove `raidPoolPercent` from round-by-round breakdown
- Add `playersAlive`/`playersDead` to round details
- Remove any `role` references

**Step 7: Build and commit**

```
feat(web): rework boss encounter panel for individual HP model
```

---

## Task 10: Bestiary Boss Rotation Reveal

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx`
- Modify: `apps/web/src/lib/api/player.ts` (add `bossRotation` to bestiary Monster type)

**Step 1: Extend Monster type**

In the bestiary `Monster` type (wherever it's defined — likely inline in Bestiary.tsx or in the controller), add:

```typescript
bossRotation?: {
  totalRounds: number;
  revealedRounds: number;
  actions: Array<{
    round: number;
    actionName: string;
    targetMode: 'single_target' | 'aoe';
    isTelegraphed: boolean;
  }>;
};
```

**Step 2: Add boss rotation section to monster detail modal**

In `Bestiary.tsx`, inside the monster detail modal (after drops section), conditionally render when `selectedMonster.bossRotation` exists:

```tsx
{selectedMonster.bossRotation && (
  <div className="mt-4">
    <h4 className="text-sm font-bold text-[var(--rpg-gold)] mb-2">
      Boss Rotation ({selectedMonster.bossRotation.revealedRounds}/{selectedMonster.bossRotation.totalRounds} revealed)
    </h4>
    <StatBar
      current={selectedMonster.bossRotation.revealedRounds}
      max={selectedMonster.bossRotation.totalRounds}
      color="xp" size="sm"
    />
    <div className="mt-2 space-y-1">
      {Array.from({ length: selectedMonster.bossRotation.totalRounds }, (_, i) => {
        const action = selectedMonster.bossRotation!.actions.find(a => a.round === i + 1);
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-[var(--rpg-text-secondary)] w-8">R{i + 1}</span>
            {action ? (
              <>
                <span className={action.isTelegraphed ? 'text-[var(--rpg-red)] font-bold' : 'text-[var(--rpg-text)]'}>
                  {action.actionName}
                </span>
                <span className="text-[var(--rpg-text-secondary)]">
                  ({action.targetMode === 'aoe' ? 'AoE' : 'Single'})
                </span>
              </>
            ) : (
              <span className="text-[var(--rpg-text-secondary)]">???</span>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}
```

**Step 3: Thread bossRotation from API through controller**

The bestiary API already returns `bossRotation` from the backend (added in the boss rework). Ensure the controller's bestiary mapping passes it through to the `Monster` type used by `Bestiary.tsx`.

**Step 4: Build and commit**

```
feat(web): add progressive boss rotation reveal to bestiary
```

---

## Verification Checklist

After completing all 10 tasks:

1. `npm run build:web` — builds without errors
2. `npm run typecheck` — no TS errors
3. Manual test: Dashboard shows HP, Stamina, Mana bars updating in real-time
4. Manual test: Templates screen lists templates, can create/edit/delete/activate
5. Manual test: Template editor shows action picker, resource preview, sustain estimate
6. Manual test: Talent tree shows nodes by tier, can allocate/respec
7. Manual test: Combat playback shows action names and resource mini-bars
8. Manual test: Boss panel shows no role picker, displays active template on signup
9. Manual test: Boss participants show stamina/mana/threat/damageAbsorbed
10. Manual test: Bestiary boss detail shows rotation reveal progress
