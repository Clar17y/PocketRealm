import { describe, it, expect } from 'vitest';
import { getNpcLine, getNpcName, NPC_DIALOGUE } from '../npcDialogue';

describe('getNpcLine', () => {
  it('returns a string for valid NPC and event', () => {
    const line = getNpcLine('millbrook-general-store', 'greeting');
    expect(typeof line).toBe('string');
    expect(line!.length).toBeGreaterThan(0);
  });

  it('returns null for unknown NPC', () => {
    expect(getNpcLine('nonexistent-npc', 'greeting')).toBeNull();
  });

  it('returns null for NPC with no lines for a specific event', () => {
    const originalData = NPC_DIALOGUE['millbrook-general-store'];
    const savedBuy = originalData.lines.buy;
    delete originalData.lines.buy;
    expect(getNpcLine('millbrook-general-store', 'buy')).toBeNull();
    originalData.lines.buy = savedBuy;
  });

  it('returns one of the known lines for a valid NPC and event', () => {
    const line = getNpcLine('millbrook-blacksmith', 'farewell');
    const knownFarewells = NPC_DIALOGUE['millbrook-blacksmith'].lines.farewell!;
    expect(knownFarewells).toContain(line);
  });
});

describe('getNpcName', () => {
  it('returns name for valid NPC', () => {
    expect(getNpcName('millbrook-general-store')).toBe('Bram Holloway');
  });

  it('returns null for unknown NPC', () => {
    expect(getNpcName('nonexistent')).toBeNull();
  });

  it('returns correct names for all major NPCs', () => {
    expect(getNpcName('millbrook-blacksmith')).toBe('Kessa Ironweld');
    expect(getNpcName('millbrook-tavern')).toBe('Maren Ashwick');
    expect(getNpcName('millbrook-herbalist')).toBe('Vesper Tain');
    expect(getNpcName('millbrook-quest-board')).toBe('Aldric Voss');
    expect(getNpcName('millbrook-gathering-guide')).toBe('Rowan Delk');
    expect(getNpcName('millbrook-casino')).toBe('Silas Vane');
    expect(getNpcName('millbrook-guild-recruiter')).toBe('Gavrik Stoneshoulder');
    expect(getNpcName('thornwall-merchant')).toBe('Lira Caravel');
    expect(getNpcName('wandering-merchant')).toBe('Vex');
    expect(getNpcName('mysterious-stranger')).toBe('The Stranger');
    expect(getNpcName('town-guard')).toBe('Captain Fen Darrow');
  });
});

describe('NPC_DIALOGUE completeness', () => {
  it('has entries for all expected NPC keys', () => {
    const expectedKeys = [
      'millbrook-general-store',
      'millbrook-blacksmith',
      'millbrook-tavern',
      'millbrook-herbalist',
      'millbrook-quest-board',
      'millbrook-gathering-guide',
      'millbrook-casino',
      'millbrook-guild-recruiter',
      'thornwall-merchant',
      'wandering-merchant',
      'mysterious-stranger',
      'town-guard',
    ];
    for (const key of expectedKeys) {
      expect(NPC_DIALOGUE[key]).toBeDefined();
      expect(NPC_DIALOGUE[key].name).toBeTruthy();
      expect(NPC_DIALOGUE[key].location).toBeTruthy();
      expect(NPC_DIALOGUE[key].personality).toBeTruthy();
    }
  });

  it('each NPC has at least one dialogue event with lines', () => {
    for (const [key, npc] of Object.entries(NPC_DIALOGUE)) {
      const eventKeys = Object.keys(npc.lines) as (keyof typeof npc.lines)[];
      expect(eventKeys.length, `${key} should have at least one event`).toBeGreaterThan(0);
      for (const event of eventKeys) {
        expect(npc.lines[event]!.length, `${key}.${event} should have at least one line`).toBeGreaterThan(0);
      }
    }
  });

  it('has exactly 12 NPC entries', () => {
    expect(Object.keys(NPC_DIALOGUE).length).toBe(12);
  });
});
