# Stash Search Design

## Goal

Add a name-only search field to the Inventory stash tab so players can quickly filter stored items.

## Scope

- Search applies only inside the stash tab.
- Search matches `item.name` only.
- Matching is case-insensitive and ignores leading or trailing whitespace.
- Empty search shows all stash items.
- Search is client-side because the stash tab already loads the full list it displays.

## UI Behavior

`StashPanel` owns the search input because the filter affects only the stash list and stash batch actions. The search field appears above the stash count and grid, after the batch controls. When no stash items exist, the existing empty-stash message remains. When the stash has items but none match the current search, the panel shows a no-matches message.

## Batch Behavior

Batch action eligibility uses only visible filtered items. If search changes while a batch mode is active, hidden selections are removed so users cannot submit items that are no longer visible.

## Testing

Add a focused `Inventory.test.ts` case that loads two stash items, opens the stash tab, filters by one item name, verifies the other item is hidden, then enters a no-match query and verifies the no-matches state.
