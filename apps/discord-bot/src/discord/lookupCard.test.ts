import { describe, expect, it } from 'vitest';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import {
  buildItemCard,
  buildMobCard,
  buildNotFoundCard,
  buildSuggestionCard,
  type ItemCardData,
  type MobCardData,
} from './lookupCard.js';

const emojiMap = {};

const item: ItemCardData = {
  name: 'Iron Ingot',
  itemType: 'resource',
  slot: null,
  tier: 2,
  weightClass: null,
  requiredSkill: null,
  requiredLevel: 1,
  sellPrice: 10,
  flavorText: 'A sturdy bar of iron.',
  season: null,
  stats: [{ key: 'attack', value: 12 }],
  sources: {
    drops: [{ mobName: 'Iron Golem', zoneName: 'Iron Hills', dropRatePct: 25, minQty: 1, maxQty: 2 }],
    craft: { skillType: 'refining', requiredLevel: 12, turnCost: 12, xpReward: 22, materials: [{ name: 'Iron Ore', quantity: 2 }] },
  },
};

const mob: MobCardData = {
  name: 'Warg',
  isBoss: false,
  isExpeditionMob: false,
  season: null,
  zones: ['Whispering Plains', 'Frostpeak'],
  flavorAppearance: 'A grey wolf.',
  drops: [{ itemName: 'Warg Pelt', itemType: 'resource', tier: 1, dropRatePct: 50, minQty: 1, maxQty: 1 }],
};

describe('buildItemCard', () => {
  it('renders name, stats, drop and craft sources', () => {
    const payload = buildItemCard(item, emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Iron Ingot');
    expect(text).toContain('attack');
    expect(text).toContain('Iron Golem');
    expect(text).toContain('Iron Hills');
    expect(text).toContain('Iron Ore');
  });

  it('labels seasonal items and omits combat-only fields', () => {
    const payload = buildItemCard({ ...item, season: { name: 'Season of Embers' } }, emojiMap);
    expect(cardText(payload)).toContain('Season of Embers');
  });

  it('caps a long craft-material list to stay within the card budget', () => {
    const materials = Array.from({ length: 18 }, (_, i) => ({ name: `Mat ${i + 1}`, quantity: 1 }));
    const payload = buildItemCard(
      { ...item, sources: { drops: [], craft: { ...item.sources.craft!, materials } } },
      emojiMap,
    );
    const text = cardText(payload);
    expect(text).toContain('…and 3 more');
    expect(text).not.toContain('Mat 16');
  });
});

describe('buildMobCard', () => {
  it('renders zones and drops without combat stats', () => {
    const payload = buildMobCard(mob, emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Warg');
    expect(text).toContain('Whispering Plains');
    expect(text).toContain('Warg Pelt');
    expect(text).not.toContain('HP');
  });

  it('labels expedition-only mobs instead of showing a zone', () => {
    const payload = buildMobCard(
      { ...mob, isExpeditionMob: true, zones: ['Forest Edge'] },
      emojiMap,
    );
    const text = cardText(payload);
    expect(text).toContain('Expeditions (expedition only)');
    expect(text).not.toContain('Forest Edge');
  });
});

describe('buildSuggestionCard', () => {
  it('lists suggestions and escapes the query', () => {
    const payload = buildSuggestionCard('@spider', ['Spider Silk', 'Spider Fang'], 'item', emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Spider Silk');
    expect(text).toContain('@​spider');
  });
});

describe('buildNotFoundCard', () => {
  it('reports no match for the escaped query', () => {
    const payload = buildNotFoundCard('@nothing', 'mob', emojiMap);
    expectV2Card(payload);
    expect(cardText(payload)).toContain('@​nothing');
  });
});
