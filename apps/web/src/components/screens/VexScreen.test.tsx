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
    expect(spiritButton).toHaveProperty('disabled', true);
    expect(screen.getByText('Choose an item first.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Target item for Spiritbound Aegis'), {
      target: { value: 'aegis-1' },
    });

    expect(spiritButton).toHaveProperty('disabled', false);
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

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This season has ended.');
    expect(screen.getAllByRole('button', { name: 'Trade' })[0]).toHaveProperty('disabled', false);
  });
});
