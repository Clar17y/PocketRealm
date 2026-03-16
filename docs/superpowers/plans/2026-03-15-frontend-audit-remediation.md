# Frontend Audit Remediation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ~100 actionable issues found by the overnight frontend audit across 147 components — covering bugs, missing error handling, confirmation safeguards, race conditions, hardcoded constants, loading flash UX, and accessibility gaps.

**Architecture:** Pattern-based sweeps. Each chunk targets one cross-cutting pattern (e.g., "all missing error handlers") rather than fixing one component at a time. This minimises context-switching and produces consistent fixes. Changes are purely frontend (`apps/web/src/`), with no backend or game-engine modifications.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS, existing shared components (ConfirmModal, SubNav, useAsyncAction, TurnPresets).

**Source:** `docs/loop-v2/frontend/tracker.md` — full audit reports in `docs/loop-v2/frontend/`.

---

## File Map

Key existing files referenced throughout:

| File | Role |
|------|------|
| `apps/web/src/components/common/ConfirmModal.tsx` | Themed confirmation dialog (title, message, variant, confirmLabel) |
| `apps/web/src/components/common/SubNav.tsx` | Tab bar component (tabs[], activeId, onSelect) |
| `apps/web/src/components/common/TurnPresets.tsx` | Quick turn-selection buttons (presets[], currentValue, onChange) |
| `apps/web/src/hooks/useAsyncAction.ts` | Managed async state (loading, error, run, clearError) |
| `apps/web/src/hooks/useToastQueue.ts` | Toast notification queue |
| `packages/shared/src/constants/gameConstants.ts` | All game constants (DURABILITY_, STAMINA_, MANA_, HP_, WORLD_EVENT_) |

---

## Chunk 1: Critical Fixes & Hardcoded Constants

These are correctness bugs — wrong behaviour or wrong values displayed to players.

### Task 1: Fix array mutation in GuildExpeditionsTab

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

The `members.sort()` call mutates the prop array in place during render, causing unpredictable re-renders and stale parent references.

- [ ] **Step 1: Find and fix the sort mutation**

Search for `.sort(` in the file. Replace:
```typescript
members.sort(...)
```
with:
```typescript
[...members].sort(...)
```
(or `.toSorted(...)` if the project targets ES2023+, but spread is safer)

- [ ] **Step 2: Verify no other in-place mutations**

Search the same file for `.reverse()`, `.splice(`, `.sort(` to ensure no other prop mutations exist.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```
fix: prevent prop mutation from members.sort() in GuildExpeditionsTab
```

---

### Task 2: Add confirmation dialogs to Forge upgrade & reroll

**Files:**
- Modify: `apps/web/src/components/screens/Forge.tsx`

Upgrade failure can **destroy both items**. Reroll permanently replaces all bonus stats. These are the most consequential item operations in the game and currently execute immediately on click with zero safeguard.

- [ ] **Step 1: Add confirmation state variables**

Add two state variables at the top of the component:
```typescript
const [confirmUpgrade, setConfirmUpgrade] = useState(false);
const [confirmReroll, setConfirmReroll] = useState(false);
```

- [ ] **Step 2: Gate the upgrade handler behind confirmation**

Change the upgrade button's `onClick` from calling the upgrade handler directly to `() => setConfirmUpgrade(true)`.

- [ ] **Step 3: Gate the reroll handler behind confirmation**

Same pattern for reroll: button sets `setConfirmReroll(true)`.

- [ ] **Step 4: Render ConfirmModal for upgrade**

```tsx
{confirmUpgrade && (
  <ConfirmModal
    title="Confirm Upgrade"
    message="If the upgrade fails, both items will be destroyed. This cannot be undone."
    confirmLabel="Upgrade"
    variant="danger"
    onConfirm={() => { setConfirmUpgrade(false); handleUpgrade(); }}
    onCancel={() => setConfirmUpgrade(false)}
  />
)}
```

- [ ] **Step 5: Render ConfirmModal for reroll**

```tsx
{confirmReroll && (
  <ConfirmModal
    title="Confirm Reroll"
    message="All current bonus stats will be permanently replaced with new random stats."
    confirmLabel="Reroll"
    variant="warning"
    onConfirm={() => { setConfirmReroll(false); handleReroll(); }}
    onCancel={() => setConfirmReroll(false)}
  />
)}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add confirmation dialogs to Forge upgrade and reroll operations
```

---

### Task 3: Add confirmation dialog to Templates delete

**Files:**
- Modify: `apps/web/src/components/screens/Templates.tsx`

Templates require significant player investment. Delete is currently instant with no confirmation.

- [ ] **Step 1: Add confirmation state**

```typescript
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
```

- [ ] **Step 2: Gate delete behind confirmation**

Change delete button's `onClick` to `() => setConfirmDeleteId(template.id)`.

- [ ] **Step 3: Render ConfirmModal**

```tsx
{confirmDeleteId && (
  <ConfirmModal
    title="Delete Template?"
    message="This combat template will be permanently deleted."
    confirmLabel="Delete"
    variant="danger"
    onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); handleDelete(id); }}
    onCancel={() => setConfirmDeleteId(null)}
  />
)}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add confirmation dialog to template deletion
```

---

### Task 4: Replace hardcoded constants in Inventory repair buttons

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx`

The repair button text shows hardcoded `"Fix (150)"` and `"Repair (100)"` instead of sourcing from `DURABILITY_CONSTANTS`.

- [ ] **Step 1: Add import**

```typescript
import { DURABILITY_CONSTANTS } from '@pocketrealm/shared';
```

(May already be imported — check first.)

- [ ] **Step 2: Replace hardcoded text**

Find the repair button label (around line 894):
```tsx
{selectedItem.durability && selectedItem.durability.current <= 0 ? 'Fix (150)' : 'Repair (100)'}
```

Replace with:
```tsx
{selectedItem.durability && selectedItem.durability.current <= 0
  ? `Fix (${DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST})`
  : `Repair (${DURABILITY_CONSTANTS.REPAIR_TURN_COST})`}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
fix: use DURABILITY_CONSTANTS for repair button labels in Inventory
```

---

### Task 5: Replace hardcoded constants in BossEncounterPanel

**Files:**
- Modify: `apps/web/src/components/BossEncounterPanel.tsx`

The signup button shows hardcoded `"200 turns"` instead of using `WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST` (defined at `packages/shared/src/constants/gameConstants.ts:687`).

- [ ] **Step 1: Add import**

```typescript
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Replace hardcoded signup cost**

Find (around line 334):
```tsx
{signing ? 'Signing up...' : 'Sign Up (200 turns)'}
```

Replace with:
```tsx
{signing ? 'Signing up...' : `Sign Up (${WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST} turns)`}
```

- [ ] **Step 3: Check for hardcoded stamina=100 / mana=50 in stat bars**

The file has `<StatBar max={100} />` and `<StatBar max={50} />` (around lines 447/454) for stamina/mana. These are a **data problem** — the correct max depends on the player's skill levels, not just `BASE_POOL`. Skip replacing with constants. Instead, add a `// TODO: API should return maxStamina/maxMana per participant` comment so the backend fix is tracked.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: use WORLD_EVENT_CONSTANTS for boss signup cost in BossEncounterPanel
```

---

### Task 6: Replace hardcoded resource defaults in useGameController

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

Initial state uses hardcoded `{ current: 100, max: 100 }` for stamina and `{ current: 50, max: 50 }` for mana (lines 255-256). These are placeholder defaults overwritten on first API load, so this is low-risk but should reference constants for clarity.

- [ ] **Step 1: Add imports**

```typescript
import { STAMINA_CONSTANTS, MANA_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Replace defaults**

```typescript
const [staminaState, setStaminaState] = useState<ResourceState>({
  current: STAMINA_CONSTANTS.BASE_POOL, max: STAMINA_CONSTANTS.BASE_POOL,
  regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 5
});
const [manaState, setManaState] = useState<ResourceState>({
  current: MANA_CONSTANTS.BASE_POOL, max: MANA_CONSTANTS.BASE_POOL,
  regenPerRound: 5, regenPerSecond: 0.5, restHealPerTurn: 3
});
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
fix: use shared constants for default stamina/mana in useGameController
```

---

### Task 7: Replace hardcoded recovery percent in Rest

**Files:**
- Modify: `apps/web/src/components/screens/Rest.tsx`

Line 175 displays `Math.floor(hpState.maxHp * 0.25)` with a hardcoded `0.25` multiplier. Line 214 has a preset `{ label: '25%', pct: 0.25 }`. Both should reference `HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT`.

- [ ] **Step 1: Add import**

```typescript
import { HP_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Replace hardcoded 0.25 on line 175**

```tsx
// Before:
{Math.floor(hpState.maxHp * 0.25)} / {hpState.maxHp}
// After:
{Math.floor(hpState.maxHp * HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT)} / {hpState.maxHp}
```

- [ ] **Step 3: Replace hardcoded preset on line 214**

```tsx
// Before:
{ label: '25%', pct: 0.25 },
// After:
{ label: `${Math.round(HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT * 100)}%`, pct: HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT },
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: use HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT in Rest screen
```

---

## Chunk 2: Error Handling Sweep

17 async handlers lack try/catch, leaving UI permanently stuck in loading/busy state on network failure. Two approaches apply:

**Approach A — `useAsyncAction` migration:** Best for handlers in components that don't already manage their own loading/error state. Provides `{ loading, error, run, clearError }` in one hook.

**Approach B — manual try/catch/finally:** Better for components with existing state management. Add try/catch around the API call, set error state in catch, ensure loading is reset in finally.

**Pattern (Approach B):**
```typescript
const handleAction = async () => {
  setLoading(true);
  setError(null);
  try {
    const result = await api.doThing();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    // success handling
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Something went wrong');
  } finally {
    setLoading(false);
  }
};
```

### Task 8: Fix error handling in TrainingGrounds

**Files:**
- Modify: `apps/web/src/components/screens/TrainingGrounds.tsx`

`handleFight` — button stuck in "Fighting..." permanently on network failure.

- [ ] **Step 1: Wrap handleFight in try/catch/finally**

Find the `handleFight` function. Ensure it has:
- `try` around the API call
- `catch` that sets an error message (add `setError` state if not present)
- `finally` that resets the loading/busy state

- [ ] **Step 2: Display error to user**

If there's no error display in the JSX, add one near the action button:
```tsx
{error && <p className="text-sm text-[var(--rpg-red)] mt-2">{error}</p>}
```

- [ ] **Step 3: Typecheck and commit (with Tasks 9-10)**

Tasks 8, 9, and 10 can be committed together after all are complete.

---

### Task 9: Fix error handling in Rest

**Files:**
- Modify: `apps/web/src/components/screens/Rest.tsx`

`handleRest` and `handleRecover` — buttons stuck in loading state on failure. The file already has error state but check that catch blocks properly reset loading.

- [ ] **Step 1: Verify try/catch/finally pattern**

Check both `handleRest` and `handleRecover`. Ensure each has a `finally` block that resets loading state. If using `setIsLoading(false)` only in the success path, move it to `finally`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

---

### Task 10: Fix error handling — combat & event screens

**Files:**
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx` — rankings fetch effect
- Modify: `apps/web/src/components/BossEncounterPanel.tsx` — `handleSignup`
- Modify: `apps/web/src/components/screens/WorldEvents.tsx` — `refresh`
- Modify: `apps/web/src/components/screens/Casino.tsx` — `fetchRound` / `fetchHistory`
- Modify: `apps/web/src/components/screens/Templates.tsx` — `handleActivate` / `handleDelete`

Apply the Approach B pattern from the chunk intro to each handler:

- [ ] **Step 1: Fix ArenaScreen rankings fetch**

Find the `useEffect` that fetches rankings. Wrap the async call in try/catch. In catch: `setError(err instanceof Error ? err.message : 'Failed to load rankings')`. In finally: `setLoading(false)`. Add error display JSX if absent:
```tsx
{error && <p className="text-sm text-[var(--rpg-red)]">{error}</p>}
```

- [ ] **Step 2: Fix BossEncounterPanel handleSignup**

Find `handleSignup`. Wrap API call in try/catch. In catch: set error state. In finally: `setSigning(false)` (ensure button re-enables). Add error display near the signup button.

- [ ] **Step 3: Fix WorldEvents refresh**

Find `refresh` or the data-fetching function. Wrap in try/catch. In finally: `setLoading(false)`.

- [ ] **Step 4: Fix Casino fetchRound / fetchHistory**

Find both async functions. Wrap each in try/catch/finally. Add `const [error, setError] = useState<string | null>(null)` if absent. Show error in JSX.

- [ ] **Step 5: Fix Templates handleActivate / handleDelete**

Find both handlers. Wrap in try/catch. In catch: `setError(err instanceof Error ? err.message : 'Action failed')`. Add error display in JSX.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

---

### Task 11: Fix error handling — guild & social components

**Files:**
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx` — `loadProjects` / `loadResourceItems` have empty catch blocks
- Modify: `apps/web/src/components/guild/GuildSpecializationTab.tsx` — `loadSpec` has empty catch
- Modify: `apps/web/src/components/guild/ExpeditionShopTab.tsx` — `loadShop` / `handlePurchase` have no catch
- Modify: `apps/web/src/components/friends/FriendProfileModal.tsx` — `handleConfirmAction` has empty catch
- Modify: `apps/web/src/components/screens/Inventory.tsx` — 6 batch action handlers have no error feedback

- [ ] **Step 1: Fix GuildProjectsTab**

Find `loadProjects` and `loadResourceItems`. Replace empty `catch {}` blocks with:
```typescript
catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Failed to load');
}
```
Add `finally { setLoading(false); }` if missing.

- [ ] **Step 2: Fix GuildSpecializationTab**

Same pattern: replace empty catch in `loadSpec`.

- [ ] **Step 3: Fix ExpeditionShopTab**

Add try/catch to `loadShop` and `handlePurchase`. Set error state in catch.

- [ ] **Step 4: Fix FriendProfileModal**

Replace empty catch in `handleConfirmAction` with error state. Add error display near the action buttons.

- [ ] **Step 5: Fix Inventory batch actions**

Find the batch action handlers (sell, salvage, equip, etc.). Wrap each in try/catch. In catch, show feedback:
```typescript
catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Action failed');
}
```

- [ ] **Step 6: Typecheck and commit (Tasks 8-11 together)**

Run: `npm run typecheck`
```
fix: add error handling to async handlers across 12 frontend components
```

---

## Chunk 3: Confirmation Dialogs & UX Safeguards

### Task 12: Add confirmation to FriendsScreen remove/block

**Files:**
- Modify: `apps/web/src/components/screens/FriendsScreen.tsx`

Remove friend and block player are permanent actions with no confirmation.

- [ ] **Step 1: Add confirmation state**

```typescript
const [confirmAction, setConfirmAction] = useState<{ type: 'remove' | 'block'; friendId: string; name: string } | null>(null);
```

- [ ] **Step 2: Gate remove/block behind confirmation**

Change the remove and block button handlers to set `confirmAction` instead of executing immediately.

- [ ] **Step 3: Render ConfirmModal**

```tsx
{confirmAction && (
  <ConfirmModal
    title={confirmAction.type === 'remove' ? 'Remove Friend?' : 'Block Player?'}
    message={confirmAction.type === 'remove'
      ? `Remove ${confirmAction.name} from your friends list?`
      : `Block ${confirmAction.name}? They won't be able to send you messages or friend requests.`}
    confirmLabel={confirmAction.type === 'remove' ? 'Remove' : 'Block'}
    variant="danger"
    onConfirm={() => {
      const { type, friendId } = confirmAction;
      setConfirmAction(null);
      type === 'remove' ? handleRemove(friendId) : handleBlock(friendId);
    }}
    onCancel={() => setConfirmAction(null)}
  />
)}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add confirmation dialogs to friend remove and block actions
```

---

### Task 13: Add confirmation to MailScreen delete

**Files:**
- Modify: `apps/web/src/components/screens/MailScreen.tsx`

Mail deletion is permanent with no confirmation.

- [ ] **Step 1: Add confirmation state**

```typescript
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
```

- [ ] **Step 2: Gate delete behind confirmation**

Change the delete button's `onClick` to `() => setConfirmDeleteId(mail.id)`.

- [ ] **Step 3: Render ConfirmModal**

```tsx
{confirmDeleteId && (
  <ConfirmModal
    title="Delete Mail?"
    message="This message will be permanently deleted."
    confirmLabel="Delete"
    variant="danger"
    onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); handleDelete(id); }}
    onCancel={() => setConfirmDeleteId(null)}
  />
)}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add confirmation dialog to mail deletion
```

---

### Task 14: Replace native confirm() with ConfirmModal in guild components

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` — 4 actions:
  - Line 301: Launch expedition (`Launch Tier ${tier} expedition?`)
  - Line 334: Force start (`Force start the expedition now?`)
  - Line 366: Auto-resolve (`Auto-resolve this room?`)
  - Line 448: Abandon expedition (`Abandon this expedition?`)
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx` — project start uses `confirm()`
- Modify: `apps/web/src/components/guild/GuildSpecializationTab.tsx` — 2 actions use `confirm()`
- Modify: `apps/web/src/components/guild/GuildSettings.tsx` — disband uses `confirm()`

- [ ] **Step 1: Search each file for `confirm(`**

Find all usages of native `window.confirm()` or `confirm()`. Expected: 4 in GuildExpeditionsTab, 1 in GuildProjectsTab, 2 in GuildSpecializationTab, 1 in GuildSettings.

- [ ] **Step 2: For each usage, apply the ConfirmModal pattern**

For each `confirm()` call:
1. Add a state variable (e.g., `const [confirmX, setConfirmX] = useState(false)`)
2. Replace the `if (confirm(...))` guard with `setConfirmX(true); return;`
3. Add a `<ConfirmModal>` that calls the original action on confirm

When a component has multiple confirm actions, use a discriminated union state:
```typescript
const [pendingConfirm, setPendingConfirm] = useState<
  { type: 'abandon'; expeditionId: string } |
  { type: 'kick'; memberId: string } |
  null
>(null);
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
fix: replace native confirm() with themed ConfirmModal in guild components
```

---

### Task 15: Fix loading flash on actions

**Files:**
- Modify: `apps/web/src/components/screens/FriendsScreen.tsx`
- Modify: `apps/web/src/components/BossEncounterPanel.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

After accept/decline/remove/signup/etc., calling refresh sets `loading=true` which replaces the entire screen with a loading spinner. Fix by using a separate `refreshing` state that doesn't hide content.

- [ ] **Step 1: Add refreshing state (per file)**

```typescript
const [refreshing, setRefreshing] = useState(false);
```

- [ ] **Step 2: Use refreshing instead of loading for post-action refreshes**

In the refresh function called after actions, use `setRefreshing(true/false)` instead of `setLoading(true/false)`. Keep `loading` only for the initial load.

- [ ] **Step 3: Show subtle refresh indicator instead of full spinner**

Replace the loading gate:
```tsx
// Before: if (loading) return <Spinner />;
// After:
if (loading && !data) return <Spinner />;  // Only show spinner on initial load
// Optionally show a subtle indicator:
{refreshing && <div className="text-xs text-[var(--rpg-text-secondary)] animate-pulse">Refreshing...</div>}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: prevent full-screen loading flash on post-action refreshes
```

---

## Chunk 4: Race Condition Fixes

### Task 16: Add cancellation flags to async effects

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` — history page + detail expansion
- Modify: `apps/web/src/hooks/useChat.ts` — zone history fetch on rapid zone switching
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx` — combat log fetch
- Modify: `apps/web/src/components/screens/Casino.tsx` — heat map toggle
- Modify: `apps/web/src/app/game/useGameController.ts` — `handleNavigate` async skips

The codebase already uses the `cancelled` flag pattern (see `Rest.tsx` lines 48-58). Apply the same pattern:

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    const result = await api.fetchData(param);
    if (cancelled) return;  // Stale response — discard
    setData(result.data);
  })();
  return () => { cancelled = true; };
}, [param]);
```

- [ ] **Step 1: Fix GuildExpeditionsTab race conditions**

Find async effects that fetch history or detail data. Add `cancelled` flag + cleanup return.

- [ ] **Step 2: Fix useChat zone history race**

Find the effect that fetches chat history on zone change. Add `cancelled` flag.

- [ ] **Step 3: Fix TurnPlayback combat log race**

Find the effect that fetches combat log data. Add `cancelled` flag.

- [ ] **Step 4: Fix Casino heat map race**

Find the heat map toggle handler or effect. Add `cancelled` flag if it's an effect, or check for component unmount if it's a handler.

- [ ] **Step 5: Fix useGameController handleNavigate**

`handleNavigate` calls async skip functions without awaiting. Either await them or add cancelled/mounted checks so results don't update state after navigation.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add cancellation flags to prevent stale async updates in 5 components
```

---

## Chunk 5: Accessibility Foundations

### Task 17: Enhance SubNav with ARIA tab roles

**Files:**
- Modify: `apps/web/src/components/common/SubNav.tsx`

The SubNav component renders tab-like buttons but lacks ARIA semantics. This is the foundation for fixing all 12 tab-bar accessibility issues.

- [ ] **Step 1: Read SubNav.tsx**

Read the full component to understand its structure.

- [ ] **Step 2: Add ARIA roles to SubNav**

Add to the container `<div>` or `<nav>`:
```tsx
<div role="tablist" aria-label={ariaLabel}>
```

Add to each tab button:
```tsx
<button
  role="tab"
  aria-selected={tab.id === activeId}
  id={`tab-${tab.id}`}
  // ... existing props
>
```

- [ ] **Step 3: Add ariaLabel prop**

```typescript
interface SubNavProps {
  tabs: SubNavTab[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;  // New optional prop
}
```

Default to `"Navigation tabs"` if not provided.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
feat: add ARIA tab roles to SubNav component
```

---

### Task 18: Migrate hand-rolled tabs to SubNav

**Files to check and migrate where practical:**
- `apps/web/src/components/screens/MailScreen.tsx` — hand-rolled tabs, SubNav imported but unused
- `apps/web/src/app/game/screens/CombatScreen.tsx` — hand-rolled tabs
- `apps/web/src/components/guild/GuildExpeditionsTab.tsx` — hand-rolled tabs (high-severity accessibility gap)

Prioritise MailScreen (SubNav already imported!), CombatScreen, and GuildExpeditionsTab. Other components with tab-like buttons may be harder to migrate — assess on a case-by-case basis.

- [ ] **Step 1: Migrate MailScreen to SubNav**

Remove hand-rolled tab buttons. Use the already-imported SubNav:
```tsx
<SubNav
  tabs={[
    { id: 'inbox', label: 'Inbox', badge: unreadCount },
    { id: 'sent', label: 'Sent' },
    { id: 'compose', label: 'Compose' },
  ]}
  activeId={activeTab}
  onSelect={setActiveTab}
  ariaLabel="Mail navigation"
/>
```

- [ ] **Step 2: Migrate CombatScreen tabs to SubNav**

Same pattern. Import SubNav, replace hand-rolled tab buttons.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
refactor: migrate MailScreen and CombatScreen tabs to SubNav
```

---

### Task 19: Fix clickable divs — add keyboard support

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` — heal target divs
- Modify: `apps/web/src/components/screens/Templates.tsx` — slot expand divs
- Modify: `apps/web/src/components/screens/FriendsScreen.tsx` — friend card divs
- Modify: `apps/web/src/components/screens/WorldEvents.tsx` — boss card divs
- Modify: `apps/web/src/components/combat/CombatLogEntry.tsx` — expand div
- Modify: `apps/web/src/components/screens/AdminScreen.tsx` — list item divs

Use the existing pattern from `KnockoutBanner.tsx`:

```tsx
<div
  onClick={handler}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handler(); }}
>
```

- [ ] **Step 1: Search each file for `<div` with `onClick` but without `role="button"`**

For each match, add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler.

- [ ] **Step 2: Apply fixes across all 6 files**

Apply the keyboard support pattern to each clickable div.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add keyboard support to clickable divs in 6 components
```

---

### Task 20: Add aria-labels to icon-only buttons

**Files (10 instances across these components):**
- `apps/web/src/components/screens/Inventory.tsx` — 2 modal close buttons
- `apps/web/src/components/screens/Bestiary.tsx` — 3 modal close buttons
- `apps/web/src/components/screens/Equipment.tsx` — 2 modal close buttons
- `apps/web/src/components/screens/MailScreen.tsx` — delete icon button
- `apps/web/src/components/screens/Templates.tsx` — back/reorder buttons
- `apps/web/src/components/screens/Crafting.tsx` — +/- quantity buttons
- `apps/web/src/components/screens/Dashboard.tsx` — attribute buttons

- [ ] **Step 1: Search for icon-only buttons**

In each file, search for buttons containing only icon components (e.g., `<X />`, `<ChevronLeft />`, `<Plus />`, `<Minus />`).

- [ ] **Step 2: Add aria-label to each**

```tsx
// Before:
<button onClick={onClose}><X size={16} /></button>

// After:
<button onClick={onClose} aria-label="Close"><X size={16} /></button>
```

Common labels: `"Close"`, `"Back"`, `"Reorder"`, `"Increase quantity"`, `"Decrease quantity"`, `"Increase attribute"`.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
```
fix: add aria-labels to icon-only buttons across 7 components
```

---

### Task 21: Fix state sync bugs and one-line accessibility fixes

**Files:**
- Modify: `apps/web/src/components/screens/MailScreen.tsx` — `initialRecipientId` only read once (line 59)
- Modify: `apps/web/src/components/screens/Inventory.tsx` — `loadStash` missing `getSalvageCost` dependency
- Modify: `apps/web/src/app/game/page.tsx` — error banner missing `role="alert"`

- [ ] **Step 1: Fix MailScreen initialRecipientId sync**

`composeRecipientId` is initialized from `initialRecipientId` prop but never updated when the prop changes. Add a `useEffect` to sync:
```typescript
useEffect(() => {
  if (initialRecipientId) {
    setComposeRecipientId(initialRecipientId);
    setActiveTab('compose');
  }
}, [initialRecipientId]);
```

- [ ] **Step 2: Fix Inventory loadStash dependency**

Find `loadStash` (line 144) and its `useCallback` dependency array. Add `getSalvageCost` to the dependency array if it's missing. If `getSalvageCost` is not stable (not wrapped in useCallback by its parent), this will cause excessive re-renders — in that case, use a ref instead:
```typescript
const getSalvageCostRef = useRef(getSalvageCost);
getSalvageCostRef.current = getSalvageCost;
// Then use getSalvageCostRef.current inside loadStash
```

- [ ] **Step 3: Add role="alert" to game page error banner**

Find the error display in `apps/web/src/app/game/page.tsx` (the `actionError` div). Add:
```tsx
<div role="alert" className="...">
  {actionError}
</div>
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
```
fix: fix state sync bugs in MailScreen/Inventory and add role=alert to game page
```

---

## Chunk 6: Component Extraction (Deferred)

The audit identified ~14 significant duplication patterns. These are maintainability improvements, not bugs. Each extraction is a self-contained refactoring effort. **Recommend creating a separate plan** for the highest-ROI extractions:

| Component to Extract | Duplicated In | Copies |
|---------------------|---------------|--------|
| `ThreatMeter` | GuildExpeditionsTab, BossEncounterPanel | 2 |
| `BestiaryDetailModal` | Bestiary (3 modal variants) | 3 |
| `PerkBadge` | GuildProjectsTab, GuildSpecializationTab | 6 |
| `SkillHeader` | Crafting, Gathering | 2 |
| `ContributionList` | GuildExpeditionsTab | 4 |
| `CopyShareButton` | CombatHistory, CombatScreen | 2 |
| Turn presets in Exploration | Exploration (hardcoded instead of TurnPresets) | 1 |

**Also noted but lower priority:**
- ARIA `role="progressbar"` on 6 progress bars (GuildExpeditionsTab ×2, ZoneMap, Quests, Gathering, BossEncounterPanel)
- `aria-expanded` on 4 collapsible sections (GuildExpeditionsTab, Forge, ArenaScreen, CombatScreen)
- Missing `useMemo` on sort operations (4 files)
- Labels not linked via htmlFor/id (7 files)
- SubNav unused import in MailScreen (addressed in Task 18)
- CombatLog component may be dead code — verify before removing

---

## Execution Notes

**Parallel execution:** Chunks 1–5 are independent and can be executed by separate subagents simultaneously. Chunk 6 is deferred.

**Verification:** After all chunks complete, run:
```bash
npm run typecheck && npm run lint && npm run build:web
```

**Risk:** All changes are additive (adding error handling, confirmation modals, ARIA attributes) or minimal fixes (sort spread, constant imports). No architectural changes. Low risk of regression.

**Estimated scope:** ~45 files modified across 21 tasks.
