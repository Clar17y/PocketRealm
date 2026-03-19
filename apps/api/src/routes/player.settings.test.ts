import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const RARITY_ENUM = ['none', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

// Reproduce the exact schema from player.ts for direct testing
const settingsSchema = z.object({
  combatLogSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(100).max(2500).refine(v => v % 10 === 0, { message: 'Must be a multiple of 10' }).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).refine(v => v % 25 === 0, { message: 'Must be a multiple of 25' }).optional(),
  defaultRefiningMax: z.boolean().optional(),
  lowHpWarning: z.boolean().optional(),
  confirmRarity: z.enum(RARITY_ENUM).optional(),
  lootRevealRarity: z.enum(RARITY_ENUM).optional(),
  forgeConfirmRarity: z.enum(RARITY_ENUM).optional(),
  homeTownId: z.string().uuid().optional(),
  showNpcDialogue: z.boolean().optional(),
  showItemFlavourText: z.boolean().optional(),
  showBestiaryLore: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), { message: 'At least one setting required' });

describe('player settings', () => {
  describe('settingsSchema validation', () => {
    it('accepts valid combatLogSpeedMs (multiple of 100)', () => {
      expect(() => settingsSchema.parse({ combatLogSpeedMs: 300 })).not.toThrow();
    });

    it('rejects combatLogSpeedMs not a multiple of 100', () => {
      expect(() => settingsSchema.parse({ combatLogSpeedMs: 150 })).toThrow();
    });

    it('accepts valid explorationSpeedMs (multiple of 100)', () => {
      expect(() => settingsSchema.parse({ explorationSpeedMs: 500 })).not.toThrow();
    });

    it('rejects explorationSpeedMs not a multiple of 100', () => {
      expect(() => settingsSchema.parse({ explorationSpeedMs: 250 })).toThrow();
    });

    it('accepts valid defaultExploreTurns (multiple of 10)', () => {
      expect(() => settingsSchema.parse({ defaultExploreTurns: 100 })).not.toThrow();
    });

    it('rejects defaultExploreTurns not a multiple of 10', () => {
      expect(() => settingsSchema.parse({ defaultExploreTurns: 55 })).toThrow();
    });

    it('accepts valid quickRestHealPercent (multiple of 25)', () => {
      expect(() => settingsSchema.parse({ quickRestHealPercent: 75 })).not.toThrow();
    });

    it('rejects quickRestHealPercent not a multiple of 25', () => {
      expect(() => settingsSchema.parse({ quickRestHealPercent: 30 })).toThrow();
    });

    it('rejects empty body (at least one setting required)', () => {
      expect(() => settingsSchema.parse({})).toThrow();
    });

    it('accepts boolean settings', () => {
      expect(() => settingsSchema.parse({ autoSkipKnownCombat: true })).not.toThrow();
      expect(() => settingsSchema.parse({ defaultRefiningMax: false })).not.toThrow();
    });

    it('accepts flavour text toggle settings', () => {
      expect(() => settingsSchema.parse({ showNpcDialogue: false })).not.toThrow();
      expect(() => settingsSchema.parse({ showItemFlavourText: true })).not.toThrow();
      expect(() => settingsSchema.parse({ showBestiaryLore: false })).not.toThrow();
    });

    it('accepts multiple settings at once', () => {
      expect(() => settingsSchema.parse({
        combatLogSpeedMs: 200,
        defaultExploreTurns: 500,
        autoSkipKnownCombat: true,
      })).not.toThrow();
    });
  });
});
