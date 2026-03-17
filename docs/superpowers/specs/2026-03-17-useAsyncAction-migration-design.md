# useAsyncAction Migration Design

**Issue:** #146 — Migrate manual try/catch handlers to useAsyncAction hook
**Date:** 2026-03-17

## Overview

The `useAsyncAction` hook at `apps/web/src/hooks/useAsyncAction.ts` encapsulates a common async pattern: set loading, clear error, try/catch/finally. It's currently only used in `NoGuildView`. This migration replaces manual try/catch boilerplate across 6 files (~14 handlers) with the hook, eliminating ~150 lines of repetitive code.

## Hook Extension

Add an optional `key` parameter to `run()` for item-level loading tracking.

### Current API

```typescript
const { loading, error, run, clearError } = useAsyncAction();
run(action, onSuccess);
```

### New API

```typescript
const { loading, loadingKey, error, run, clearError } = useAsyncAction();
run(action, onSuccess, key?);
```

- `loading: boolean` — true when any action is running (unchanged)
- `loadingKey: string | null` — set to `key` while a keyed action is running, otherwise `null`
- `run(action, onSuccess?, key?)` — optional third parameter for keyed loading
- Fully backwards compatible; existing callers unaffected

## Migration Scope

### Files to migrate (6 files, ~14 handlers)

#### 1. GuildSpecializationTab.tsx

3 handlers (`loadSpec`, `handleSelect`, `handleRespec`) using `loading` + `actionLoading` + parent `setError` prop.

**After:** 2 hook instances (load + action). Remove `setError` prop. Render `<ErrorBanner>` locally from `load.error || action.error`.

- `loadSpec` → `load.run(() => getGuildSpecialization(guildId), (data) => setStatus(data ?? null))`
- `handleSelect` → `action.run(() => selectGuildSpecialization(...), () => void loadSpec())`
- `handleRespec` → `action.run(() => respecGuildSpecialization(...), () => void loadSpec())`

#### 2. ExpeditionShopTab.tsx

2 handlers (`loadShop`, `handlePurchase`) using `loading` + `purchasing` (keyed string) + parent `setError` prop.

**After:** 2 hook instances (load + purchase). Uses keyed loading for per-item spinner.

- `loadShop` → `load.run(() => getExpeditionShop(), (data) => setShopData(data ?? null))`
- `handlePurchase` → `purchase.run(() => purchaseExpeditionItem(itemId), onSuccess, itemId)` — `purchase.loadingKey === item.id` replaces `purchasing === item.id`

Remove `setError` prop and `purchasing` state.

#### 3. GuildProjectsTab.tsx

5 handlers (`loadProjects`, `handleStartProject`, `handleContributeTurns`, `handleContributeMaterials`, `loadResourceItems`) using `loading` + `actionLoading` + parent `setError` prop.

**After:** 3 hook instances (load + action + resourceLoad).

- `loadProjects` → `load.run(() => getGuildProjects(guildId), (data) => setData(data))`
- `handleStartProject` → `action.run(() => startGuildProject(...), () => void loadProjects())`
- `handleContributeTurns` → `action.run(() => contributeProjectTurns(...), (data) => { handle stateUpdates; void loadProjects(); })`
- `handleContributeMaterials` → `action.run(() => contributeProjectMaterials(...), () => { void loadProjects(); void loadResourceItems(...); })`
- `loadResourceItems` → `resourceLoad.run(() => getInventory(), (data) => { filter and set resource items })`

Remove `setError` prop. Render errors locally. Action handlers share one instance since they can't run simultaneously.

#### 4. Templates.tsx

3 handlers (`handleActivate`, `handleDelete`, `handleSave`) using `saving` state + `error` state.

**After:** 2 hook instances (listAction + save).

- `handleActivate` → `listAction.run(() => activateTemplate(id), () => void onLoadTemplates())`
- `handleDelete` → `listAction.run(() => deleteTemplate(id), () => void onLoadTemplates())`
- `handleSave` → pre-validation stays manual with a local `validationError` state. The async portion uses `save.run(...)`. Display `validationError || save.error`.

Replace `saving` with `save.loading`.

#### 5. FriendProfileModal.tsx

1 handler (`handleConfirmAction`) using `actionLoading` + `error` state.

**After:** 1 hook instance (action).

- `handleConfirmAction` → `action.run(doAction, (data) => { callback; setConfirmAction(null); })`

Behavior change: on error, the confirm dialog stays open (user sees the error). Previously `setConfirmAction(null)` ran in `finally` and closed it on error too. The new behavior is better UX.

The initial `useEffect` load (Promise chain with cancellation token) stays manual — it doesn't fit the hook pattern.

#### 6. NoGuildView.tsx

1 handler (`handleSearch`) using manual `searching` + `searchError` state.

**After:** 1 additional hook instance (search), alongside the existing hook instance for create/join/request.

- `handleSearch` → `search.run(() => searchGuilds(...), (data) => { setSearchResults; setSearchTotal; setSearchPage; })`

Replace `searching` with `search.loading`, `searchError` with `search.error`.

### Files skipped

#### Rest.tsx

Both `handleRest` and `handleRecover` do complex multi-step state mutations on success: updating local HP state, calling secondary APIs (`getHpState`), and updating parent state via refs. Wrapping these in `onSuccess` callbacks would be less readable than the current manual code.

#### FriendProfileModal.tsx initial load

Uses a cancellation token pattern inside `useEffect` with a Promise chain. This is a different pattern from what the hook handles.

#### Casino.tsx, BossEncounterPanel.tsx, Inventory.tsx

These use polling, silent refresh, or batch error patterns that don't fit the hook.

## Behavioral Change: Guild Tab Error Handling

`GuildProjectsTab`, `GuildSpecializationTab`, and `ExpeditionShopTab` currently receive a `setError` prop from a parent component and write errors to shared state. After migration, each tab owns its error state via hook instances and renders its own `<ErrorBanner>`.

This is a cleaner separation of concerns — each tab manages its own error lifecycle instead of sharing mutable state with the parent.

The parent component's props and error wiring for these tabs will need to be cleaned up (remove `setError` prop from interfaces and call sites).

## Testing

No new unit tests for the hook — it's a thin state wrapper. Existing E2E tests covering guild, expeditions, templates, and friends screens validate that migrations don't break behavior.
