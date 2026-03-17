# useAsyncAction Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ~14 manual try/catch async handlers across 6 files to the `useAsyncAction` hook, eliminating ~150 lines of boilerplate.

**Architecture:** Extend the existing hook with keyed loading support and a relaxed `onSuccess` guard. Migrate each file independently — each task is a standalone commit. Three guild tabs switch from parent-provided `setError` to local error state.

**Tech Stack:** React hooks, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-useAsyncAction-migration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/hooks/useAsyncAction.ts` | Modify | Add `loadingKey`, relax `onSuccess` guard |
| `apps/web/src/components/guild/GuildSpecializationTab.tsx` | Modify | Migrate 3 handlers, add local ErrorBanner |
| `apps/web/src/components/guild/ExpeditionShopTab.tsx` | Modify | Migrate 2 handlers, add local ErrorBanner, use keyed loading |
| `apps/web/src/components/guild/GuildProjectsTab.tsx` | Modify | Migrate 5 handlers, add local ErrorBanner |
| `apps/web/src/components/screens/Templates.tsx` | Modify | Migrate 3 handlers, add validationError state |
| `apps/web/src/components/friends/FriendProfileModal.tsx` | Modify | Migrate 1 handler |
| `apps/web/src/components/guild/NoGuildView.tsx` | Modify | Migrate 1 handler (handleSearch) |
| `apps/web/src/components/screens/GuildScreen.tsx` | Modify | Remove `setError` prop from 3 migrated tabs |

---

### Task 1: Extend useAsyncAction hook

**Files:**
- Modify: `apps/web/src/hooks/useAsyncAction.ts`

- [ ] **Step 1: Add `loadingKey` state and `key` parameter to `run()`**

Replace the entire hook with:

```typescript
import { useState, useCallback } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(
    action: () => Promise<{ data?: T | null; error?: { message: string } | null }>,
    onSuccess?: (data: T) => void,
    key?: string,
  ) => {
    setLoading(true);
    if (key !== undefined) setLoadingKey(key);
    setError(null);
    try {
      const res = await action();
      if (res.error) {
        setError(res.error.message);
      } else if (onSuccess) {
        onSuccess(res.data as T);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, loadingKey, error, run, clearError };
}
```

Changes from original:
- Added `loadingKey` state (`string | null`)
- Added optional `key` third parameter to `run()`
- Relaxed `onSuccess` guard: calls `onSuccess` whenever there is no `res.error` (previously skipped when `res.data` was null/undefined)
- `loadingKey` is set before the action and cleared in `finally`

- [ ] **Step 2: Verify existing NoGuildView usage still works**

Run: `npx tsc -b --noEmit` from the repo root (or `npm run typecheck`).
Expected: No new type errors in `NoGuildView.tsx` (existing caller doesn't use `loadingKey` and its `onSuccess` callbacks always receive non-null data).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useAsyncAction.ts
git commit -m "feat: extend useAsyncAction with loadingKey and relaxed onSuccess guard (#146)"
```

---

### Task 2: Migrate GuildSpecializationTab

**Files:**
- Modify: `apps/web/src/components/guild/GuildSpecializationTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx` (remove `setError` prop)

- [ ] **Step 1: Read both files**

Read `GuildSpecializationTab.tsx` and `GuildScreen.tsx` to confirm current state matches spec.

- [ ] **Step 2: Migrate GuildSpecializationTab**

Replace the manual state and handlers. Changes:

1. Add imports:
```typescript
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';
```

2. Remove `setError` from props interface:
```typescript
interface GuildSpecializationTabProps {
  guildId: string;
  guildLevel: number;
  myRole: string;
  // setError removed
}
```

3. Update component signature — remove `setError` from destructuring:
```typescript
export function GuildSpecializationTab({ guildId, guildLevel, myRole }: GuildSpecializationTabProps) {
```

4. Replace state declarations. Remove:
```typescript
const [loading, setLoading] = useState(true);
const [actionLoading, setActionLoading] = useState(false);
```
Add:
```typescript
const load = useAsyncAction();
const action = useAsyncAction();
```

5. Replace `loadSpec`:
```typescript
const loadSpec = useCallback(() => {
  load.run(() => getGuildSpecialization(guildId), (data) => setStatus(data ?? null));
}, [guildId, load.run]);
```

6. Replace `handleSelect`:
```typescript
const handleSelect = (path: string) =>
  action.run(() => selectGuildSpecialization(guildId, path), () => void loadSpec());
```

7. Replace `handleRespec`:
```typescript
const handleRespec = (path: string) =>
  action.run(() => respecGuildSpecialization(guildId, path), () => void loadSpec());
```

8. Update all references:
- `loading` → `load.loading`
- `actionLoading` → `action.loading`

9. Add `<ErrorBanner>` in each return branch. At the top of each outermost `<div>`, before other content:
```tsx
{(load.error || action.error) && <ErrorBanner message={(load.error || action.error)!} />}
```

For the `LoadingCard` return (line 97), no error banner needed — it's the initial loading state.

- [ ] **Step 3: Update GuildScreen.tsx**

In `GuildScreen.tsx`, remove `setError` from the `GuildSpecializationTab` JSX (line 163):

Before:
```tsx
<GuildSpecializationTab guildId={guildData.guild.id} guildLevel={guildData.guild.level} myRole={guildData.role} setError={setError} />
```
After:
```tsx
<GuildSpecializationTab guildId={guildData.guild.id} guildLevel={guildData.guild.level} myRole={guildData.role} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/guild/GuildSpecializationTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "refactor: migrate GuildSpecializationTab to useAsyncAction (#146)"
```

---

### Task 3: Migrate ExpeditionShopTab

**Files:**
- Modify: `apps/web/src/components/guild/ExpeditionShopTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx` (remove `setError` prop)

- [ ] **Step 1: Read the file**

Read `ExpeditionShopTab.tsx` to confirm current state.

- [ ] **Step 2: Migrate ExpeditionShopTab**

1. Add imports:
```typescript
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';
```

2. Remove `setError` from props interface:
```typescript
interface ExpeditionShopTabProps {
  onRefresh?: () => void;
  // setError removed
}
```

3. Update component signature — remove `setError` from destructuring:
```typescript
export function ExpeditionShopTab({ onRefresh }: ExpeditionShopTabProps) {
```

4. Replace state declarations. Remove:
```typescript
const [loading, setLoading] = useState(true);
const [purchasing, setPurchasing] = useState<string | null>(null);
```
Add:
```typescript
const load = useAsyncAction();
const purchase = useAsyncAction();
```
Keep `shopData` state as-is.

5. Replace `loadShop`:
```typescript
const loadShop = useCallback(() => {
  load.run(() => getExpeditionShop(), (data) => setShopData(data ?? null));
}, [load.run]);
```

6. Replace `handlePurchase`:
```typescript
const handlePurchase = (itemId: string) =>
  purchase.run(
    () => purchaseExpeditionItem(itemId),
    () => { void loadShop(); onRefresh?.(); },
    itemId,
  );
```

7. Update all references:
- `loading && !shopData` → `load.loading && !shopData`
- `purchasing === item.id` → `purchase.loadingKey === item.id`

8. Add `<ErrorBanner>` at top of outermost `<div>` in the return:
```tsx
{(load.error || purchase.error) && <ErrorBanner message={(load.error || purchase.error)!} />}
```

- [ ] **Step 3: Update GuildScreen.tsx**

Remove `setError` from `ExpeditionShopTab` JSX (line 160):

Before:
```tsx
<ExpeditionShopTab setError={setError} onRefresh={refreshGuild} />
```
After:
```tsx
<ExpeditionShopTab onRefresh={refreshGuild} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/guild/ExpeditionShopTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "refactor: migrate ExpeditionShopTab to useAsyncAction with keyed loading (#146)"
```

---

### Task 4: Migrate GuildProjectsTab

**Files:**
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx` (remove `setError` prop)

This is the largest migration — 5 handlers, 3 hook instances.

- [ ] **Step 1: Read the file**

Read `GuildProjectsTab.tsx` to confirm current state.

- [ ] **Step 2: Migrate GuildProjectsTab**

1. Add imports:
```typescript
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';
```

2. Remove `setError` from props interface:
```typescript
interface GuildProjectsTabProps {
  guildId: string;
  myRole: string;
  // setError removed
  onStateUpdates?: (updates: StateUpdates) => void;
}
```

3. Update component signature — remove `setError` from destructuring:
```typescript
export function GuildProjectsTab({ guildId, myRole, onStateUpdates }: GuildProjectsTabProps) {
```

4. Replace state declarations. Remove:
```typescript
const [loading, setLoading] = useState(true);
const [actionLoading, setActionLoading] = useState(false);
```
Add:
```typescript
const load = useAsyncAction();
const action = useAsyncAction();
const resourceLoad = useAsyncAction();
```

5. Replace `loadProjects`:
```typescript
const loadProjects = useCallback(() => {
  load.run(() => getGuildProjects(guildId), (data) => { if (data) setData(data); });
}, [guildId, load.run]);
```

6. Replace `loadResourceItems`:
```typescript
const loadResourceItems = useCallback((neededCategories: string[]) => {
  resourceLoad.run(() => getInventory(), (data) => {
    if (!data) return;
    const resources: ResourceItem[] = [];
    for (const item of data.items) {
      if (item.template.itemType !== 'resource' || item.quantity <= 0) continue;
      const cat = getCategoryForTemplate(item.template.name);
      if (cat && neededCategories.includes(cat)) {
        resources.push({
          templateId: item.templateId,
          templateName: item.template.name,
          quantity: item.quantity,
          category: cat,
        });
      }
    }
    setResourceItems(resources);
    if (resources.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(resources[0].templateId);
    }
  });
}, [selectedTemplateId, resourceLoad.run]);
```

7. Replace `handleStartProject`:
```typescript
const handleStartProject = (projectKey: string) =>
  action.run(() => startGuildProject(guildId, projectKey), () => void loadProjects());
```

8. Replace `handleContributeTurns`:
```typescript
const handleContributeTurns = (projectId: string) => {
  const amount = parseInt(turnAmount);
  if (!amount || amount <= 0) return;
  action.run(() => contributeProjectTurns(guildId, projectId, amount), (data) => {
    if ((data as any)?.stateUpdates) onStateUpdates?.((data as any).stateUpdates);
    void loadProjects();
  });
};
```

9. Replace `handleContributeMaterials`:
```typescript
const handleContributeMaterials = (projectId: string) => {
  const qty = parseInt(materialQuantity);
  if (!qty || qty <= 0 || !selectedTemplateId) return;
  action.run(() => contributeProjectMaterials(guildId, projectId, selectedTemplateId, qty), () => {
    void loadProjects();
    const activeProject = data?.projects.find((p) => p.status === 'active');
    if (activeProject) {
      const neededCategories = activeProject.materialCosts
        .filter((c) => (activeProject.materialsProgress[c.category] ?? 0) < c.quantity)
        .map((c) => c.category);
      void loadResourceItems(neededCategories);
    }
  });
};
```

10. Update all references:
- `loading && !data` → `load.loading && !data`
- `actionLoading` → `action.loading`

11. Add `<ErrorBanner>` at top of outermost `<div>`:
```tsx
{(load.error || action.error || resourceLoad.error) && (
  <ErrorBanner message={(load.error || action.error || resourceLoad.error)!} />
)}
```

- [ ] **Step 3: Update GuildScreen.tsx**

Remove `setError` from `GuildProjectsTab` JSX (line 145):

Before:
```tsx
<GuildProjectsTab guildId={guildData.guild.id} myRole={guildData.role} setError={setError} onStateUpdates={onStateUpdates} />
```
After:
```tsx
<GuildProjectsTab guildId={guildData.guild.id} myRole={guildData.role} onStateUpdates={onStateUpdates} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/guild/GuildProjectsTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "refactor: migrate GuildProjectsTab to useAsyncAction (#146)"
```

---

### Task 5: Migrate Templates

**Files:**
- Modify: `apps/web/src/components/screens/Templates.tsx`

- [ ] **Step 1: Read the file**

Read `Templates.tsx` to confirm current state.

- [ ] **Step 2: Migrate Templates**

1. Add import:
```typescript
import { useAsyncAction } from '@/hooks/useAsyncAction';
```

2. Replace state declarations. Remove:
```typescript
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```
Add:
```typescript
const listAction = useAsyncAction();
const save = useAsyncAction();
const [validationError, setValidationError] = useState<string | null>(null);
```

3. Replace `handleActivate`:
```typescript
const handleActivate = useCallback((id: string) =>
  listAction.run(() => activateTemplate(id), () => void onLoadTemplates()),
[onLoadTemplates, listAction.run]);
```

4. Replace `handleDelete`:
```typescript
const handleDelete = useCallback((id: string) =>
  listAction.run(() => deleteTemplate(id), () => void onLoadTemplates()),
[onLoadTemplates, listAction.run]);
```

5. Replace `handleSave`:
```typescript
const handleSave = useCallback(() => {
  setValidationError(null); // Clear any previous validation error
  if (!editorName.trim()) { setValidationError('Name is required'); return; }
  if (editorSlots.length === 0) { setValidationError('Add at least one action'); return; }
  const incomplete = editorSlots.some(s => s.condition && !s.thenActionId);
  if (incomplete) { setValidationError('All conditions need a "then" action'); return; }

  const slots: Omit<CombatTemplateSlotData, 'id'>[] = editorSlots.map((s, i) => ({
    sortOrder: i,
    actionId: s.actionId,
    ...(s.condition && s.thenActionId ? { condition: s.condition, thenActionId: s.thenActionId } : {}),
  }));

  save.run(
    () => isNew ? createTemplate(editorName.trim(), slots) : updateTemplate(editingTemplate!.id, editorName.trim(), slots),
    () => { void onLoadTemplates(); setEditingTemplate(null); setIsNew(false); },
  );
}, [editorName, editorSlots, isNew, editingTemplate, onLoadTemplates, save.run]);
```

6. Clear `validationError` in handlers that reset the editor:
- In `handleNewTemplate`, add: `setValidationError(null);`  (already clears `error` — replace with `validationError`)
- In `handleEdit`, add: `setValidationError(null);`
- In `handleCancel`, add: `setValidationError(null);`

7. Update error display. The existing error display at line 462-465 currently shows `{error && ...}`. Replace:
```tsx
{(validationError || save.error || listAction.error) && (
  <div className="p-2 rounded-lg bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
    {validationError || save.error || listAction.error}
  </div>
)}
```

8. Update button disabled/label:
- `saving` → `save.loading`
- `{saving ? 'Saving...' : 'Save'}` → `{save.loading ? 'Saving...' : 'Save'}`

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/screens/Templates.tsx
git commit -m "refactor: migrate Templates to useAsyncAction (#146)"
```

---

### Task 6: Migrate FriendProfileModal

**Files:**
- Modify: `apps/web/src/components/friends/FriendProfileModal.tsx`

- [ ] **Step 1: Read the file**

Read `FriendProfileModal.tsx` to confirm current state.

- [ ] **Step 2: Migrate FriendProfileModal**

1. Add import:
```typescript
import { useAsyncAction } from '@/hooks/useAsyncAction';
```

2. Replace state declarations. Remove only `actionLoading`:
```typescript
const [actionLoading, setActionLoading] = useState(false);
```
Keep `error`/`setError` — the initial `useEffect` load still writes to them.

Add:
```typescript
const action = useAsyncAction();
```

Keep `loading`/`setLoading` for the initial `useEffect` load. Keep `error`/`setError` for the initial load's `.catch()` handler. Only the confirm action migrates to the hook.

3. Replace `handleConfirmAction`:
```typescript
const handleConfirmAction = useCallback(() => {
  if (!confirmAction || !profile) return;
  const doAction = confirmAction === 'unfriend'
    ? () => unfriend(friendshipId)
    : () => blockPlayer(profile.playerId);
  action.run(doAction, (data) => {
    if (data) {
      confirmAction === 'unfriend' ? onUnfriend() : onBlock();
    }
    setConfirmAction(null);
  });
}, [confirmAction, profile, friendshipId, onUnfriend, onBlock, action.run]);
```

Behavioral change: on error, `setConfirmAction(null)` is NOT called (it's in `onSuccess` now). The confirm dialog stays open so the user sees the error. This is better UX.

4. Update all references:
- `actionLoading` → `action.loading`
- `error`/`setError` and `loading`/`setLoading` are unchanged — they're used by the initial `useEffect` load

5. Update error display to also show `action.error`:
```tsx
{(error || action.error) && !loading && (
  <div className="flex flex-col items-center justify-center py-12 gap-3">
    <span className="text-[var(--rpg-red)] text-sm">{error || action.error}</span>
  </div>
)}
```

6. Update disabled state on buttons (lines 205, 212):
- `actionLoading` → `action.loading`

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/friends/FriendProfileModal.tsx
git commit -m "refactor: migrate FriendProfileModal confirm action to useAsyncAction (#146)"
```

---

### Task 7: Migrate NoGuildView handleSearch

**Files:**
- Modify: `apps/web/src/components/guild/NoGuildView.tsx`

- [ ] **Step 1: Read the file**

Read `NoGuildView.tsx` to confirm current state.

- [ ] **Step 2: Migrate handleSearch**

1. Replace state declarations. Remove:
```typescript
const [searching, setSearching] = useState(false);
const [searchError, setSearchError] = useState<string | null>(null);
```
Add a second hook instance (the first already exists at line 37):
```typescript
const search = useAsyncAction();
```

2. Replace `handleSearch`:
```typescript
const handleSearch = useCallback((query: string, page = 1) => {
  search.run(() => searchGuilds(query || undefined, page), (data) => {
    setSearchResults(data?.guilds ?? []);
    setSearchTotal(data?.total ?? 0);
    setSearchPage(page);
  });
}, [search.run]);
```

3. Update all references:
- `searching` → `search.loading`
- `searchError` → `search.error`
- In the error banner (line 80): `searchError` → `search.error`

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/guild/NoGuildView.tsx
git commit -m "refactor: migrate NoGuildView handleSearch to useAsyncAction (#146)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: No new type errors (pre-existing error in `page.tsx:333` is expected).

- [ ] **Step 2: Build**

Run: `npm run build:web`
Expected: Clean build.

- [ ] **Step 3: Verify no stale `setError` props remain for migrated tabs**

Search for any remaining `setError` being passed to the 3 migrated components:
- `GuildSpecializationTab` should NOT receive `setError`
- `ExpeditionShopTab` should NOT receive `setError`
- `GuildProjectsTab` should NOT receive `setError`

Other guild tabs (`GuildMembers`, `GuildUpgradesTab`, `GuildExpeditionsTab`, `GuildSettings`) should still receive `setError` — do NOT remove those.
