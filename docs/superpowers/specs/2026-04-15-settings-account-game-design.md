# Settings Account/Game Split Design

## Overview

Issue `#272` reworks the in-game settings experience so it stops behaving like a flat list of unrelated gameplay toggles. The new structure keeps all settings in one screen, adds a more discoverable entry point in the header, and separates sensitive account actions from gameplay preferences with internal tabs.

This is primarily a frontend information-architecture change. The backend already exposes the account endpoints needed for email and password changes:

- `POST /api/v1/auth/change-email`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/resend-verification`

The design reuses those routes instead of adding a parallel account-management API.

## Goals

- Make settings easier to find during normal play
- Split account management from gameplay preferences
- Add in-game email and password management
- Preserve the existing player preference controls
- Make verification state visible and actionable in both the banner and the settings screen

## Non-Goals

- No bottom-nav changes
- No new database columns
- No new auth endpoints
- No session-management UI beyond the existing forced re-login behavior after password changes

## Navigation

### Primary Entry

Add a dedicated settings cog button in the top header beside the mailbox icon. This becomes the primary way to open settings while the player is in the game.

Rationale:

- It improves discoverability without crowding the bottom nav
- It matches the current header-level account affordances (mail + username menu)
- It avoids treating settings as a primary gameplay destination

### Username Menu

The username dropdown remains for secondary account actions:

- `What's New`
- `Logout`

Remove `Settings` from the dropdown once the cog exists so there is one clear primary settings entry.
`Logout` remains in the username dropdown rather than being duplicated as a primary control inside the settings screen.

## Screen Structure

Keep a single `settings` screen in the game UI, but give it internal tabs:

- `Account`
- `Game`

The screen defaults to the `Account` tab whenever it opens.

Rationale:

- One screen avoids extra routing complexity
- Internal tabs make the account/game split explicit
- Defaulting to `Account` puts the new sensitive settings in front of the player instead of burying them under gameplay options

## Account Tab

### Account Summary

The top of the `Account` tab shows:

- Username
- Current email
- Verification status
- Short explanatory copy about why verification matters

If the account is unverified, the summary area includes a prominent `Resend verification` action.

### Verification State

The existing in-game verification banner remains. The banner continues to act as a lightweight reminder, while the `Account` tab becomes the permanent place where the player can review and act on account status.

This gives the player two levels of visibility:

- Banner: lightweight reminder
- Account tab: durable account-management home

### Change Email Form

Provide a focused email-change form with:

- New email
- Current password
- Submit action

Behavior:

- Requires the current password
- On success, update the visible email in the account summary immediately
- On success, mark the account as unverified in the current UI state immediately
- Show confirmation text that the new address must be verified

The UI should not require a full page reload to reflect the updated email or verification state.

### Change Password Form

Provide a focused password-change form with:

- Current password
- New password
- Confirm new password
- Submit action

Behavior:

- Client-side validation blocks mismatched confirmation
- Backend remains authoritative for password rules and current-password checks
- On success, treat the change as a forced re-login flow
- Show success feedback, then redirect to login

Because the existing backend revokes refresh tokens on password change, the frontend should not attempt to keep the current game session alive.

### Error Handling

Account-form errors stay local to the form that failed. Do not surface email/password submission failures as a generic page-level settings error.

Expected error cases:

- Invalid current password
- Email already taken
- Weak new password
- Network or server failure

Inline messaging should be specific enough that the player knows which field/action needs correcting.

## Game Tab

The existing preference controls remain server-backed through `PATCH /api/v1/player/settings`, but the page is reorganized into smaller groups.

### Sections

- `Combat`
  - Combat log speed
  - Auto-skip known combat
  - Low HP warning
- `Exploration`
  - Exploration playback speed
  - Default explore turns
  - Quick rest heal target
- `Crafting & Inventory`
  - Default refining max
  - Forge destruction confirmation rarity
  - Drop/salvage/sell confirmation rarity
  - Loot reveal rarity
- `Lore & Flavour`
  - NPC dialogue
  - Item flavour text
  - Bestiary lore
- `Notifications`
  - Push subscription toggle
  - Per-notification-type toggles

### Behavioral Intent

This tab is a structural rewrite, not a gameplay-rules rewrite. Existing preference semantics stay the same.

## Frontend State Implications

The current frontend treats auth state and gameplay settings as separate concerns:

- `useAuth()` owns player identity/account data
- `usePlayerSettings()` owns gameplay preferences

This feature needs a small bridge between them so account actions can update visible state without a hard reload.

### Required Account State

The settings screen needs access to:

- `username`
- `email`
- `emailVerified`

It also needs a way to refresh or mutate those values after:

- email change
- resend verification
- successful verification reloads on later fetches

### Recommended State Flow

- Keep gameplay preferences in `usePlayerSettings()`
- Keep identity/account state in `useAuth()`
- Pass `email` and `emailVerified` into `Settings`
- After successful email change, refresh auth/player state so both the banner and the account tab reflect the new values
- After password change, log out and route to login instead of trying to patch live state

## Component Boundaries

### Header

`AppShell` gains a visible settings icon/button alongside mail.

### Settings Screen

`Settings.tsx` becomes a tabbed container instead of a flat list-only screen. It owns local UI state for:

- active internal tab
- account form fields
- account form submission/loading/error states

It continues receiving game-preference values and handlers from the controller layer.

### API Client

Reuse the existing auth client helpers for:

- `changeEmail`
- `changePassword`
- `resendVerification`

No new endpoint wrappers are required unless existing exports need reshaping for cleaner caller ergonomics.

## UX Details

- Opening settings from the cog should always land on `Account`
- The tab UI should make it obvious that `Account` and `Game` are peers inside the same screen
- Sensitive actions should look deliberate and separate from gameplay toggles

## Testing

### Frontend

Add focused tests for:

- Header settings cog renders and triggers navigation
- Settings defaults to the `Account` tab
- Switching between `Account` and `Game` tabs works
- Unverified account state renders verification status and resend action
- Change-email form submits expected payload and updates visible account state after success
- Change-password form validates confirmation before submit
- Change-password success triggers logout/redirect behavior

### Existing Coverage Reuse

Existing API tests already cover core auth/settings contract behavior for:

- auth routes
- player settings schema

This feature should only add backend tests if the frontend work exposes an untested contract gap.

## Open Decisions Resolved

- Settings entry point: header cog beside mail
- Overall structure: one settings screen
- Internal split: `Account` and `Game` tabs
- Default tab: `Account`
