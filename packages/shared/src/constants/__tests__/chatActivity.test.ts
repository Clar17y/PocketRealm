import { describe, expect, it } from 'vitest';
import {
  CHAT_ACTIVITY_EVENT_TYPES,
  formatChatActivityMessage,
  getNpcActivityReactionLine,
  getNpcActivityRelevance,
  isRarityAtLeast,
} from '../chatActivity';
import type { ChatActivityRecord } from '../../types/chat.types';

const craftActivity: ChatActivityRecord = {
  id: 'activity-1',
  eventType: 'craft_crit',
  scope: 'zone',
  zoneId: 'zone-1',
  actorPlayerId: 'player-1',
  actorUsername: 'Kael',
  subjectName: 'Steel Greatsword',
  subjectRarity: 'epic',
  message: 'Kael crafted an Epic Steel Greatsword.',
  metadata: { skillType: 'weaponsmithing' },
  createdAt: '2026-04-24T10:00:00.000Z',
};

const alchemyActivity: ChatActivityRecord = {
  ...craftActivity,
  id: 'activity-2',
  actorUsername: 'Mira',
  subjectName: 'Healing Tonic',
  subjectRarity: 'rare',
  message: 'Mira crafted a Rare Healing Tonic.',
  metadata: { skillType: 'alchemy' },
};

describe('chatActivity constants', () => {
  it('declares the first-pass activity event types', () => {
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('rare_loot');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('craft_crit');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('zone_discovery');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('achievement');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('boss_defeat');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('server_milestone');
  });

  it('compares rarity using game rarity order', () => {
    expect(isRarityAtLeast('epic', 'rare')).toBe(true);
    expect(isRarityAtLeast('uncommon', 'rare')).toBe(false);
    expect(isRarityAtLeast(null, 'rare')).toBe(false);
    expect(isRarityAtLeast('mythic', 'rare')).toBe(false);
    expect(isRarityAtLeast('epic', 'mythic')).toBe(false);
  });

  it('formats craft activity messages', () => {
    expect(formatChatActivityMessage('craft_crit', craftActivity)).toBe('Kael crafted an Epic Steel Greatsword.');
  });

  it('formats boss defeat messages with final blow context when present', () => {
    expect(formatChatActivityMessage('boss_defeat', {
      ...craftActivity,
      eventType: 'boss_defeat',
      actorUsername: 'Hero',
      subjectName: 'The Molten Hart in Iron Hollow',
      subjectRarity: null,
    })).toBe('The Molten Hart in Iron Hollow has been defeated. Hero dealt the final blow.');
  });

  it('formats boss defeat messages without final blow context when actor is unknown', () => {
    expect(formatChatActivityMessage('boss_defeat', {
      ...craftActivity,
      eventType: 'boss_defeat',
      actorUsername: null,
      subjectName: 'The Molten Hart in Iron Hollow',
      subjectRarity: null,
    })).toBe('The Molten Hart in Iron Hollow has been defeated.');
  });

  it('formats activity messages with grammar-safe articles', () => {
    expect(formatChatActivityMessage('rare_loot', {
      ...craftActivity,
      eventType: 'rare_loot',
      subjectName: 'Amulet',
      subjectRarity: 'epic',
    })).toBe('Kael found an Epic Amulet.');

    expect(formatChatActivityMessage('craft_crit', {
      ...craftActivity,
      subjectRarity: 'rare',
    })).toBe('Kael crafted a Rare Steel Greatsword.');

    expect(formatChatActivityMessage('craft_crit', {
      ...craftActivity,
      subjectRarity: 'legendary',
    })).toBe('Kael crafted a Legendary Steel Greatsword.');

    expect(formatChatActivityMessage('craft_crit', {
      ...craftActivity,
      subjectRarity: 'common',
    })).toBe('Kael crafted a Common Steel Greatsword.');

    expect(formatChatActivityMessage('craft_crit', {
      ...craftActivity,
      subjectRarity: null,
    })).toBe('Kael crafted a Steel Greatsword.');
  });

  it('marks Kessa variants relevant to weaponsmithing craft activity', () => {
    const relevance = getNpcActivityRelevance('kessa-weaponsmithing', craftActivity);
    expect(relevance).toEqual({ relevant: true, preferOwn: true });
  });

  it('formats an NPC activity reaction line', () => {
    const line = getNpcActivityReactionLine('kessa-weaponsmithing', craftActivity);
    expect(line).toContain('Epic Steel Greatsword');
  });

  it('marks Thornwall metal craft NPCs relevant and returns reaction lines', () => {
    for (const npcKey of ['thornwall-blacksmith', 'thornwall-weaponsmithing'] as const) {
      const relevance = getNpcActivityRelevance(npcKey, craftActivity);
      const line = getNpcActivityReactionLine(npcKey, craftActivity);

      expect(relevance).toEqual({ relevant: true, preferOwn: true });
      expect(line).not.toBeNull();
      expect(line).toContain('Epic Steel Greatsword');
    }
  });

  it('marks herbalist alchemy craft activity relevant and returns a reaction line', () => {
    const relevance = getNpcActivityRelevance('millbrook-herbalist', alchemyActivity);
    const line = getNpcActivityReactionLine('millbrook-herbalist', alchemyActivity);

    expect(relevance).toEqual({ relevant: true, preferOwn: true });
    expect(line).not.toBeNull();
    expect(line).toContain('Rare Healing Tonic');
  });
});
