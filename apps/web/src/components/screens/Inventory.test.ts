import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inventory } from './Inventory';

const { getStash } = vi.hoisted(() => ({
  getStash: vi.fn(),
}));

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: () => ({
    dialogueEvent: 'idle',
    triggerDialogueEvent: vi.fn(),
  }),
}));

vi.mock('@/lib/api/items', () => ({
  getStash,
}));

vi.mock('@/lib/assets', () => ({
  itemImageSrc: vi.fn(() => undefined),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Inventory', () => {
  it('sells a selected backpack batch item through the batch action bar', async () => {
    const onSellBatch = vi.fn().mockResolvedValue(undefined);

    render(
      React.createElement(Inventory, {
        items: [
          {
            id: 'item-1',
            name: 'Iron Sword',
            icon: '🗡️',
            quantity: 1,
            rarity: 'common',
            description: 'A sturdy sword.',
            type: 'weapon',
            slot: 'weapon',
            equippedSlot: null,
            salvageCost: 2,
            sellPrice: 25,
          },
        ],
        capacity: 10,
        usedSlots: 1,
        gold: 100,
        isInTown: true,
        onSellBatch,
        showNpcDialogue: false,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /sell mode/i }));
    fireEvent.click(screen.getByTitle('Iron Sword'));
    fireEvent.click(screen.getByRole('button', { name: /sell selected/i }));

    await waitFor(() => {
      expect(onSellBatch).toHaveBeenCalledWith(['item-1']);
    });
  });

  it('loads stash items and withdraws the selected stash item', async () => {
    getStash.mockResolvedValue({
      data: {
        items: [
          {
            id: 'stash-1',
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
        ],
      },
    });
    const onWithdraw = vi.fn().mockResolvedValue(undefined);

    render(
      React.createElement(Inventory, {
        items: [],
        capacity: 10,
        usedSlots: 1,
        gold: 100,
        isInTown: true,
        onWithdraw,
        showNpcDialogue: false,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /^stash$/i }));

    await waitFor(() => {
      expect(getStash).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Stash (1 item)')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('Oak Staff'));
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));

    await waitFor(() => {
      expect(onWithdraw).toHaveBeenCalledWith('stash-1');
    });
  });

  it('opens a backpack item modal and sells the selected item', async () => {
    const onSell = vi.fn().mockResolvedValue(undefined);

    render(
      React.createElement(Inventory, {
        items: [
          {
            id: 'item-2',
            name: 'Silver Ring',
            icon: '💍',
            quantity: 1,
            rarity: 'uncommon',
            description: 'A polished ring.',
            type: 'trinket',
            equippedSlot: null,
            salvageCost: null,
            sellPrice: 18,
          },
        ],
        capacity: 10,
        usedSlots: 1,
        gold: 100,
        isInTown: true,
        onSell,
        showNpcDialogue: false,
      })
    );

    fireEvent.click(screen.getByTitle('Silver Ring'));
    fireEvent.click(screen.getByRole('button', { name: /^sell$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^sell$/i })[1]);

    await waitFor(() => {
      expect(onSell).toHaveBeenCalledWith('item-2');
    });
  });
});
