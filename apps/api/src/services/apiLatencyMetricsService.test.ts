import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import {
  buildDurationHistogram,
  calculatePercentile,
  classifyApiAction,
  estimatePercentileFromHistogram,
  hasApiLatencySamples,
  normalizeApiRoute,
  recordApiLatencySample,
  resetApiLatencyBufferForTests,
  shouldRecordApiLatency,
} from './apiLatencyMetricsService';

describe('apiLatencyMetricsService', () => {
  describe('duration metrics', () => {
    it('calculates nearest-rank percentiles from sorted durations', () => {
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      expect(calculatePercentile(durations, 50)).toBe(50);
      expect(calculatePercentile(durations, 75)).toBe(80);
      expect(calculatePercentile(durations, 90)).toBe(90);
      expect(calculatePercentile(durations, 95)).toBe(100);
      expect(calculatePercentile(durations, 99)).toBe(100);
    });

    it('builds duration histograms with a JSON-safe overflow bucket', () => {
      const histogram = buildDurationHistogram([10, 25, 26, 900, 20000]);

      expect(histogram.upperBoundsMs.at(-1)).toBeNull();
      expect(histogram.counts.reduce((total, count) => total + count, 0)).toBe(5);
    });

    it('estimates nearest-rank percentiles from histogram bucket upper bounds', () => {
      const histogram = buildDurationHistogram([40, 60, 70, 900, 2000, 20000]);

      expect(estimatePercentileFromHistogram(histogram, 50)).toBe(100);
      expect(estimatePercentileFromHistogram(histogram, 90)).toBe(12800);
      expect(estimatePercentileFromHistogram(histogram, 99)).toBe(12800);
    });
  });

  describe('route normalization and action classification', () => {
    it('normalizes route identifiers while preserving stable literal route segments', () => {
      expect(
        normalizeApiRoute('/api/v1/combat/sites/123e4567-e89b-12d3-a456-426614174000/round?debug=true'),
      ).toBe('/api/v1/combat/sites/:id/round');
      expect(normalizeApiRoute('/api/v1/inventory/abc123')).toBe('/api/v1/inventory/:id');
    });

    it('classifies stable API actions', () => {
      expect(classifyApiAction('POST', '/api/v1/exploration/start')).toBe('exploration.start');
      expect(classifyApiAction('POST', '/api/v1/equipment/equip')).toBe('equipment.change');
      expect(classifyApiAction('POST', '/api/v1/pvp/challenge')).toBe('pvp.action');
      expect(classifyApiAction('POST', '/api/v1/combat/sites/:id/round')).toBe('combat.site');
    });

    it('classifies current non-POST gameplay routes to stable action labels', () => {
      expect(classifyApiAction('GET', '/api/v1/inventory')).toBe('inventory.action');
      expect(classifyApiAction('DELETE', '/api/v1/inventory/:id')).toBe('inventory.action');
      expect(classifyApiAction('GET', '/api/v1/gathering/nodes')).toBe('gathering.action');
      expect(classifyApiAction('GET', '/api/v1/crafting/recipes')).toBe('crafting.action');
      expect(classifyApiAction('GET', '/api/v1/pvp/ladder')).toBe('pvp.action');
      expect(classifyApiAction('GET', '/api/v1/combat/sites')).toBe('combat.site');
      expect(classifyApiAction('GET', '/api/v1/exploration/estimate')).toBe('exploration.estimate');
    });
  });

  describe('sample buffer', () => {
    beforeEach(() => {
      resetApiLatencyBufferForTests();
      vi.clearAllMocks();
    });

    it('records matching API latency samples in memory without writing snapshots', () => {
      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 200,
        durationMs: 123.4,
      });

      expect(hasApiLatencySamples()).toBe(true);
      expect(mockPrisma.apiLatencySnapshot.createMany).not.toHaveBeenCalled();
    });

    it('skips health, latency analytics, non-API, and OPTIONS requests', () => {
      expect(shouldRecordApiLatency('GET', '/api/v1/inventory')).toBe(true);
      expect(shouldRecordApiLatency('GET', '/health')).toBe(false);
      expect(shouldRecordApiLatency('GET', '/api/v1/admin/analytics/latency')).toBe(false);
      expect(shouldRecordApiLatency('GET', '/assets/logo.png')).toBe(false);
      expect(shouldRecordApiLatency('OPTIONS', '/api/v1/inventory')).toBe(false);
    });
  });
});
