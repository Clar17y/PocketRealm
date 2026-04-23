# Admin Season Control Design

## Summary

Add a dedicated `Seasons` section to the existing in-game Admin screen so admins can create, bootstrap, activate, end, evaluate, and merge seasons without using raw API calls.

This feature is intentionally operational rather than editorial. Admins should be able to manage the season lifecycle and make a season playable, but not manually edit cloned seasonal content through the UI.

## Goals

- Add a season management UI inside the existing Admin screen.
- Allow admins to create a season from the web client.
- Allow admins to bootstrap a newly created season so it has playable world content.
- Allow admins to run the full season lifecycle from the same surface.
- Make season readiness visible so admins can distinguish between `created` and `playable`.

## Non-Goals

- No full season content editor.
- No per-record editing of cloned seasonal zones, mobs, drops, or recipes.
- No support for multiple permanent-realm character slots.
- No redesign of player signup or join-season UX in this change.
- No attempt to make bootstrap customizable in the first pass.

## Current State

- The backend already supports season lifecycle endpoints for create, activate, end, reward evaluation, and merge.
- The backend does not expose a season bootstrap/setup action.
- The web admin surface already exists as an in-game `Admin` screen with multiple tabs.
- Seasonal join requires season-specific starter content to exist, so a created season is not automatically playable.

## Product Decision

Use the existing Admin screen as the control surface and add a new `Seasons` tab.

The tab should treat season setup as a server-owned workflow:

1. Create season record
2. Bootstrap season content from permanent content
3. Activate season
4. End season
5. Evaluate rewards
6. Merge season back into permanent realm

This keeps the UI simple and reduces the risk of admins creating invalid season states through manual editing.

## UI Design

### Admin Tab Structure

Add `seasons` to the existing Admin tab set in `apps/web/src/components/screens/AdminScreen.tsx`.

The new `SeasonsTab` should follow the same visual and interaction style as the rest of the Admin screen:

- `PixelCard` sections
- inline success/error messaging through the existing admin action pattern
- destructive actions gated by browser confirmation prompts

### Create Form

Place the create form at the top of the tab.

Fields:

- `name`
- `startsAt`
- `endsAt`
- optional `features`

Representation:

- `features` may be a simple comma-separated input in the first pass
- `constantOverrides` stays out of scope for the first UI version

Validation:

- `name` required
- `startsAt` required
- `endsAt` required
- client should reject `endsAt <= startsAt` before submission

### Season List

Below the create form, render all seasons in descending creation order.

Each season row/card should show:

- name
- status
- startsAt
- endsAt
- `Bootstrapped` / `Not bootstrapped`

### Row Actions

Each season row should expose the following actions when valid:

- `Bootstrap`
- `Activate`
- `End`
- `Evaluate Rewards`
- `Merge`

Button availability rules:

- `Bootstrap`: enabled only for `upcoming` seasons that are not yet bootstrapped
- `Activate`: enabled only for `upcoming` seasons that are bootstrapped
- `End`: enabled only for `active` seasons
- `Evaluate Rewards`: enabled only for `ended` seasons
- `Merge`: enabled only for `ended` seasons

The UI may show disabled buttons with explanatory helper text, or only show available actions. Prefer visible-but-disabled buttons so the workflow is obvious.

## Backend Design

### Existing Endpoints Kept

Keep these endpoints as the lifecycle surface:

- `GET /api/v1/admin/seasons`
- `POST /api/v1/admin/seasons`
- `POST /api/v1/admin/seasons/:id/activate`
- `POST /api/v1/admin/seasons/:id/end`
- `POST /api/v1/admin/seasons/:id/evaluate-rewards`
- `POST /api/v1/admin/seasons/:id/merge`

### New Endpoint

Add:

- `POST /api/v1/admin/seasons/:id/bootstrap`

This route should call a dedicated service, not embed clone logic in the route file.

### New Service

Add a season bootstrap service in `apps/api/src/services/`, responsible for cloning permanent content into season-scoped content.

Recommended file:

- `apps/api/src/services/seasonBootstrapService.ts`

### Season Readiness

The UI needs a stable readiness signal.

Do not add a new schema column for this first pass. Instead, derive `isBootstrapped` from the presence of required season-scoped content, using the season ID as the scope.

Recommended readiness rule:

- a season is bootstrapped if it has at least:
  - one starter zone with `seasonId = season.id`
  - one season-scoped item template
  - one season-scoped mob template
  - one season-scoped crafting recipe

Expose `isBootstrapped` on the admin season list response.

## Bootstrap Behavior

### Preconditions

Bootstrap should:

- only allow `upcoming` seasons
- reject seasons that are already bootstrapped
- run in one transaction

### Clone Source

Bootstrap should clone from permanent-realm content only.

That means source records where the effective realm is permanent, which in current schema means:

- `seasonId = null` for season-scoped tables
- global/shared tables remain shared and are not cloned

### Records To Clone

Clone these datasets into season-scoped records for the target season:

- `zones`
- `zone_connections`
- `item_templates`
- `mob_templates`
- `drop_tables`
- `chest_drop_tables`
- `resource_nodes`
- `crafting_recipes`
- `zone_mob_families`

### Records To Reuse Instead Of Clone

Do not clone:

- `mob_families`
- `mob_family_members`

Reason:

- these are global/shared in the current schema and can already relate to cloned seasonal records through the remapped seasonal IDs

### Relationship Remapping

Bootstrap must preserve internal graph integrity by remapping cloned foreign keys.

Build and use:

- `zoneIdMap`
- `itemTemplateIdMap`
- `mobTemplateIdMap`

Use those maps to rewire:

- `zone_connections.fromId` / `toId`
- `mob_templates.zoneId`
- `drop_tables.mobTemplateId`
- `drop_tables.itemTemplateId`
- `chest_drop_tables.itemTemplateId`
- `resource_nodes.zoneId`
- `crafting_recipes.resultTemplateId`
- `zone_mob_families.zoneId`

### ID Strategy

Generate new IDs for cloned season-scoped records rather than reusing permanent IDs.

This avoids accidental cross-realm coupling and keeps merge/delete behavior straightforward.

### Failure Mode

Bootstrap should fail closed:

- if any required clone stage fails, rollback the transaction
- do not leave partial season content

Return a clear error message when bootstrap is refused because the season is already bootstrapped or not in `upcoming`.

## Activation Rule Change

Update activation so a season cannot be activated before bootstrap.

`activateSeason()` should reject with a clear application error if the target season is not bootstrapped.

This keeps API behavior aligned with the new admin UI and prevents admins from activating a season that players cannot join.

## Web API Layer

Extend `apps/web/src/lib/api/admin.ts` with:

- `adminGetSeasons`
- `adminCreateSeason`
- `adminBootstrapSeason`
- `adminActivateSeason`
- `adminEndSeason`
- `adminEvaluateSeasonRewards`
- `adminMergeSeason`

These helpers should stay thin and mirror the existing admin helper style.

## Component Design

Implement a new `SeasonsTab` inside `AdminScreen.tsx` unless the file becomes unwieldy enough to justify extraction during implementation.

Expected internal concerns:

- load season list on mount
- submit create form
- run row actions
- refresh season list after each successful action
- show inline admin action status

If the screen becomes materially harder to read, extraction to a local component file is acceptable, but only for the new season UI.

## Error Handling

### Client

- show API error messages inline using the existing admin status pattern
- keep action failures local to the season tab
- do not optimistically mutate row state; refresh from server after success

### Server

- bootstrap refused:
  - season not found
  - season not `upcoming`
  - already bootstrapped
- activate refused:
  - season not bootstrapped
  - another active season already exists

Errors should use `AppError` with explicit machine-readable codes so the UI can present meaningful messages if needed later.

## Testing Strategy

### Backend Tests First

Add tests for:

- bootstrap clones the expected permanent datasets
- bootstrap remaps foreign keys to cloned season records
- bootstrap rejects already bootstrapped seasons
- bootstrap rejects non-`upcoming` seasons
- activate rejects unbootstrapped seasons
- admin season list includes computed `isBootstrapped`

Preferred locations:

- `apps/api/src/services/seasonBootstrapService.test.ts`
- `apps/api/src/routes/admin.seasons.test.ts`
- `apps/api/src/services/seasonLifecycleService.test.ts`

### Frontend Tests After

Add tests for:

- season tab renders in admin screen
- season list loads and displays readiness/status
- create season submits expected payload
- bootstrap button triggers action and refreshes list
- activate/end/evaluate/merge buttons call the correct API helpers
- failure responses render inline error state

Preferred location:

- `apps/web/src/components/screens/AdminScreen.test.tsx` if it exists
- otherwise create a focused test near `AdminScreen.tsx`

## Rollout Notes

- This feature is admin-only, so backward compatibility risk is low.
- Since there are no active users, strict backward compatibility is not a design constraint for the workflow itself.
- The implementation should still preserve data integrity and avoid creating half-configured seasons.

## Open Decisions Resolved

- Control surface: existing Admin screen, not a separate tool
- Setup model: lifecycle plus bootstrap/setup
- Bootstrap customization: out of scope
- Permanent multi-character creation: out of scope
- Bootstrapped readiness: computed, not stored, in the first pass

## Acceptance Criteria

- Admins can create a season from the in-game Admin screen.
- Admins can bootstrap a created season from the same screen.
- Admins can see whether a season is bootstrapped.
- Activation is blocked until bootstrap succeeds.
- Admins can end, evaluate, and merge seasons from the same screen.
- Season bootstrap clones permanent content into season-scoped content with correct relation remapping.
- Backend and frontend test coverage exists for the new behavior.
