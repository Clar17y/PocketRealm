# Vex Merchant Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-facing Vex merchant access path from World Events and a dedicated Vex exchange screen.

**Architecture:** Keep Vex as a permanent secondary Explore screen for this slice. The World Events screen owns discovery/entry, `VexScreen` owns exchange UI and purchases, and existing Vex API/client helpers remain the data boundary. No backend availability state is added.

**Tech Stack:** Next.js 16 client components, React, Vitest, Testing Library, existing `fetchApi` wrappers, shared Vex DTOs, existing game controller navigation/state-update plumbing.

---

## File Structure

- Create `apps/web/src/components/screens/VexScreen.tsx`
  - Owns loading exchanges, category filtering, target item selection, purchase calls, success/error state, and state update callback.
- Create `apps/web/src/components/screens/VexScreen.test.tsx`
  - Tests loading, blocked exchanges, target selection, purchase state updates, and refresh after purchase.
- Modify `apps/web/src/components/screens/WorldEvents.tsx`
  - Adds a compact `Vex's Camp` panel with a `Trade with Vex` button calling `onNavigate('vex')`.
- Create `apps/web/src/components/screens/WorldEvents.test.tsx`
  - Tests camp rendering and navigation callback.
- Modify `apps/web/src/app/game/gameController.types.ts`
  - Adds `'vex'` to `Screen`.
- Modify `apps/web/src/app/game/useGameController.ts`
  - Maps `vex` to the Explore bottom tab.
- Modify `apps/web/src/app/game/useGameController.test.ts`
  - Verifies `vex` groups under Explore.
- Modify `apps/web/src/app/game/renderers/coreScreenRenderers.tsx`
  - Imports and renders `VexScreen`.
- Modify `apps/web/src/app/game/GameScreenRenderer.tsx`
  - Adds the `case 'vex'` renderer branch.
- Modify `packages/shared/src/constants/npcDialogue.ts`
  - Adds Vex dialogue using existing `greeting`, `idle`, `buy`, and `farewell` events. Do not add a new `purchase` dialogue event.

---

### Task 1: Add Vex Screen Component

**Files:**
- Create: `apps/web/src/components/screens/VexScreen.tsx`
- Create: `apps/web/src/components/screens/VexScreen.test.tsx`

- [ ] **Step 1: Write the Vex screen tests**

Create `apps/web/src/components/screens/VexScreen.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VexExchangeListResponse, VexPurchaseResponse, StateUpdates } from '@pocketrealm/shared';

const apiMocks = vi.hoisted(() => ({
  getVexExchanges: vi.fn(),
  purchaseVexExchange: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getVexExchanges: apiMocks.getVexExchanges,
    purchaseVexExchange: apiMocks.purchaseVexExchange,
  };
});

vi.mock('@/components/common/NpcDialogueBanner', () => ({
  NpcDialogueBanner: () => <div data-testid="vex-dialogue" />,
}));

import { VexScreen } from './VexScreen';

const listResponse: VexExchangeListResponse = {
  gold: 5000,
  exchanges: [
    {
      key: 'wayfarer_aegis',
      name: 'Wayfarer Aegis',
      description: 'Trade Alpha Wolf trophies for an accuracy off-hand.',
      category: 'item',
      goldCost: 750,
      playerGold: 5000,
      requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 4, ownedQuantity: 5 }],
      targetOptions: [],
      canPurchase: true,
      blockedReason: null,
      sortOrder: 10,
    },
    {
      key: 'spiritbound_aegis',
      name: 'Spiritbound Aegis',
      description: 'Upgrade a Wayfarer Aegis with Spirit Essence.',
      category: 'upgrade',
      goldCost: 2500,
      playerGold: 5000,
      requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 6, ownedQuantity: 6 }],
      targetOptions: [
        {
          itemId: 'aegis-1',
          itemName: 'Wayfarer Aegis',
          slot: 'off_hand',
          rarity: 'common',
          currentDurability: 40,
          maxDurability: 40,
          alreadyApplied: false,
          baseStats: { armor: 2, accuracy: 3 },
          bonusStats: null,
        },
      ],
      canPurchase: true,
      blockedReason: null,
      sortOrder: 20,
    },
    {
      key: 'fangstone',
      name: 'Fangstone',
      description: 'Set Alpha Wolf pressure into a boss-crafted item.',
      category: 'boss_stone',
      goldCost: 1500,
      playerGold: 5000,
      requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 3, ownedQuantity: 1 }],
      targetOptions: [],
      canPurchase: false,
      blockedReason: 'Not enough Alpha Wolf Fang',
      sortOrder: 50,
    },
  ],
};

function mockList(response: VexExchangeListResponse = listResponse) {
  apiMocks.getVexExchanges.mockResolvedValue({ data: response });
}

describe('VexScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList();
  });

  afterEach(() => cleanup());

  it('loads exchanges and renders Vex merchant cards', async () => {
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue />);

    expect(screen.getByText('Loading Vex exchanges...')).toBeTruthy();
    expect(await screen.findByText('Vex, Collector of Trophies')).toBeTruthy();
    expect(screen.getByText('Gold: 5,000')).toBeTruthy();
    expect(screen.getByText('Wayfarer Aegis')).toBeTruthy();
    expect(screen.getByText('Alpha Wolf Fang: 5 / 4')).toBeTruthy();
    expect(screen.getByText('Not enough Alpha Wolf Fang')).toBeTruthy();
    expect(screen.getByTestId('vex-dialogue')).toBeTruthy();
  });

  it('requires target selection for target-based exchanges', async () => {
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Spiritbound Aegis');

    const purchaseButtons = screen.getAllByRole('button', { name: 'Trade' });
    const spiritButton = purchaseButtons[1];
    expect(spiritButton).toBeDisabled();
    expect(screen.getByText('Choose an item first.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Target item for Spiritbound Aegis'), {
      target: { value: 'aegis-1' },
    });

    expect(spiritButton).not.toBeDisabled();
  });

  it('purchases an exchange, applies state updates, shows success, and refreshes exchanges', async () => {
    const onStateUpdates = vi.fn();
    const stateUpdates: StateUpdates = {
      gold: 4250,
      materialTotals: { 'fang-template': 1 },
    };
    const purchaseResponse: VexPurchaseResponse = {
      exchangeKey: 'wayfarer_aegis',
      message: 'Created Wayfarer Aegis',
      stateUpdates,
    };

    apiMocks.purchaseVexExchange.mockResolvedValue({ data: purchaseResponse });
    render(<VexScreen onStateUpdates={onStateUpdates} showNpcDialogue={false} />);

    await screen.findByText('Wayfarer Aegis');
    fireEvent.click(screen.getAllByRole('button', { name: 'Trade' })[0]);

    await waitFor(() => expect(apiMocks.purchaseVexExchange).toHaveBeenCalledWith('wayfarer_aegis', undefined));
    expect(onStateUpdates).toHaveBeenCalledWith(stateUpdates);
    expect(await screen.findByText('Created Wayfarer Aegis')).toBeTruthy();
    expect(apiMocks.getVexExchanges).toHaveBeenCalledTimes(2);
  });

  it('passes selected target item when purchasing a targeted exchange', async () => {
    apiMocks.purchaseVexExchange.mockResolvedValue({
      data: { exchangeKey: 'spiritbound_aegis', message: 'Created Spiritbound Aegis' },
    });
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Spiritbound Aegis');
    fireEvent.change(screen.getByLabelText('Target item for Spiritbound Aegis'), {
      target: { value: 'aegis-1' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Trade' })[1]);

    await waitFor(() => expect(apiMocks.purchaseVexExchange).toHaveBeenCalledWith(
      'spiritbound_aegis',
      { targetItemId: 'aegis-1' },
    ));
  });

  it('shows API errors and keeps the screen usable', async () => {
    apiMocks.purchaseVexExchange.mockResolvedValue({
      error: { message: 'This season has ended.', code: 'SEASON_ENDED' },
    });
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Wayfarer Aegis');
    fireEvent.click(screen.getAllByRole('button', { name: 'Trade' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('This season has ended.');
    expect(screen.getAllByRole('button', { name: 'Trade' })[0]).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/VexScreen.test.tsx
```

Expected: FAIL because `VexScreen.tsx` does not exist.

- [ ] **Step 3: Implement `VexScreen`**

Create `apps/web/src/components/screens/VexScreen.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Package, Shield, Sparkles, Wrench } from 'lucide-react';
import type { StateUpdates, VexExchangeCategory, VexExchangeView } from '@pocketrealm/shared';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { getVexExchanges, purchaseVexExchange } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';

type VexFilter = 'all' | VexExchangeCategory;
const VEX_NPC_KEY = 'vex-collector' as NpcKey;

interface VexScreenProps {
  onStateUpdates?: (updates: StateUpdates) => void;
  showNpcDialogue?: boolean;
}

const CATEGORY_LABELS: Record<VexExchangeCategory, string> = {
  item: 'Gear',
  upgrade: 'Upgrades',
  service: 'Tempering',
  boss_stone: 'Boss Stones',
};

const FILTER_TABS: Array<{ id: VexFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'item', label: 'Gear' },
  { id: 'upgrade', label: 'Upgrades' },
  { id: 'service', label: 'Tempering' },
  { id: 'boss_stone', label: 'Boss Stones' },
];

function categoryIcon(category: VexExchangeCategory) {
  if (category === 'item') return Package;
  if (category === 'upgrade') return Shield;
  if (category === 'service') return Wrench;
  return Sparkles;
}

function targetLabel(target: VexExchangeView['targetOptions'][number]) {
  const durability = target.maxDurability
    ? ` - ${target.currentDurability ?? target.maxDurability}/${target.maxDurability} durability`
    : '';
  const applied = target.alreadyApplied ? ' - already applied' : '';
  return `${target.itemName} (${target.rarity})${durability}${applied}`;
}

function RequirementLine({ requirement }: { requirement: VexExchangeView['requiredItems'][number] }) {
  const hasEnough = requirement.ownedQuantity >= requirement.quantity;
  return (
    <span className={hasEnough ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}>
      {requirement.itemTemplateName}: {requirement.ownedQuantity.toLocaleString()} / {requirement.quantity.toLocaleString()}
    </span>
  );
}

function ExchangeCard({
  exchange,
  selectedTargetId,
  purchasing,
  onTargetChange,
  onPurchase,
}: {
  exchange: VexExchangeView;
  selectedTargetId: string;
  purchasing: boolean;
  onTargetChange: (exchangeKey: string, itemId: string) => void;
  onPurchase: (exchange: VexExchangeView) => void;
}) {
  const Icon = categoryIcon(exchange.category);
  const requiresTarget = exchange.targetOptions.length > 0;
  const selectedTarget = exchange.targetOptions.find((target) => target.itemId === selectedTargetId);
  const needsTarget = requiresTarget && !selectedTarget;
  const purchaseDisabled = purchasing || !exchange.canPurchase || needsTarget || selectedTarget?.alreadyApplied;

  return (
    <PixelCard padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-[var(--rpg-gold)] flex-shrink-0" />
            <h3 className="font-almendra text-lg font-bold text-[var(--rpg-text-primary)]">
              {exchange.name}
            </h3>
          </div>
          <p className="text-sm text-[var(--rpg-text-secondary)] leading-snug">
            {exchange.description}
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm text-[var(--rpg-gold)] whitespace-nowrap">
          <Coins size={14} />
          {exchange.goldCost.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded border border-[var(--rpg-border)] px-2 py-1 text-[var(--rpg-text-secondary)]">
          {CATEGORY_LABELS[exchange.category]}
        </span>
        {exchange.requiredItems.map((requirement) => (
          <span key={requirement.itemTemplateName} className="rounded border border-[var(--rpg-border)] px-2 py-1">
            <RequirementLine requirement={requirement} />
          </span>
        ))}
      </div>

      {requiresTarget && (
        <label className="block text-sm text-[var(--rpg-text-secondary)]">
          Target item for {exchange.name}
          <select
            className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-[var(--rpg-text-primary)]"
            value={selectedTargetId}
            onChange={(event) => onTargetChange(exchange.key, event.target.value)}
            aria-label={`Target item for ${exchange.name}`}
          >
            <option value="">Choose an item</option>
            {exchange.targetOptions.map((target) => (
              <option key={target.itemId} value={target.itemId} disabled={target.alreadyApplied}>
                {targetLabel(target)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--rpg-red)] min-h-[1rem]">
          {exchange.blockedReason ?? (needsTarget ? 'Choose an item first.' : '')}
        </p>
        <PixelButton
          type="button"
          variant="gold"
          size="sm"
          disabled={purchaseDisabled}
          onClick={() => onPurchase(exchange)}
        >
          {purchasing ? 'Trading...' : 'Trade'}
        </PixelButton>
      </div>
    </PixelCard>
  );
}

export function VexScreen({ onStateUpdates, showNpcDialogue = true }: VexScreenProps) {
  const [exchanges, setExchanges] = useState<VexExchangeView[]>([]);
  const [gold, setGold] = useState(0);
  const [activeFilter, setActiveFilter] = useState<VexFilter>('all');
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);

  const loadExchanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getVexExchanges();
    if (response.error) {
      setError(response.error.message);
    } else if (response.data) {
      setExchanges([...response.data.exchanges].sort((a, b) => a.sortOrder - b.sortOrder));
      setGold(response.data.gold);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadExchanges();
  }, [loadExchanges]);

  const visibleExchanges = useMemo(
    () => activeFilter === 'all'
      ? exchanges
      : exchanges.filter((exchange) => exchange.category === activeFilter),
    [activeFilter, exchanges],
  );

  const handleTargetChange = (exchangeKey: string, itemId: string) => {
    setSelectedTargets((prev) => ({ ...prev, [exchangeKey]: itemId }));
  };

  const handlePurchase = async (exchange: VexExchangeView) => {
    const targetItemId = selectedTargets[exchange.key];
    const params = exchange.targetOptions.length > 0 ? { targetItemId } : undefined;

    setPurchasingKey(exchange.key);
    setError(null);
    setSuccess(null);

    const response = await purchaseVexExchange(exchange.key, params);
    if (response.error) {
      setError(response.error.message);
      setPurchasingKey(null);
      return;
    }

    if (response.data?.stateUpdates) {
      onStateUpdates?.(response.data.stateUpdates);
    }
    setSuccess(response.data?.message ?? 'Trade complete.');
    setSelectedTargets((prev) => ({ ...prev, [exchange.key]: '' }));
    setPurchasingKey(null);
    await loadExchanges();
  };

  return (
    <ScreenContainer>
      <NpcDialogueBanner npcKey={VEX_NPC_KEY} event={success ? 'buy' : 'greeting'} showDialogue={showNpcDialogue} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-almendra text-[var(--rpg-gold)]">
              Vex, Collector of Trophies
            </h2>
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded border border-[var(--rpg-border)] px-3 py-2 text-[var(--rpg-gold)]">
            <Coins size={16} />
            Gold: {gold.toLocaleString()}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {success && (
          <div role="status" className="rounded border border-[var(--rpg-green-light)] bg-[var(--rpg-green-light)]/10 p-3 text-sm text-[var(--rpg-green-light)]">
            {success}
          </div>
        )}

        <SubNav tabs={FILTER_TABS} activeId={activeFilter} onSelect={setActiveFilter} ariaLabel="Vex exchange categories" />

        {loading && <PixelCard className="text-sm text-[var(--rpg-text-secondary)]">Loading Vex exchanges...</PixelCard>}

        {!loading && visibleExchanges.length === 0 && (
          <PixelCard className="text-sm text-[var(--rpg-text-secondary)]">
            Vex has nothing to trade right now.
          </PixelCard>
        )}

        {!loading && visibleExchanges.length > 0 && (
          <div className="space-y-3">
            {visibleExchanges.map((exchange) => (
              <ExchangeCard
                key={exchange.key}
                exchange={exchange}
                selectedTargetId={selectedTargets[exchange.key] ?? ''}
                purchasing={purchasingKey === exchange.key}
                onTargetChange={handleTargetChange}
                onPurchase={(selectedExchange) => void handlePurchase(selectedExchange)}
              />
            ))}
          </div>
        )}
      </div>
    </ScreenContainer>
  );
}
```

- [ ] **Step 4: Run the Vex screen test**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/VexScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/web/src/components/screens/VexScreen.tsx apps/web/src/components/screens/VexScreen.test.tsx
git commit -m "feat: add Vex merchant screen"
```

---

### Task 2: Add World Events Vex Camp Entry Point

**Files:**
- Modify: `apps/web/src/components/screens/WorldEvents.tsx`
- Create: `apps/web/src/components/screens/WorldEvents.test.tsx`

- [ ] **Step 1: Write the World Events test**

Create `apps/web/src/components/screens/WorldEvents.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getActiveEvents: vi.fn(),
  getActiveBossEncounters: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getActiveEvents: apiMocks.getActiveEvents,
    getActiveBossEncounters: apiMocks.getActiveBossEncounters,
  };
});

vi.mock('@/components/BossEncounterPanel', () => ({
  BossEncounterPanel: () => <div>Boss detail</div>,
}));

import { WorldEvents } from './WorldEvents';

describe('WorldEvents Vex camp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getActiveEvents.mockResolvedValue({ data: { events: [] } });
    apiMocks.getActiveBossEncounters.mockResolvedValue({ data: { encounters: [] } });
  });

  afterEach(() => cleanup());

  it('renders Vex camp and navigates to the Vex screen', async () => {
    const onNavigate = vi.fn();
    render(
      <WorldEvents
        currentZoneId="zone-1"
        currentZoneName="Forest Edge"
        playerId="player-1"
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByText("Vex's Camp")).toBeTruthy();
    expect(screen.getByText('A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trade with Vex' }));

    expect(onNavigate).toHaveBeenCalledWith('vex');
  });

  it('keeps Vex camp visible when active bosses are present', async () => {
    apiMocks.getActiveBossEncounters.mockResolvedValue({
      data: {
        encounters: [{
          id: 'boss-1',
          mobName: 'Alpha Wolf',
          mobLevel: 10,
          zoneName: 'Forest Edge',
          maxHp: 100,
          currentHp: 75,
          roundNumber: 1,
          status: 'active',
          nextRoundAt: null,
        }],
      },
    });

    render(
      <WorldEvents
        currentZoneId="zone-1"
        currentZoneName="Forest Edge"
        playerId="player-1"
        onNavigate={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Alpha Wolf')).toBeTruthy());
    expect(screen.getByText("Vex's Camp")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the World Events test to verify it fails**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/WorldEvents.test.tsx
```

Expected: FAIL because `Vex's Camp` is not rendered yet.

- [ ] **Step 3: Add the Vex camp panel**

In `apps/web/src/components/screens/WorldEvents.tsx`, add this component after `EventCard`:

```tsx
function VexCampCard({ onNavigate }: { onNavigate: (screen: string) => void }) {
  return (
    <PixelCard className="p-4 border-[var(--rpg-gold)]/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-almendra text-lg font-bold text-[var(--rpg-gold)]">
            Vex&apos;s Camp
          </h3>
          <p className="text-sm text-[var(--rpg-text-secondary)]">
            A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.
          </p>
        </div>
        <PixelButton type="button" variant="gold" size="sm" onClick={() => onNavigate('vex')}>
          Trade with Vex
        </PixelButton>
      </div>
    </PixelCard>
  );
}
```

Then render it inside the main `ScreenContainer`, after the selected boss detail block and before the active boss encounter list:

```tsx
      <VexCampCard onNavigate={onNavigate} />
```

This placement keeps Vex visible between boss spawns and puts him above the empty state when no events exist.

- [ ] **Step 4: Run the World Events test**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/WorldEvents.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/web/src/components/screens/WorldEvents.tsx apps/web/src/components/screens/WorldEvents.test.tsx
git commit -m "feat: add Vex camp to world events"
```

---

### Task 3: Wire Vex Into Game Navigation

**Files:**
- Modify: `apps/web/src/app/game/gameController.types.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/useGameController.test.ts`
- Modify: `apps/web/src/app/game/renderers/coreScreenRenderers.tsx`
- Modify: `apps/web/src/app/game/GameScreenRenderer.tsx`

- [ ] **Step 1: Update the controller test**

In `apps/web/src/app/game/useGameController.test.ts`, extend the existing bottom-tab grouping table:

```ts
  it.each([
    ['skills', 'inventory'],
    ['bestiary', 'combat'],
    ['worldEvents', 'explore'],
    ['vex', 'explore'],
    ['casino', 'explore'],
    ['training', 'explore'],
  ] as const)('groups %s under the %s bottom tab', (screen, tab) => {
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```powershell
rtk npm run test -w apps/web -- src/app/game/useGameController.test.ts
```

Expected: FAIL because `vex` is not mapped to the Explore tab.

- [ ] **Step 3: Add `vex` to the screen type**

In `apps/web/src/app/game/gameController.types.ts`, add `'vex'` after `'worldEvents'`:

```ts
  | 'worldEvents'
  | 'vex'
  | 'achievements'
```

- [ ] **Step 4: Map `vex` to Explore**

In `apps/web/src/app/game/useGameController.ts`, update `getActiveTab()`:

```ts
    if (['zones', 'explore', 'gathering', 'crafting', 'forge', 'worldEvents', 'vex', 'casino', 'training'].includes(activeScreen)) return 'explore';
```

- [ ] **Step 5: Add a renderer for Vex**

In `apps/web/src/app/game/renderers/coreScreenRenderers.tsx`, add the import:

```ts
import { VexScreen } from '@/components/screens/VexScreen';
```

Add the renderer function near `WorldEventsScreenRenderer`:

```tsx
export function VexScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <VexScreen
      onStateUpdates={(updates) => void gc.handleStateUpdates(updates)}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}
```

In `apps/web/src/app/game/GameScreenRenderer.tsx`, include `VexScreenRenderer` in the core renderer import list:

```ts
  VexScreenRenderer,
```

Add a switch branch after `worldEvents`:

```tsx
    case 'vex':
      return <VexScreenRenderer gc={gc} />;
```

- [ ] **Step 6: Run focused web tests**

Run:

```powershell
rtk npm run test -w apps/web -- src/app/game/useGameController.test.ts src/components/screens/VexScreen.test.tsx src/components/screens/WorldEvents.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/web/src/app/game/gameController.types.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/useGameController.test.ts apps/web/src/app/game/renderers/coreScreenRenderers.tsx apps/web/src/app/game/GameScreenRenderer.tsx
git commit -m "feat: wire Vex merchant navigation"
```

---

### Task 4: Add Vex NPC Dialogue

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`
- Optional test if needed: `apps/web/src/components/screens/VexScreen.test.tsx`

- [ ] **Step 1: Add dialogue to constants**

In `packages/shared/src/constants/npcDialogue.ts`, add this entry near other merchant/shopkeeper NPCs inside `NPC_DIALOGUE`:

```ts
  'vex-collector': {
    name: 'Vex',
    location: 'A travelling camp near the World Events board',
    personality: 'Patient, dry, and more interested in trophies than coin.',
    lines: {
      greeting: [
        'Boss trophies, broken relics, strange stones. Lay them out. I will tell you which ones still have a use.',
        'You brought proof of a hard fight. Good. Most people bring stories. Stories weigh nothing and buy less.',
        'The beasts leave marks on the world when they fall. I collect the parts that keep remembering.',
      ],
      idle: [
        'Gold is useful. Trophies are honest. A fang does not pretend it came from somewhere safe.',
        'Every shield wants a second life. Every blade wants a better story. I arrange introductions.',
        'World bosses are wasteful creatures. They die carrying things they never understood.',
      ],
      buy: [
        'There. The trophy remembers the fight, and now your gear does too.',
        'A fair trade. The dead beast keeps its pride. You keep the useful part.',
        'Done. Do not call it luck when it saves you later. Luck is less reliable than craft.',
      ],
      farewell: [
        'Bring back what the wilds refuse to surrender willingly.',
        'If the ground shakes, follow the brave. Then bring me what is left.',
        'Do not polish the trophies. Dirt is provenance.',
      ],
    },
  },
```

Do not change the `DialogueEvent` union. Use the existing `buy` event for successful Vex trades.

- [ ] **Step 2: Run shared package tests**

Run:

```powershell
rtk npm run test -w packages/shared -- src/constants/__tests__/npcDialogue.test.ts
```

If that exact file does not exist, run:

```powershell
rtk npm run test -w packages/shared -- src/packageExports.test.ts
```

Expected: PASS.

- [ ] **Step 3: Remove the temporary NPC key assertion**

In `apps/web/src/components/screens/VexScreen.tsx`, change:

```ts
const VEX_NPC_KEY = 'vex-collector' as NpcKey;
```

to:

```ts
const VEX_NPC_KEY: NpcKey = 'vex-collector';
```

This should compile after `NPC_DIALOGUE` includes the `vex-collector` entry.

- [ ] **Step 4: Run Vex screen test**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/VexScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add packages/shared/src/constants/npcDialogue.ts apps/web/src/components/screens/VexScreen.tsx apps/web/src/components/screens/VexScreen.test.tsx
git commit -m "feat: add Vex merchant dialogue"
```

If `apps/web/src/components/screens/VexScreen.test.tsx` is unchanged, omit it from `git add`.

---

### Task 5: Final Verification And Cleanup

**Files:**
- Review all files changed in Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/VexScreen.test.tsx
rtk npm run test -w apps/web -- src/components/screens/WorldEvents.test.tsx
rtk npm run test -w apps/web -- src/app/game/useGameController.test.ts
rtk npm run test -w packages/shared -- src/packageExports.test.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Run broad static verification**

Run:

```powershell
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Invoke the simplify skill**

Because implementation changes code, invoke `superpowers:simplify` and review only touched UI/navigation/dialogue files.

Cleanup rules:

- Keep `VexScreen.tsx` readable; do not compress the exchange card logic into dense inline expressions.
- Extract only if it removes real duplication.
- Do not add timed Vex availability, map markers, notifications, or extra backend changes.

- [ ] **Step 4: Re-run affected verification after simplification**

Run:

```powershell
rtk npm run test -w apps/web -- src/components/screens/VexScreen.test.tsx
rtk npm run test -w apps/web -- src/components/screens/WorldEvents.test.tsx
rtk npm run test -w apps/web -- src/app/game/useGameController.test.ts
rtk npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Review git diff**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Expected:

- `git diff --check` exits 0.
- Only Vex UI/access/navigation/dialogue files changed after this plan.
- No backend Vex availability or timed wandering state added.

- [ ] **Step 6: Commit simplification if it changed files**

If simplification changed files:

```powershell
git add .
git commit -m "refactor: simplify Vex merchant access UI"
```

If there are no simplification changes, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - World Events Vex camp: Task 2.
  - Dedicated `vex` screen: Task 1 and Task 3.
  - Explore tab grouping: Task 3.
  - Purchase data flow and state updates: Task 1.
  - NPC dialogue using existing events: Task 4.
  - Timed wandering merchant behavior: intentionally excluded.
- Type consistency:
  - Uses existing shared `VexExchangeView`, `VexExchangeCategory`, `VexExchangeListResponse`, `VexPurchaseResponse`, and `StateUpdates`.
  - Uses existing `DialogueEvent` value `buy` instead of adding `purchase`.
  - Uses existing `onStateUpdates` pattern from arena/guild/admin screens.
- Testing coverage:
  - Component tests cover Vex load, blocked state, target selection, purchase, API errors, World Events navigation, and Explore tab grouping.
