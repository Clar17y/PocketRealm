import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VexExchangeListResponse, VexPurchaseResponse, StateUpdates } from '@pocketrealm/shared';
import type { DialogueEvent, NpcKey } from '@pocketrealm/shared/constants/npcDialogue';

interface NpcDialogueBannerMockProps {
  npcKey: NpcKey;
  event: DialogueEvent;
  showDialogue?: boolean;
}

const apiMocks = vi.hoisted(() => ({
  getVexExchanges: vi.fn(),
  purchaseVexExchange: vi.fn(),
}));

const dialogueMocks = vi.hoisted(() => ({
  triggerDialogueEvent: vi.fn(),
  useNpcDialogue: vi.fn(),
  npcDialogueBanner: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getVexExchanges: apiMocks.getVexExchanges,
    purchaseVexExchange: apiMocks.purchaseVexExchange,
  };
});

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: dialogueMocks.useNpcDialogue,
}));

vi.mock('@/components/common/NpcDialogueBanner', () => ({
  NpcDialogueBanner: (props: NpcDialogueBannerMockProps) => {
    dialogueMocks.npcDialogueBanner(props);
    return <div data-testid="vex-dialogue" />;
  },
}));

import { VexScreen } from './VexScreen';

const listResponse: VexExchangeListResponse = {
  gold: 5000,
  exchanges: [
    {
      key: 'wayfarer_aegis',
      name: 'Wayfarer Aegis',
      description: 'Trade Alpha Wolf trophies for an accuracy off-hand.',
      preview: {
        summary: 'Creates a soulbound tier 2 off-hand shield.',
        details: ['Accuracy +10, Armor +4, Health +8', 'Required level 8', 'Max durability 100'],
      },
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
      preview: {
        summary: 'Transforms a Wayfarer Aegis into a stronger tier 4 off-hand.',
        details: ['Accuracy +14, Armor +5, Magic Defence +8, Health +12', 'Required level 16', 'Max durability 140'],
      },
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
      preview: {
        summary: 'Adds a one-time Alpha Wolf boss stone to eligible boss-crafted gear.',
        details: ['Attack +2, Accuracy +2, Armor +1, Health +3', 'Works on Wolfsbane Blade and Alpha Pelt Chest'],
      },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('VexScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogueMocks.useNpcDialogue.mockReturnValue({
      dialogueEvent: 'idle',
      triggerDialogueEvent: dialogueMocks.triggerDialogueEvent,
    });
    mockList();
  });

  afterEach(() => cleanup());

  it('loads exchanges and renders Vex merchant cards', async () => {
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue />);

    expect(screen.getByText('Loading Vex exchanges...')).toBeTruthy();
    expect(await screen.findByText('Vex, Collector of Trophies')).toBeTruthy();
    expect(screen.getByText('Gold: 5,000')).toBeTruthy();
    expect(screen.getByText('Wayfarer Aegis')).toBeTruthy();
    expect(screen.getByText('Creates a soulbound tier 2 off-hand shield.')).toBeTruthy();
    expect(screen.getByText('Accuracy +10, Armor +4, Health +8')).toBeTruthy();
    expect(screen.getByText('Alpha Wolf Fang: 5 / 4')).toBeTruthy();
    expect(screen.getByText('Not enough Alpha Wolf Fang')).toBeTruthy();
    expect(screen.getByTestId('vex-dialogue')).toBeTruthy();
    expect(dialogueMocks.useNpcDialogue).toHaveBeenCalledWith('vex-collector');
    expect(dialogueMocks.npcDialogueBanner).toHaveBeenLastCalledWith({
      npcKey: 'vex-collector',
      event: 'idle',
      showDialogue: true,
    });
  });

  it('requires target selection for target-based exchanges', async () => {
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Spiritbound Aegis');

    const spiritButton = screen.getByRole('button', { name: 'Trade Spiritbound Aegis' });
    expect(spiritButton).toHaveProperty('disabled', true);
    expect(screen.getByText('Choose an item first.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Target item for Spiritbound Aegis'), {
      target: { value: 'aegis-1' },
    });

    expect(spiritButton).toHaveProperty('disabled', false);
  });

  it('filters exchanges by category', async () => {
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Wayfarer Aegis');

    fireEvent.click(screen.getByRole('button', { name: 'Boss Stones' }));

    expect(screen.getByText('Fangstone')).toBeTruthy();
    expect(screen.queryByText('Wayfarer Aegis')).toBeNull();
    expect(screen.queryByText('Spiritbound Aegis')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Trade Wayfarer Aegis' }));

    await waitFor(() => expect(apiMocks.purchaseVexExchange).toHaveBeenCalledWith('wayfarer_aegis', undefined));
    expect(onStateUpdates).toHaveBeenCalledWith(stateUpdates);
    expect(dialogueMocks.triggerDialogueEvent).toHaveBeenCalledWith('buy');
    expect(await screen.findByText('Created Wayfarer Aegis')).toBeTruthy();
    expect(apiMocks.getVexExchanges).toHaveBeenCalledTimes(2);
  });

  it('disables all trade controls while a purchase is in flight', async () => {
    const pendingPurchase = deferred<{ data: VexPurchaseResponse }>();
    apiMocks.purchaseVexExchange.mockReturnValue(pendingPurchase.promise);
    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    await screen.findByText('Spiritbound Aegis');
    fireEvent.change(screen.getByLabelText('Target item for Spiritbound Aegis'), {
      target: { value: 'aegis-1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trade Wayfarer Aegis' }));

    await waitFor(() => expect(apiMocks.purchaseVexExchange).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Trade Wayfarer Aegis' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Trade Spiritbound Aegis' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Target item for Spiritbound Aegis')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Trade Spiritbound Aegis' }));

    expect(apiMocks.purchaseVexExchange).toHaveBeenCalledTimes(1);
    pendingPurchase.resolve({
      data: { exchangeKey: 'wayfarer_aegis', message: 'Created Wayfarer Aegis' },
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'Trade Spiritbound Aegis' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Trade Wayfarer Aegis' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This season has ended.');
    expect(screen.getByRole('button', { name: 'Trade Wayfarer Aegis' })).toHaveProperty('disabled', false);
    expect(dialogueMocks.triggerDialogueEvent).not.toHaveBeenCalled();
  });

  it('shows list loading errors without an empty stock message', async () => {
    apiMocks.getVexExchanges.mockResolvedValue({
      error: { message: 'Vex is away from camp.', code: 'VEX_UNAVAILABLE' },
    });

    render(<VexScreen onStateUpdates={vi.fn()} showNpcDialogue={false} />);

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Vex is away from camp.');
    expect(screen.queryByText('Vex has nothing to trade right now.')).toBeNull();
  });
});
