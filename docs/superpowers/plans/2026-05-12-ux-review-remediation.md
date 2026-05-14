# UX Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the five UX review findings around onboarding overlays, Explore navigation, subnav information architecture, chat overlap, and desktop layout.

**Architecture:** Keep the current Next.js client architecture and screen renderer boundaries. Add one small UI context for global onboarding suppression, keep navigation rules centralized in `useGameController`, and apply responsive layout improvements at shell/component boundaries rather than refactoring unrelated screens.

**Tech Stack:** Next.js 16 App Router, React client components, Tailwind utility classes, Vitest, Testing Library.

---

## File Structure

- Modify `apps/web/src/app/game/page.tsx`
  - Owns modal ordering, global onboarding gating, subnav tab definitions, and bottom nav wiring.
- Modify `apps/web/src/app/game/useGameController.ts`
  - Owns active screen to bottom tab mapping and bottom-tab default navigation.
- Modify `apps/web/src/app/game/useGameController.test.ts`
  - Covers navigation defaults and regrouped screen ownership.
- Modify `apps/web/src/app/game/page.test.tsx`
  - Covers onboarding modal suppression and rendered subnav grouping.
- Modify `apps/web/src/lib/tutorial.ts`
  - Removes duplicate starter-weapon dialog and points travel guidance at Explore.
- Create `apps/web/src/components/common/OnboardingUiContext.tsx`
  - Provides a tiny app-level switch that lets feature tutorials opt out while the guided tutorial or another blocking modal is active.
- Modify `apps/web/src/components/common/FeatureTutorial.tsx`
  - Consumes onboarding context before showing local first-visit feature tutorials.
- Create `apps/web/src/components/common/FeatureTutorial.test.tsx`
  - Covers feature tutorial suppression and later display after the context enables it.
- Modify `apps/web/src/components/ChatPanel.tsx`
  - Moves collapsed and expanded chat above the bottom nav safe area.
- Modify `apps/web/src/components/ChatPanel.test.ts`
  - Covers the safe-area positioning classes.
- Modify `apps/web/src/components/AppShell.tsx`
  - Adds responsive shell width and bottom padding based on bottom nav safe-area variables.
- Modify `apps/web/src/components/AppShell.test.ts`
  - Covers the responsive layout classes.
- Modify `apps/web/src/components/BottomNav.tsx`
  - Adds active nav semantics and uses the shared bottom nav height variable.
- Modify `apps/web/src/components/common/SubNav.tsx`
  - Adds `aria-current`, optional scroll affordance styling, and keeps it as navigation buttons instead of incomplete tab semantics.
- Modify `apps/web/src/app/globals.css`
  - Adds shared bottom nav / floating control CSS variables.

---

## Task 1: Gate Onboarding And Feature Tutorial Overlays

**Files:**
- Create: `apps/web/src/components/common/OnboardingUiContext.tsx`
- Create: `apps/web/src/components/common/FeatureTutorial.test.tsx`
- Modify: `apps/web/src/components/common/FeatureTutorial.tsx`
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/app/game/page.test.tsx`
- Modify: `apps/web/src/lib/tutorial.ts`

- [ ] **Step 1: Write failing tests for feature tutorial suppression**

Add `apps/web/src/components/common/FeatureTutorial.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureTutorial } from './FeatureTutorial';
import { OnboardingUiProvider } from './OnboardingUiContext';

vi.mock('./ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('FeatureTutorial', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('does not show feature tutorials while onboarding suppresses them', () => {
    render(
      <OnboardingUiProvider featureTutorialsEnabled={false}>
        <FeatureTutorial storageKey="howto_test" title="How To Test">
          <p>Feature help</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    expect(screen.queryByText('How To Test')).toBeNull();
    expect(localStorage.getItem('howto_test')).toBeNull();
  });

  it('shows feature tutorials when onboarding allows them', () => {
    render(
      <OnboardingUiProvider featureTutorialsEnabled>
        <FeatureTutorial storageKey="howto_test" title="How To Test">
          <p>Feature help</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    expect(screen.getByText('How To Test')).toBeTruthy();
    expect(screen.getByText('Feature help')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
rtk npx vitest run src/components/common/FeatureTutorial.test.tsx
```

Expected: FAIL because `OnboardingUiContext.tsx` does not exist.

- [ ] **Step 3: Add onboarding UI context**

Create `apps/web/src/components/common/OnboardingUiContext.tsx`:

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface OnboardingUiContextValue {
  featureTutorialsEnabled: boolean;
}

const OnboardingUiContext = createContext<OnboardingUiContextValue>({
  featureTutorialsEnabled: true,
});

interface OnboardingUiProviderProps {
  children: ReactNode;
  featureTutorialsEnabled: boolean;
}

export function OnboardingUiProvider({ children, featureTutorialsEnabled }: OnboardingUiProviderProps) {
  return (
    <OnboardingUiContext.Provider value={{ featureTutorialsEnabled }}>
      {children}
    </OnboardingUiContext.Provider>
  );
}

export function useOnboardingUi() {
  return useContext(OnboardingUiContext);
}
```

- [ ] **Step 4: Make `FeatureTutorial` respect the context**

Modify `apps/web/src/components/common/FeatureTutorial.tsx`:

```tsx
import { useOnboardingUi } from './OnboardingUiContext';
```

Inside the component:

```tsx
const { featureTutorialsEnabled } = useOnboardingUi();

useEffect(() => {
  if (condition && featureTutorialsEnabled && !localStorage.getItem(storageKey)) {
    setShow(true);
  } else {
    setShow(false);
  }
}, [storageKey, condition, featureTutorialsEnabled]);
```

- [ ] **Step 5: Run feature tutorial test**

Run:

```powershell
rtk npx vitest run src/components/common/FeatureTutorial.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Write failing page tests for changelog and starter dialog suppression**

Update `apps/web/src/app/game/page.test.tsx` mocks:

```tsx
vi.mock('@/components/common/ChangelogModal', () => ({
  ChangelogModal: () => <div data-testid="changelog-modal">changelog</div>,
}));

vi.mock('@/components/TutorialDialog', () => ({
  TutorialDialog: ({ tutorialStep }: { tutorialStep: number }) => (
    <div data-testid="tutorial-dialog">tutorial-{tutorialStep}</div>
  ),
}));

vi.mock('@/components/StarterWeaponPopup', () => ({
  StarterWeaponPopup: () => <div data-testid="starter-weapon-popup">starter weapon</div>,
}));
```

Add tests:

```tsx
it('suppresses changelog while the guided tutorial is active', () => {
  useGameControllerMock.mockReturnValue({
    ...createGameControllerState(),
    tutorialStep: 0,
    showChangelog: true,
  });

  render(<GamePage />);

  expect(screen.queryByTestId('changelog-modal')).toBeNull();
});

it('shows starter weapon popup without the duplicate tutorial dialog', () => {
  useGameControllerMock.mockReturnValue({
    ...createGameControllerState(),
    tutorialStep: 1,
  });

  render(<GamePage />);

  expect(screen.getByTestId('starter-weapon-popup')).toBeTruthy();
  expect(screen.queryByTestId('tutorial-dialog')).toBeNull();
});

it('shows changelog after the guided tutorial is complete', () => {
  useGameControllerMock.mockReturnValue({
    ...createGameControllerState(),
    tutorialStep: 999,
    showChangelog: true,
  });

  render(<GamePage />);

  expect(screen.getByTestId('changelog-modal')).toBeTruthy();
});
```

- [ ] **Step 7: Run page tests and verify they fail**

Run:

```powershell
rtk npx vitest run src/app/game/page.test.tsx
```

Expected: FAIL because changelog and tutorial dialog are not gated yet.

- [ ] **Step 8: Remove duplicate starter weapon dialog**

Modify `apps/web/src/lib/tutorial.ts`:

```ts
[TUTORIAL_STEP_STARTER_WEAPON]: {
  banner: 'Kessa Ironweld has a weapon for you. Choose wisely!',
  dialog: null,
  pulseTab: null,
  navigateTo: null,
},
```

- [ ] **Step 9: Gate changelog and feature tutorials in `GamePage`**

Modify `apps/web/src/app/game/page.tsx` imports:

```tsx
import { OnboardingUiProvider } from '@/components/common/OnboardingUiContext';
```

After `const activeTab = getActiveTab();` add:

```tsx
const tutorialFlowActive = isTutorialActive(tutorialStep) || tutorialStep === TUTORIAL_STEP_DONE;
const blockingModalActive = Boolean(
  confirmAbandonLoot ||
  (lootRevealItems && lootRevealItems.length > 0) ||
  (pendingLootSession && !pendingLootSession.minimized),
);
const canShowChangelog = showChangelog && !tutorialFlowActive && !blockingModalActive;
const featureTutorialsEnabled = !tutorialFlowActive && !canShowChangelog && !blockingModalActive;
```

Wrap the existing `ErrorBoundary` contents in the provider. Move every existing modal, `AppShell`, chat, bottom nav, tutorial, and toast element that is currently inside `ErrorBoundary` inside `OnboardingUiProvider`; the only behavioral change in that block is replacing `showChangelog` with `canShowChangelog`.

```tsx
<OnboardingUiProvider featureTutorialsEnabled={featureTutorialsEnabled}>
  <ErrorBoundary>
    {canShowChangelog && <ChangelogModal onDismiss={dismissChangelog} />}
    {/* Keep the existing ConfirmModal, LootReveal, LootPicker, AppShell, ChatPanel, BottomNav, TutorialDialog, StarterWeaponPopup, and toast JSX in its current order. */}
  </ErrorBoundary>
</OnboardingUiProvider>
```

Keep `hasUnseenChangelog={showChangelog}` on `AppShell`, so the menu still indicates unseen changes while the modal is delayed.

- [ ] **Step 10: Run focused onboarding tests**

Run:

```powershell
rtk npx vitest run src/components/common/FeatureTutorial.test.tsx src/app/game/page.test.tsx
```

Expected: PASS.

---

## Task 2: Make Explore Bottom Tab Open Map By Default

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/useGameController.test.ts`
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/lib/tutorial.ts`

- [ ] **Step 1: Write failing controller test for Explore default**

Add to `apps/web/src/app/game/useGameController.test.ts`:

```ts
it('opens the world map when the Explore bottom tab is selected', () => {
  const hook = renderHook(() => useGameController({ isAuthenticated: false }));

  act(() => {
    hook.result.current.handleNavigate('explore');
  });

  expect(hook.result.current.activeScreen).toBe('zones');
  expect(hook.result.current.getActiveTab()).toBe('explore');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
rtk npx vitest run src/app/game/useGameController.test.ts -t "opens the world map"
```

Expected: FAIL because `handleNavigate('explore')` currently resolves to `explore`.

- [ ] **Step 3: Change bottom tab default mapping**

Modify `apps/web/src/app/game/useGameController.ts`:

```ts
const bottomTabDefaults: Record<string, Screen> = {
  explore: 'zones',
  social: 'guild',
};
const resolved = bottomTabDefaults[screen] ?? screen;
setActiveScreen(resolved as Screen);
trackEvent('screen_view', { screen: resolved });
```

- [ ] **Step 4: Rename Explore subtab label**

Modify `apps/web/src/app/game/page.tsx` Explore subnav:

```tsx
{ id: 'zones', label: 'Map' },
{ id: 'explore', label: 'Explore Zone' },
{ id: 'gathering', label: 'Gathering' },
{ id: 'crafting', label: 'Crafting' },
{ id: 'forge', label: 'Forge' },
```

- [ ] **Step 5: Point travel tutorial at Explore**

Modify `apps/web/src/lib/tutorial.ts`:

```ts
[TUTORIAL_STEP_TRAVEL]: {
  banner: 'Open the World Map and travel to the nearest town.',
  dialog: {
    title: 'Zone Travel',
    body: 'Crafting can only be done in towns. Open the World Map to see connected zones and travel to Millbrook, the nearest town. Travelling costs turns based on distance.',
  },
  pulseTab: 'explore',
  navigateTo: 'zones',
},
```

- [ ] **Step 6: Run focused navigation tests**

Run:

```powershell
rtk npx vitest run src/app/game/useGameController.test.ts
```

Expected: PASS.

---

## Task 3: Regroup Subnav Information Architecture

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/useGameController.test.ts`
- Modify: `apps/web/src/app/game/page.test.tsx`
- Modify: `apps/web/src/components/common/SubNav.tsx`
- Modify: `apps/web/src/components/BottomNav.tsx`

- [ ] **Step 1: Write failing controller tests for screen ownership**

Add to `apps/web/src/app/game/useGameController.test.ts`:

```ts
it.each([
  ['skills', 'inventory'],
  ['bestiary', 'combat'],
  ['worldEvents', 'explore'],
  ['casino', 'explore'],
  ['training', 'explore'],
] as const)('groups %s under the %s bottom tab', (screen, tab) => {
  const hook = renderHook(() => useGameController({ isAuthenticated: false }));

  act(() => {
    hook.result.current.setActiveScreen(screen);
  });

  expect(hook.result.current.getActiveTab()).toBe(tab);
});
```

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```powershell
rtk npx vitest run src/app/game/useGameController.test.ts -t "groups"
```

Expected: FAIL because these screens still map to `home`.

- [ ] **Step 3: Update active tab mapping**

Modify `apps/web/src/app/game/useGameController.ts`:

```ts
const getActiveTab = () => {
  if (['home', 'achievements', 'quests', 'leaderboard', 'admin'].includes(activeScreen)) return 'home';
  if (['zones', 'explore', 'gathering', 'crafting', 'forge', 'worldEvents', 'casino', 'training'].includes(activeScreen)) return 'explore';
  if (['inventory', 'equipment', 'skills'].includes(activeScreen)) return 'inventory';
  if (['combat', 'arena', 'templates', 'talentTree', 'bestiary'].includes(activeScreen)) return 'combat';
  if (['guild', 'friends', 'mail'].includes(activeScreen)) return 'social';
  return 'home';
};
```

- [ ] **Step 4: Update subnav tab definitions**

Modify `apps/web/src/app/game/page.tsx`.

Home:

```tsx
tabs={[
  { id: 'home', label: 'Dashboard' },
  { id: 'quests', label: 'Quests', badge: quests.filter(q => q.status === 'completed').length },
  { id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
  { id: 'leaderboard', label: 'Rankings' },
  ...(player?.role === 'admin' ? [{ id: 'admin', label: 'Admin' }] : []),
]}
```

Explore:

```tsx
tabs={[
  { id: 'zones', label: 'Map' },
  { id: 'explore', label: 'Explore Zone' },
  { id: 'gathering', label: 'Gathering' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'forge', label: 'Forge' },
  { id: 'worldEvents', label: 'Events' },
  ...(currentZone?.zoneType === 'town' ? [
    { id: 'training', label: 'Training' },
    { id: 'casino', label: 'Casino' },
  ] : []),
]}
```

Inventory:

```tsx
tabs={[
  { id: 'inventory', label: 'Items' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'skills', label: 'Skills' },
]}
```

Combat:

```tsx
tabs={[
  { id: 'combat', label: 'Combat' },
  { id: 'templates', label: 'Templates' },
  { id: 'talentTree', label: 'Skill Tree' },
  { id: 'bestiary', label: 'Bestiary' },
  { id: 'arena', label: 'Arena', badge: pvpNotificationCount },
]}
```

- [ ] **Step 5: Improve nav semantics**

Modify `apps/web/src/components/BottomNav.tsx` button:

```tsx
<button
  type="button"
  key={item.id}
  onClick={() => onNavigate(item.id)}
  aria-current={isActive ? 'page' : undefined}
  className={cn(
    'relative flex flex-col items-center justify-center w-full h-full transition-colors',
    isActive ? 'text-[var(--rpg-gold)] rpg-nav-active' : 'text-[var(--rpg-text-secondary)]'
  )}
>
```

Modify `apps/web/src/components/common/SubNav.tsx` wrapper and button:

```tsx
<nav className="relative mb-4 overflow-hidden" aria-label={ariaLabel}>
  <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {tabs.map((tab) => (
      <button
        type="button"
        key={tab.id}
        aria-current={tab.id === activeId ? 'page' : undefined}
        onClick={() => onSelect(tab.id)}
        className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
          activeId === tab.id
            ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
            : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
        }`}
      >
```

Remove `role="tablist"`, `role="tab"`, and `aria-selected` unless full arrow-key tab behavior is added later.

- [ ] **Step 6: Run focused nav tests**

Run:

```powershell
rtk npx vitest run src/app/game/useGameController.test.ts src/app/game/page.test.tsx
```

Expected: PASS.

---

## Task 4: Move Chat Above Bottom Navigation Safe Area

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/components/ChatPanel.test.ts`

- [ ] **Step 1: Write failing chat positioning test**

Add to `apps/web/src/components/ChatPanel.test.ts`:

```ts
it('positions collapsed chat above the bottom navigation safe area', () => {
  render(
    React.createElement(ChatPanel, {
      isOpen: false,
      toggleChat: vi.fn(),
      activeChannel: 'world',
      setActiveChannel: vi.fn(),
      worldMessages: [],
      globalActivityMessages: [],
      zoneMessages: [],
      casinoMessages: [],
      presence: { worldOnline: 1, zoneOnline: {} },
      unreadWorld: 0,
      unreadZone: 0,
      unreadCasino: 0,
      casinoActive: false,
      sendMessage: vi.fn(),
      rateLimitError: null,
      currentZoneId: null,
      currentZoneName: null,
      playerId: 'p2',
      pinnedMessage: null,
    }),
  );

  expect(screen.getByLabelText('Open chat').className).toContain('var(--rpg-bottom-nav-offset)');
});
```

- [ ] **Step 2: Run chat test and verify it fails**

Run:

```powershell
rtk npx vitest run src/components/ChatPanel.test.ts -t "positions collapsed chat"
```

Expected: FAIL because the class still uses `bottom-20`.

- [ ] **Step 3: Add shared bottom nav variables**

Modify `apps/web/src/app/globals.css` near safe area utilities:

```css
:root {
  --rpg-bottom-nav-height: 4.5rem;
  --rpg-bottom-nav-offset: calc(var(--rpg-bottom-nav-height) + env(safe-area-inset-bottom));
}
```

- [ ] **Step 4: Use shared variables in bottom nav and chat**

Modify `apps/web/src/components/BottomNav.tsx`:

```tsx
<div className="max-w-lg lg:max-w-3xl mx-auto flex justify-around items-center h-[var(--rpg-bottom-nav-height)]">
```

Modify collapsed chat button in `apps/web/src/components/ChatPanel.tsx`:

```tsx
className="fixed bottom-[calc(var(--rpg-bottom-nav-offset)+0.75rem)] right-4 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-[var(--rpg-surface)] border border-[var(--rpg-border)] shadow-lg hover:border-[var(--rpg-gold)] transition-colors"
```

Modify expanded chat wrapper:

```tsx
<div className="fixed bottom-[var(--rpg-bottom-nav-offset)] left-0 right-0 z-30 flex justify-center pointer-events-none">
```

Modify expanded panel max height:

```tsx
style={{ maxHeight: 'min(55vh, calc(100dvh - var(--rpg-bottom-nav-offset) - 5rem))' }}
```

- [ ] **Step 5: Run focused chat tests**

Run:

```powershell
rtk npx vitest run src/components/ChatPanel.test.ts
```

Expected: PASS.

---

## Task 5: Add Responsive Desktop Shell And Map Capacity

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppShell.test.ts`
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

- [ ] **Step 1: Write failing AppShell responsive width test**

Add to `apps/web/src/components/AppShell.test.ts`:

```ts
it('uses a wider content frame on desktop viewports', () => {
  const { container } = render(
    React.createElement(
      AppShell,
      { username: 'Rook', onSettings: vi.fn() },
      React.createElement('div', null, 'Child'),
    ),
  );

  expect(container.querySelector('main')?.className).toContain('lg:max-w-5xl');
  expect(container.querySelector('main')?.className).toContain('var(--rpg-bottom-nav-offset)');
});
```

- [ ] **Step 2: Run AppShell test and verify it fails**

Run:

```powershell
rtk npx vitest run src/components/AppShell.test.ts -t "wider content frame"
```

Expected: FAIL because the main shell is still `max-w-lg pb-24`.

- [ ] **Step 3: Widen header and main shell**

Modify `apps/web/src/components/AppShell.tsx`:

```tsx
<div className="max-w-lg lg:max-w-5xl mx-auto h-14 px-4 flex items-center justify-between">
```

Modify `main`:

```tsx
<main className="w-full max-w-lg lg:max-w-5xl mx-auto px-4 pt-2 pb-[calc(var(--rpg-bottom-nav-offset)+1.5rem)] flex-1">
```

- [ ] **Step 4: Give Zone Map a desktop two-column frame**

Modify `apps/web/src/components/screens/ZoneMap.tsx` so the selected zone panel and map can sit side-by-side on desktop:

```tsx
<div className="lg:grid lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] lg:gap-4 lg:items-start">
  <div className="lg:sticky lg:top-20">
    {/* Move the existing travel playback block and selected-zone card block here unchanged. */}
  </div>

  <div className={travelPlaybackData ? 'overflow-x-auto pb-1 opacity-60 saturate-50 transition-all' : 'overflow-x-auto pb-1 transition-all'}>
    {/* Move the existing tiered map div, SVG connection lines, zone buttons, undiscovered hints, and activity log here unchanged. */}
  </div>
</div>
```

Keep the current mobile ordering and existing selected-zone card behavior; only add the desktop grid wrapper.

- [ ] **Step 5: Run focused shell tests**

Run:

```powershell
rtk npx vitest run src/components/AppShell.test.ts
```

Expected: PASS.

---

## Task 6: End-To-End Verification And Cleanup

**Files:**
- Review all touched files from Tasks 1-5.

- [ ] **Step 1: Run focused unit tests**

Run:

```powershell
rtk npx vitest run src/components/common/FeatureTutorial.test.tsx src/app/game/useGameController.test.ts src/app/game/page.test.tsx src/components/ChatPanel.test.ts src/components/AppShell.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```powershell
rtk npm run typecheck
```

Expected: TypeScript exits cleanly.

- [ ] **Step 3: Run lint**

Run:

```powershell
rtk npm run lint
```

Expected: lint exits cleanly.

- [ ] **Step 4: Run broad web build if focused checks pass**

Run:

```powershell
rtk npm run build:web
```

Expected: build exits cleanly.

- [ ] **Step 5: Run live visual smoke check if the dev server is already running**

Do not start a dev server unless the user asks. If `http://localhost:3002` already responds, check:

```powershell
Invoke-WebRequest -Uri http://localhost:3002 -UseBasicParsing -TimeoutSec 5
```

Then use a disposable local account or existing session to verify:

- Fresh onboarding shows one blocking modal at a time.
- Bottom Explore opens Map.
- Explore subnav reads `Map`, `Explore Zone`, `Gathering`, `Crafting`, `Forge`, plus moved town/event items when applicable.
- Chat bubble and expanded chat sit above the bottom nav and do not cover the turn controls.
- Desktop map uses the wider frame and does not leave the whole game locked to a narrow mobile column.

- [ ] **Step 6: Run simplify pass**

Use the `$simplify` skill on the touched diff:

- Remove duplicate constants if any were introduced.
- Keep the onboarding context minimal; do not generalize it into a modal manager unless the implementation actually needs it.
- Keep responsive shell classes in shared shell/nav components rather than duplicating arbitrary widths in individual screens.

- [ ] **Step 7: Re-run focused verification after simplify**

Run:

```powershell
rtk npx vitest run src/components/common/FeatureTutorial.test.tsx src/app/game/useGameController.test.ts src/app/game/page.test.tsx src/components/ChatPanel.test.ts src/components/AppShell.test.ts
rtk npm run typecheck
```

Expected: all tests PASS and TypeScript exits cleanly.

---

## Self-Review

- Finding 1 is covered by Task 1: changelog, starter tutorial duplication, and feature tutorials are gated during guided onboarding.
- Finding 2 is covered by Task 2: bottom Explore resolves to `zones`, and the nested action label becomes `Explore Zone`.
- Finding 3 is covered by Task 3: Home is reduced to status/progression, while Bestiary, Skills, Events, Casino, and Training move to more relevant tabs.
- Finding 4 is covered by Task 4: chat uses shared bottom-nav safe area offsets.
- Finding 5 is covered by Task 5: shell width expands on desktop and Zone Map gains a desktop frame that can use the wider space.
- No placeholder tasks remain.
- Tests are focused first, then broadened to typecheck, lint, and build.
