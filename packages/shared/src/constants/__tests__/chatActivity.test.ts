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
  });

  it('formats craft activity messages', () => {
    expect(formatChatActivityMessage('craft_crit', craftActivity)).toBe('Kael crafted an Epic Steel Greatsword.');
  });

  it('marks Kessa variants relevant to weaponsmithing craft activity', () => {
    const relevance = getNpcActivityRelevance('kessa-weaponsmithing', craftActivity);
    expect(relevance).toEqual({ relevant: true, preferOwn: true });
  });

  it('formats an NPC activity reaction line', () => {
    const line = getNpcActivityReactionLine('kessa-weaponsmithing', craftActivity);
    expect(line).toContain('Epic Steel Greatsword');
  });
});
