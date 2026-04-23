# Mobile Realm Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the realm indicator out of the mobile header and into a tappable `Current Realm` row in `Settings` that can trigger character switching when multiple characters exist.

**Architecture:** Remove the width-sensitive realm/switch control from `AppShell`, then pass the existing realm and character-switching state down to `Settings` through `page.tsx` and `GameScreenRenderer.tsx`. Implement the new `Current Realm` row in `Settings` using the same `characters`, `activePlayerId`, `switchingPlayerId`, and `onSwitchPlayer` data already used by the header so the behavior stays consistent without any backend changes.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `apps/web/src/app/game/page.tsx`
  - Stop sending character-switch props into `AppShell`
  - Start sending realm/switch props into `GameScreenRenderer`
- `apps/web/src/app/game/GameScreenRenderer.tsx`
  - Extend renderer props and pass realm/switch data into `Settings`
- `apps/web/src/components/AppShell.tsx`
  - Remove the header character-switch entry point and stale realm helper/state tied only to that UI
- `apps/web/src/components/AppShell.test.ts`
  - Replace the old header switcher test with assertions that the header stays free of the realm switch control
- `apps/web/src/components/screens/Settings.tsx`
  - Add the `Current Realm` identity row
  - Render it as static text for single-character accounts
  - Render it as a tappable row that reveals switch targets for multi-character accounts
- `apps/web/src/components/screens/Settings.test.ts`
  - Cover permanent-vs-seasonal realm copy, interactive vs static behavior, and switching busy state

### No new backend or shared API files

- Do not add API routes
- Do not add database fields
- Do not add a second character-switch API client

---

### Task 1: Add Realm Switching Coverage To Settings

**Files:**
- Modify: `apps/web/src/components/screens/Settings.test.ts`
- Modify: `apps/web/src/components/screens/Settings.tsx`
- Modify: `apps/web/src/app/game/GameScreenRenderer.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

- [ ] **Step 1: Write the failing Settings tests**

Add four focused tests to `apps/web/src/components/screens/Settings.test.ts`:

```ts
it('shows the permanent realm in account identity for a single-character account', () => {
  renderSettings({
    realmLabel: 'Permanent Realm',
    realmEndsAt: null,
    activePlayerId: 'permanent-player',
    characters: [
      {
        id: 'permanent-player',
        username: 'Rook',
        characterLevel: 42,
        seasonId: null,
        seasonName: null,
        seasonStatus: null,
        seasonEndsAt: null,
      },
    ],
    switchingPlayerId: null,
    onSwitchPlayer: vi.fn(),
  });

  expect(screen.getByText('Current Realm')).toBeTruthy();
  expect(screen.getByText('Permanent Realm')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Current Realm/i })).toBeNull();
});

it('shows the active season name in account identity for a seasonal character', () => {
  renderSettings({
    realmLabel: 'Season 7',
    realmEndsAt: '2099-01-01T00:00:00.000Z',
    activePlayerId: 'season-player',
    characters: [
      {
        id: 'season-player',
        username: 'Rook_S7',
        characterLevel: 18,
        seasonId: 'season-7',
        seasonName: 'Season 7',
        seasonStatus: 'active',
        seasonEndsAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    switchingPlayerId: null,
    onSwitchPlayer: vi.fn(),
  });

  expect(screen.getByText('Season 7')).toBeTruthy();
});

it('opens switch targets from the Current Realm row when multiple characters exist', async () => {
  const onSwitchPlayer = vi.fn();
  renderSettings({
    realmLabel: 'Permanent Realm',
    activePlayerId: 'permanent-player',
    characters: [
      {
        id: 'permanent-player',
        username: 'Rook',
        characterLevel: 42,
        seasonId: null,
        seasonName: null,
        seasonStatus: null,
        seasonEndsAt: null,
      },
      {
        id: 'season-player',
        username: 'Rook_S1',
        characterLevel: 18,
        seasonId: 'season-1',
        seasonName: 'Season 1',
        seasonStatus: 'active',
        seasonEndsAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    switchingPlayerId: null,
    onSwitchPlayer,
  });

  fireEvent.click(screen.getByRole('button', { name: /Current Realm/i }));
  fireEvent.click(screen.getByRole('button', { name: /Rook_S1/i }));

  expect(onSwitchPlayer).toHaveBeenCalledWith('season-player');
});

it('disables switching actions while a character switch is already in progress', () => {
  renderSettings({
    realmLabel: 'Permanent Realm',
    activePlayerId: 'permanent-player',
    characters: [
      {
        id: 'permanent-player',
        username: 'Rook',
        characterLevel: 42,
        seasonId: null,
        seasonName: null,
        seasonStatus: null,
        seasonEndsAt: null,
      },
      {
        id: 'season-player',
        username: 'Rook_S1',
        characterLevel: 18,
        seasonId: 'season-1',
        seasonName: 'Season 1',
        seasonStatus: 'active',
        seasonEndsAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    switchingPlayerId: 'season-player',
    onSwitchPlayer: vi.fn(),
  });

  fireEvent.click(screen.getByRole('button', { name: /Current Realm/i }));
  expect(screen.getByRole('button', { name: /Rook_S1/i })).toBeDisabled();
});
```

Also extend the `renderSettings()` helper defaults so the new props always exist:

```ts
realmLabel: 'Permanent Realm',
realmEndsAt: null,
activePlayerId: 'permanent-player',
characters: [
  {
    id: 'permanent-player',
    username: 'Rook',
    characterLevel: 42,
    seasonId: null,
    seasonName: null,
    seasonStatus: null,
    seasonEndsAt: null,
  },
],
switchingPlayerId: null,
onSwitchPlayer: vi.fn(),
```

- [ ] **Step 2: Run the Settings test file and verify it fails**

Run:

```powershell
npm test -- -w apps/web src/components/screens/Settings.test.ts
```

Expected:

- FAIL because `SettingsProps` does not yet accept `realmLabel`, `realmEndsAt`, `activePlayerId`, `characters`, `switchingPlayerId`, or `onSwitchPlayer`
- Or FAIL because the `Current Realm` row does not exist yet

- [ ] **Step 3: Implement the minimal Settings prop plumbing and realm row**

Update `apps/web/src/components/screens/Settings.tsx`:

1. Extend the API import to include `CharacterSummary`:

```ts
import {
  changeEmail,
  changePassword,
  resendVerification,
  type CharacterSummary,
  type SeasonArchiveSummary,
} from '@/lib/api';
```

2. Extend `SettingsProps`:

```ts
  realmLabel: string;
  realmEndsAt: string | Date | null;
  activePlayerId: string | null;
  characters: CharacterSummary[];
  switchingPlayerId: string | null;
  onSwitchPlayer?: (playerId: string) => void;
```

3. Add local open state near the existing account form state:

```ts
  const [realmSwitcherOpen, setRealmSwitcherOpen] = useState(false);
  const hasRealmSwitcher = characters.length > 1 && Boolean(onSwitchPlayer);
```

4. Replace the plain top identity copy:

```tsx
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Settings</h2>
      <div className="space-y-1">
        <p className="text-[var(--rpg-text-secondary)]">Username: {username}</p>
        {hasRealmSwitcher ? (
          <div className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2">
            <button
              type="button"
              onClick={() => setRealmSwitcherOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={realmSwitcherOpen}
              aria-controls="settings-realm-switcher"
              aria-label={`Current Realm: ${realmLabel}`}
            >
              <span>
                <span className="block text-xs text-[var(--rpg-text-secondary)]">Current Realm</span>
                <span className="block text-sm font-bold text-[var(--rpg-text-primary)]">{realmLabel}</span>
                {realmEndsAt && (
                  <span className="block text-xs text-[var(--rpg-text-secondary)]">
                    {typeof realmEndsAt === 'string' ? realmEndsAt : realmEndsAt.toISOString()}
                  </span>
                )}
              </span>
              <span className="text-xs text-[var(--rpg-gold)]">Switch ▾</span>
            </button>

            {realmSwitcherOpen && (
              <div id="settings-realm-switcher" className="mt-2 space-y-2">
                {characters.map((character) => {
                  const isActive = character.id === activePlayerId;
                  const isBusy = switchingPlayerId === character.id;
                  const nextRealmLabel = character.seasonName ?? 'Permanent Realm';

                  return (
                    <button
                      key={character.id}
                      type="button"
                      disabled={isActive || Boolean(switchingPlayerId)}
                      onClick={() => onSwitchPlayer?.(character.id)}
                      className="flex w-full items-center justify-between rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-left disabled:opacity-70"
                    >
                      <span>
                        <span className="block text-sm font-bold text-[var(--rpg-text-primary)]">
                          {character.username}
                        </span>
                        <span className="block text-xs text-[var(--rpg-text-secondary)]">
                          {nextRealmLabel} · Lv. {character.characterLevel}
                        </span>
                      </span>
                      <span className="text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
                        {isBusy ? 'Switching' : isActive ? 'Active' : 'Play'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2">
            <span className="block text-xs text-[var(--rpg-text-secondary)]">Current Realm</span>
            <span className="block text-sm font-bold text-[var(--rpg-text-primary)]">{realmLabel}</span>
          </div>
        )}
      </div>
```

5. Pass the new props through `apps/web/src/app/game/GameScreenRenderer.tsx`:

```ts
import type { CharacterSummary, SeasonArchiveSummary } from '@/lib/api';
```

```ts
  realmLabel: string;
  realmEndsAt: string | Date | null;
  activePlayerId: string | null;
  characters: CharacterSummary[];
  switchingPlayerId: string | null;
  onSwitchPlayer: (playerId: string) => void;
```

```tsx
        <Settings
          username={player?.username}
          realmLabel={realmLabel}
          realmEndsAt={realmEndsAt}
          activePlayerId={activePlayerId}
          characters={characters}
          switchingPlayerId={switchingPlayerId}
          onSwitchPlayer={onSwitchPlayer}
          ...
        />
```

6. Feed those props from `apps/web/src/app/game/page.tsx`:

```tsx
        <GameScreenRenderer
          gc={gc}
          player={player}
          seasonArchives={seasonArchives}
          realmLabel={activeCharacter?.seasonName ?? 'Permanent Realm'}
          realmEndsAt={activeCharacter?.seasonEndsAt ?? null}
          activePlayerId={player?.id ?? null}
          characters={characters}
          switchingPlayerId={switchingPlayerId}
          onSwitchPlayer={(playerId) => void handleSwitchPlayer(playerId)}
          ...
        />
```

- [ ] **Step 4: Run the Settings test file and verify it passes**

Run:

```powershell
npm test -- -w apps/web src/components/screens/Settings.test.ts
```

Expected:

- PASS for the new realm-row scenarios
- Existing settings tests remain green

- [ ] **Step 5: Commit the Settings realm row work**

Run:

```powershell
git add apps/web/src/components/screens/Settings.tsx `
        apps/web/src/components/screens/Settings.test.ts `
        apps/web/src/app/game/GameScreenRenderer.tsx `
        apps/web/src/app/game/page.tsx
git commit -m "feat(web): move realm switching into settings"
```

---

### Task 2: Remove The Header Realm Switch Control

**Files:**
- Modify: `apps/web/src/components/AppShell.test.ts`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

- [ ] **Step 1: Replace the old AppShell switcher test with a failing header-stability test**

In `apps/web/src/components/AppShell.test.ts`, remove the current character-switcher interaction test and replace it with:

```ts
it('does not render the realm switch control in the header', () => {
  render(
    React.createElement(
      AppShell,
      {
        username: 'SinStalker',
        realmLabel: 'Permanent Realm',
        activePlayerId: 'permanent-player',
        characters: [
          {
            id: 'permanent-player',
            username: 'SinStalker',
            characterLevel: 42,
            seasonId: null,
            seasonName: null,
            seasonStatus: null,
            seasonEndsAt: null,
          },
          {
            id: 'season-player',
            username: 'SinStalker_S1',
            characterLevel: 18,
            seasonId: 'season-1',
            seasonName: 'Season 1',
            seasonStatus: 'active',
            seasonEndsAt: '2099-01-01T00:00:00.000Z',
          },
        ],
        switchingPlayerId: null,
        onSwitchPlayer: vi.fn(),
      },
      React.createElement('div', null, 'Child'),
    ),
  );

  expect(screen.queryByRole('button', { name: 'Switch character' })).toBeNull();
  expect(screen.queryByText('Permanent Realm')).toBeNull();
});
```

- [ ] **Step 2: Run the AppShell test file and verify it fails**

Run:

```powershell
npm test -- -w apps/web src/components/AppShell.test.ts
```

Expected:

- FAIL because the header still renders the realm switch button and/or realm label

- [ ] **Step 3: Remove the header switcher and stale helper code**

Update `apps/web/src/components/AppShell.tsx`:

1. Remove the `formatTimeRemaining` import if nothing else uses it:

```ts
import { uiIconSrc } from '@/lib/assets';
```

2. Remove the `realmTimeRemaining()` helper entirely if the header no longer needs it.

3. Remove the `characterDropdownOpen` state and any `closeMenus()` logic that only exists for the header switcher:

```ts
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasMenu = Boolean(onLogout || onWhatsNew);
  const closeMenus = () => {
    setDropdownOpen(false);
  };
```

4. Delete the header `realmLabel` pill block and the entire `hasCharacterPicker` block.

5. Remove the now-unused switcher props from the `AppShell` call in `apps/web/src/app/game/page.tsx`:

```tsx
      <AppShell
        turns={turns}
        username={player?.username}
        mailUnreadCount={mailUnreadCount}
        onMailClick={() => setActiveScreen('mail')}
        onSettings={() => handleNavigate('settings')}
        onLogout={() => { logout(); router.push('/'); }}
        onWhatsNew={openChangelog}
        hasUnseenChangelog={showChangelog}
        backgroundSrc={...}
      >
```

- [ ] **Step 4: Run the AppShell test file and verify it passes**

Run:

```powershell
npm test -- -w apps/web src/components/AppShell.test.ts
```

Expected:

- PASS with the new header-stability test
- Existing mail/settings/username menu tests remain green

- [ ] **Step 5: Commit the header cleanup**

Run:

```powershell
git add apps/web/src/components/AppShell.tsx `
        apps/web/src/components/AppShell.test.ts `
        apps/web/src/app/game/page.tsx
git commit -m "fix(web): remove header realm switch control"
```

---

### Task 3: Final Verification And Tightening

**Files:**
- Modify: `apps/web/src/components/screens/Settings.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/app/game/GameScreenRenderer.tsx`
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/components/screens/Settings.test.ts`
- Modify: `apps/web/src/components/AppShell.test.ts`

- [ ] **Step 1: Tighten realm copy and busy-state details if focused tests exposed rough edges**

If needed after the first two tasks, make small follow-up adjustments only:

```tsx
{realmEndsAt && realmLabel !== 'Permanent Realm' ? (
  <span className="block text-xs text-[var(--rpg-text-secondary)]">
    Ends {typeof realmEndsAt === 'string' ? new Date(realmEndsAt).toLocaleString() : realmEndsAt.toLocaleString()}
  </span>
) : null}
```

Keep this step narrow. Do not introduce a second switching UI or broader Settings refactor.

- [ ] **Step 2: Run both focused component test files together**

Run:

```powershell
npm test -- -w apps/web src/components/AppShell.test.ts src/components/screens/Settings.test.ts
```

Expected:

- PASS for both files

- [ ] **Step 3: Run web typechecking**

Run:

```powershell
npm run typecheck
```

Expected:

- PASS with no new TypeScript errors from the prop-chain changes

- [ ] **Step 4: Run the full web suite**

Run:

```powershell
npm run test -w apps/web
```

Expected:

- PASS
- Existing known noisy console output is acceptable if the command exits successfully

- [ ] **Step 5: Commit the final verification adjustments if any code changed in Task 3**

Run only if Step 1 changed code:

```powershell
git add apps/web/src/components/AppShell.tsx `
        apps/web/src/components/AppShell.test.ts `
        apps/web/src/components/screens/Settings.tsx `
        apps/web/src/components/screens/Settings.test.ts `
        apps/web/src/app/game/GameScreenRenderer.tsx `
        apps/web/src/app/game/page.tsx
git commit -m "test(web): verify mobile realm indicator move"
```

If Task 3 only ran verification and produced no code changes, skip this commit.

---

## Self-Review

- Spec coverage: covered header cleanup, Settings `Current Realm` row, tappable switch entry, single-character static state, seasonal/permanent labels, busy switching state, and focused verification
- Placeholder scan: no `TODO`/`TBD`/“implement later” placeholders remain
- Type consistency: the same prop names are used throughout the plan: `realmLabel`, `realmEndsAt`, `activePlayerId`, `characters`, `switchingPlayerId`, `onSwitchPlayer`
