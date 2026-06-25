# Stash Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side item-name search to the stash tab.

**Architecture:** Keep search state and filtering in `StashPanel`, where stash list rendering and stash batch controls already live. Batch controls receive the filtered visible ids, and hidden selections are cleared when the search narrows the list.

**Tech Stack:** Next.js 16, React 18, TypeScript, Vitest, React Testing Library.

---

### Files

- Modify: `apps/web/src/components/screens/Inventory.test.ts`
- Modify: `apps/web/src/components/screens/inventory/StashPanel.tsx`

### Task 1: Add The Failing Test

- [ ] **Step 1: Add a test for name-only stash filtering**

Add this case to `apps/web/src/components/screens/Inventory.test.ts`:

```tsx
it('filters stash items by name only', async () => {
  getStash.mockResolvedValue({
    data: {
      items: [
        {
          id: 'stash-staff',
          quantity: 1,
          rarity: 'rare',
          currentDurability: 6,
          maxDurability: 10,
          template: {
            id: 'staff-template',
            name: 'Oak Staff',
            itemType: 'weapon',
            maxDurability: 10,
            sellPrice: 12,
          },
        },
        {
          id: 'stash-ring',
          quantity: 1,
          rarity: 'uncommon',
          currentDurability: null,
          maxDurability: null,
          template: {
            id: 'ring-template',
            name: 'Silver Ring',
            itemType: 'trinket',
            maxDurability: null,
            sellPrice: 18,
          },
        },
      ],
    },
  });

  render(
    React.createElement(Inventory, {
      items: [],
      capacity: 10,
      usedSlots: 1,
      gold: 100,
      isInTown: true,
      showNpcDialogue: false,
    })
  );

  fireEvent.click(screen.getByRole('button', { name: /^stash$/i }));

  await waitFor(() => {
    expect(screen.getByText('Stash (2 items)')).toBeTruthy();
  });

  fireEvent.change(screen.getByLabelText(/search stash/i), { target: { value: 'staff' } });

  expect(screen.getByTitle('Oak Staff')).toBeTruthy();
  expect(screen.queryByTitle('Silver Ring')).toBeNull();

  fireEvent.change(screen.getByLabelText(/search stash/i), { target: { value: 'sword' } });

  expect(screen.queryByTitle('Oak Staff')).toBeNull();
  expect(screen.queryByTitle('Silver Ring')).toBeNull();
  expect(screen.getByText('No stash items match your search.')).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test -w apps/web -- Inventory.test.ts
```

Expected: FAIL because the search input with label `Search stash` does not exist.

### Task 2: Implement Stash Search

- [ ] **Step 1: Add search state, derived filtered items, and selection cleanup**

In `apps/web/src/components/screens/inventory/StashPanel.tsx`, import `useEffect`, `useMemo`, and `useState`, then add state and derived ids inside `StashPanel`:

```tsx
const [searchQuery, setSearchQuery] = useState('');
const normalizedSearchQuery = searchQuery.trim().toLowerCase();
const visibleItems = useMemo(
  () => normalizedSearchQuery.length === 0
    ? items
    : items.filter((item) => item.name.toLowerCase().includes(normalizedSearchQuery)),
  [items, normalizedSearchQuery]
);
const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
const hasSearch = normalizedSearchQuery.length > 0;

useEffect(() => {
  const visibleIdSet = new Set(visibleItemIds);
  for (const id of batch.withdraw.selection) {
    if (!visibleIdSet.has(id)) batch.withdraw.toggle(id);
  }
  for (const id of batch.sell.selection) {
    if (!visibleIdSet.has(id)) batch.sell.toggle(id);
  }
  for (const id of batch.salvage.selection) {
    if (!visibleIdSet.has(id)) batch.salvage.toggle(id);
  }
}, [batch.salvage, batch.sell, batch.withdraw, visibleItemIds]);
```

- [ ] **Step 2: Wire visible items into batch controls**

Use `visibleItemIds` for withdraw eligible ids, and filter sellable and salvageable ids to visible ids before passing them to `BatchActionBar`.

- [ ] **Step 3: Render the search field and filtered states**

Render a labelled search field above the stash count. Keep the original empty-stash message when `items.length === 0`, render the no-matches message when `visibleItems.length === 0`, and map `visibleItems` in the item grid.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm run test -w apps/web -- Inventory.test.ts
```

Expected: PASS.

### Task 3: Cleanup And Verification

- [ ] **Step 1: Review the diff with the simplify skill**

Run:

```powershell
rtk git diff
```

Review only the touched files for redundant state, unclear names, or wasted work.

- [ ] **Step 2: Run focused verification again**

Run:

```powershell
npm run test -w apps/web -- Inventory.test.ts
```

Expected: PASS.
