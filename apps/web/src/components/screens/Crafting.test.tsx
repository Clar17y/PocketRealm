import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Crafting } from './Crafting';

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: () => ({
    dialogueEvent: null,
    triggerDialogueEvent: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseRecipe = {
  icon: '?',
  isAdvanced: false,
  isDiscovered: true,
  discoveryHint: null,
  soulbound: false,
  stackable: true,
  resultQuantity: 1,
  requiredLevel: 1,
  turnCost: 2,
  xpReward: 5,
  baseStats: {},
  materials: [],
  rarity: 'common' as const,
};

function renderCrafting(recipes: React.ComponentProps<typeof Crafting>['recipes']) {
  render(
    <Crafting
      skillName="Alchemy"
      skillLevel={10}
      xpRate={100}
      recipes={recipes}
      onCraft={vi.fn()}
      activityLog={[]}
      zoneCraftingLevel={null}
      zoneName={null}
      showNpcDialogue={false}
    />,
  );
}

describe('Crafting', () => {
  it('displays potion effects instead of empty base stats', () => {
    renderCrafting([
      {
        ...baseRecipe,
        id: 'minor-health',
        name: 'Minor Health Potion',
        consumableEffect: { type: 'heal_flat', value: 50 },
      },
      {
        ...baseRecipe,
        id: 'stamina',
        name: 'Stamina Potion',
        consumableEffect: { type: 'restore_stamina', value: 30 },
      },
      {
        ...baseRecipe,
        id: 'mana',
        name: 'Mana Potion',
        consumableEffect: { type: 'restore_mana', value: 20 },
      },
      {
        ...baseRecipe,
        id: 'cleanse',
        name: 'Cleansing Potion',
        consumableEffect: { type: 'cleanse_magic_dot' },
      },
      {
        ...baseRecipe,
        id: 'resist',
        name: 'Resist Potion',
        consumableEffect: { type: 'buff_defence', value: 15, duration: 5 },
      },
      {
        ...baseRecipe,
        id: 'power',
        name: 'Elixir of Power',
        consumableEffect: { type: 'buff_attack', value: 0.25, duration: 5 },
      },
    ]);

    expect(screen.getByText('Effect')).toBeTruthy();
    expect(screen.getByText('Restores 50 HP')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Stamina Potion/i }));

    expect(screen.getByText('Restores 30 stamina')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Mana Potion/i }));

    expect(screen.getByText('Restores 20 mana')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Cleansing Potion/i }));

    expect(screen.getByText('Cleanses all magic DoTs')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Resist Potion/i }));

    expect(screen.getByText('Increases defence and magic defence by 15 for 5 rounds')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Elixir of Power/i }));

    expect(screen.getByText('Increases attack by 25% for 5 rounds')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();
  });

  it('keeps base stats for non-consumable recipes', () => {
    renderCrafting([
      {
        ...baseRecipe,
        id: 'iron-sword',
        name: 'Iron Sword',
        stackable: false,
        baseStats: { attack: 8 },
      },
    ]);

    expect(screen.getByText('Base Stats')).toBeTruthy();
    expect(screen.getByText('Attack')).toBeTruthy();
    expect(screen.getByText('+8')).toBeTruthy();
    expect(screen.queryByText('Effect')).toBeNull();
  });
});
