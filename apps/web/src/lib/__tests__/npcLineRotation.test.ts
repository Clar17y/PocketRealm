// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNextNpcLine } from '../npcLineRotation';

vi.mock('@pocketrealm/shared/constants/npcDialogue', () => ({
  NPC_DIALOGUE: {
    'test-npc': {
      name: 'Test NPC',
      location: 'Test',
      personality: 'Testy',
      lines: {
        greeting: ['Hello', 'Hi', 'Hey'],
        idle: ['Waiting...'],
      },
      contextLines: {
        greeting: [
          { zoneKeyword: 'deep-forest', lines: ['Back from the forest?', 'Smells like pine.'] },
        ],
      },
    },
    'no-context-npc': {
      name: 'Plain NPC',
      location: 'Test',
      personality: 'Plain',
      lines: {
        greeting: ['Hello', 'Hi'],
      },
    },
  },
}));

describe('getNextNpcLine', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns a line from the NPC pool', () => {
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('returns null for unknown NPC', () => {
    expect(getNextNpcLine('nonexistent' as any, 'greeting')).toBeNull();
  });

  it('returns null for event with no lines', () => {
    expect(getNextNpcLine('test-npc', 'sell')).toBeNull();
  });

  it('does not repeat until all lines shown', () => {
    const seen = new Set<string | null>();
    for (let i = 0; i < 3; i++) {
      seen.add(getNextNpcLine('test-npc', 'greeting'));
    }
    expect(seen.size).toBe(3);
    expect(seen).toContain('Hello');
    expect(seen).toContain('Hi');
    expect(seen).toContain('Hey');
  });

  it('resets after all lines exhausted', () => {
    for (let i = 0; i < 3; i++) {
      getNextNpcLine('test-npc', 'greeting');
    }
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('returns context-aware line when context matches', () => {
    sessionStorage.setItem('turns-spent:deep-forest', '50');
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Back from the forest?', 'Smells like pine.']).toContain(line);
  });

  it('falls back to generic lines when no context match', () => {
    sessionStorage.setItem('turns-spent:crystal-caves', '50');
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('falls back to generic when NPC has no contextLines', () => {
    sessionStorage.setItem('turns-spent:deep-forest', '50');
    const line = getNextNpcLine('no-context-npc', 'greeting');
    expect(['Hello', 'Hi']).toContain(line);
  });

  it('handles single-line pools without error', () => {
    const line = getNextNpcLine('test-npc', 'idle');
    expect(line).toBe('Waiting...');
    const line2 = getNextNpcLine('test-npc', 'idle');
    expect(line2).toBe('Waiting...');
  });
});
