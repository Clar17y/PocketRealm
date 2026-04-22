# Mobile Realm Indicator Design

## Overview

The current mobile header in `AppShell` is too narrow to reliably show both the username and the current realm label. Short usernames like `ZuKii` fit cleanly, but longer usernames like `SinStalker` cause the `Permanent Realm` indicator to wrap onto a second line, which makes the header feel broken.

This design removes the mobile-only realm indicator from the header and relocates realm visibility into `Settings`, where it becomes a durable, tappable account-level row. The new row keeps the current realm easy to check and doubles as the entry point for character switching when multiple characters exist.

The existing character-switching behavior in the header remains the source of truth. This change is about moving the realm indicator and reusing the same switching flow from a better mobile location.

## Goals

- Eliminate header wrapping caused by long usernames on mobile
- Keep the current realm easy to check after removing the mobile header indicator
- Make the realm indicator actionable when character switching is available
- Reuse the existing character-switching flow instead of introducing a second switch system
- Keep desktop behavior stable unless layout cleanup is needed for consistency

## Non-Goals

- No backend or database changes
- No new character-switching API
- No redesign of the desktop header
- No new navigation destination for realm management beyond `Settings`
- No new account screen beyond the existing `Settings` surface

## Current Problem

`AppShell` currently renders a realm pill in the header when `realmLabel` exists. On desktop this is acceptable because the header has enough horizontal space. On mobile, the header already contains:

- the game title
- turns
- mail button
- settings button
- character switcher entry point when available
- username/menu trigger

Adding the realm pill to that same horizontal cluster makes the header sensitive to username length. The resulting layout is unstable and looks visibly worse for some players than others.

## Proposed UX

### Header

On mobile, remove the visible realm indicator from the header entirely.

The header continues to show:

- game title
- turns
- mail button
- settings button
- username/menu trigger
- existing character-switcher affordance if still needed for quick switching

The important requirement is that the realm label no longer competes for width in the mobile header.

Desktop may keep the current realm treatment if it remains visually sound. If implementation is simpler and still acceptable, the realm pill may also be removed globally, but the required outcome is specifically a stable mobile header.

### Settings

Add a small identity area near the top of the `Account` tab in `Settings`.

Current top-level identity text is:

- `Username: {username}`

Replace or expand this into a more structured identity block that includes:

- username
- `Current Realm`
- current realm value

### Row Behavior

When character switching is available:

- render `Current Realm` as a tappable row
- show the active realm name as the row value
- use button-like styling and a chevron or similar affordance
- tapping the row opens the existing character-switching flow

When character switching is not available:

- render the same realm information as static text
- do not show interactive affordances

This keeps realm visibility durable for all players while only advertising interactivity when there is actually something to switch to.

## Realm Label Rules

The Settings row uses the same source of truth as the current header realm display.

Display rules:

- permanent character: `Permanent Realm`
- seasonal character: season name
- optional secondary text for seasonal characters: remaining time, when `realmEndsAt` is available

The row should not invent alternate naming or formatting rules that could drift from the rest of the seasonal UI.

## Switching Behavior

The Settings row must reuse the existing character-switching mechanism already wired into `AppShell`.

That means:

- same character list
- same active-character detection
- same loading or disabled state while switching
- same switch callback

This feature should not create a second character-switcher state machine inside `Settings`.

Implementation can either:

- lift the existing switching UI state so both `AppShell` and `Settings` can open the same switcher, or
- extract the switching UI into a shared component/controller that both surfaces invoke

The key design constraint is shared behavior, not duplicated behavior.

## State And Data Flow

This is a frontend-only change. The data already exists in the current game shell layer:

- `realmLabel`
- `realmEndsAt`
- `characters`
- `activePlayerId`
- `switchingPlayerId`
- `onSwitchPlayer`

`Settings` will need enough of that data passed into it to render the row correctly and trigger switching.

Recommended direction:

- continue deriving realm identity from the same parent/controller that currently feeds `AppShell`
- pass a minimal realm/switching prop set into `Settings`
- avoid adding a separate fetch in `Settings`

This keeps the current realm and switching affordances consistent across surfaces and avoids stale UI.

## Component Boundaries

### `AppShell.tsx`

- Remove or suppress the mobile realm indicator
- Keep existing username/menu and switcher behavior intact unless sharing requires light refactoring
- If a shared switcher controller is extracted, `AppShell` becomes one consumer of that shared behavior

### `Settings.tsx`

- Add the `Current Realm` row near the username/account identity area
- Render interactive or static presentation based on switching availability
- Reuse shared switching state rather than owning a separate switch flow

### Shared Switching Surface

If the current switching UI is too tightly coupled to `AppShell`, extract the smallest useful shared unit. That shared unit should own:

- open/close state if needed
- character list rendering
- current active selection
- disabled/busy presentation

The extraction should stay narrow and only serve this feature.

## Error Handling And Edge Cases

- If there is only one character, the realm row is visible but non-interactive
- If a switch is already in progress, the row and switcher entry should reflect the busy state and prevent repeated taps
- If `realmEndsAt` is missing for a seasonal realm, show the season name without countdown text
- If the player is in the permanent realm, no countdown text is shown

No new error presentation is needed beyond the existing switching behavior.

## Testing

Add focused frontend coverage around `AppShell` and `Settings`.

Required coverage:

- mobile/header path no longer renders the realm indicator in the width-sensitive header area
- `Settings` shows `Current Realm`
- `Settings` shows `Permanent Realm` for permanent characters
- `Settings` shows season name for seasonal characters
- `Settings` renders the row as interactive when multiple characters exist
- tapping the row triggers the existing switch flow
- `Settings` renders the row as non-interactive when only one character exists
- busy switching state disables repeated interaction consistently

Prefer focused component tests over broad end-to-end coverage for this change.

## Open Design Decision

Whether the character-switcher entry point remains visible in the header after adding the Settings row is an implementation choice, not a product requirement.

The requirement is:

- the realm label must leave the mobile header
- the current realm must remain visible in `Settings`
- the `Settings` row must open switching when switching is available

If keeping both entry points feels redundant, the implementation may simplify further later, but that is outside the required scope for this design.
