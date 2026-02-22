import { describe, expect, it } from 'vitest';
import { WORLD_EVENT_TEMPLATES, type WorldEventTemplate } from './worldEventTemplates';

describe('WORLD_EVENT_TEMPLATES', () => {
  it('is a non-empty array', () => {
    expect(WORLD_EVENT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('every template has required fields', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(t.type).toBeTruthy();
      expect(t.scope).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.effectType).toBeTruthy();
      expect(typeof t.effectValue).toBe('number');
      expect(t.effectValue).toBeGreaterThan(0);
      expect(t.weight).toBeGreaterThan(0);
      expect(t.targeting).toBeTruthy();
    }
  });

  it('type is "mob" or "resource"', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(['mob', 'resource']).toContain(t.type);
    }
  });

  it('scope is "zone" or "world"', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(['zone', 'world']).toContain(t.scope);
    }
  });

  it('targeting is "zone", "family", or "resource"', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(['zone', 'family', 'resource']).toContain(t.targeting);
    }
  });

  it('effectType is a valid event effect', () => {
    const validEffects = new Set([
      'damage_up', 'damage_down', 'hp_up', 'hp_down',
      'spawn_rate_up', 'spawn_rate_down',
      'drop_rate_up', 'drop_rate_down',
      'yield_up', 'yield_down',
    ]);
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(validEffects.has(t.effectType)).toBe(true);
    }
  });

  it('mob-type templates target zones or families, not resources', () => {
    const mobTemplates = WORLD_EVENT_TEMPLATES.filter((t) => t.type === 'mob');
    for (const t of mobTemplates) {
      expect(['zone', 'family']).toContain(t.targeting);
    }
  });

  it('resource-type templates target zones or resources, not families', () => {
    const resourceTemplates = WORLD_EVENT_TEMPLATES.filter((t) => t.type === 'resource');
    for (const t of resourceTemplates) {
      expect(['zone', 'resource']).toContain(t.targeting);
    }
  });

  it('templates with family/resource targeting use {target} in title or description', () => {
    const targeted = WORLD_EVENT_TEMPLATES.filter(
      (t) => t.targeting === 'family' || t.targeting === 'resource',
    );
    for (const t of targeted) {
      if (!t.fixedTarget) {
        const hasPlaceholder = t.title.includes('{target}') || t.description.includes('{target}');
        expect(hasPlaceholder).toBe(true);
      }
    }
  });

  it('all weights are positive numbers', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(t.weight).toBeGreaterThan(0);
    }
  });

  it('has both zone-scoped and world-scoped templates', () => {
    const zoneTemplates = WORLD_EVENT_TEMPLATES.filter((t) => t.scope === 'zone');
    const worldTemplates = WORLD_EVENT_TEMPLATES.filter((t) => t.scope === 'world');
    expect(zoneTemplates.length).toBeGreaterThan(0);
    expect(worldTemplates.length).toBeGreaterThan(0);
  });

  it('effectValue is between 0 and 1 for all templates', () => {
    for (const t of WORLD_EVENT_TEMPLATES) {
      expect(t.effectValue).toBeGreaterThan(0);
      expect(t.effectValue).toBeLessThanOrEqual(1);
    }
  });
});
