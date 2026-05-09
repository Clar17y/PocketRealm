import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminGetLatencyActions, adminGetLatencyReport } from '@/lib/api';
import type { LatencyReport } from '@/lib/api';
import { LatencyAnalyticsSection } from './LatencyAnalyticsSection';

vi.mock('@/lib/api', () => ({
  adminGetLatencyActions: vi.fn(),
  adminGetLatencyReport: vi.fn(),
}));

const sampleReport = {
  period: '1h',
  bucketSizeSeconds: 60,
  generatedAt: '2026-05-09T10:00:00.000Z',
  actions: [
    {
      action: 'exploration.start',
      requestCount: 12,
      avgMs: 180,
      p50Ms: 120,
      p90Ms: 300,
      p95Ms: 420,
      p99Ms: 900,
      errorRate: 0.0833,
    },
    {
      action: 'equipment.change',
      requestCount: 8,
      avgMs: 40,
      p50Ms: 30,
      p90Ms: 80,
      p95Ms: 100,
      p99Ms: 100,
      errorRate: 0,
    },
  ],
  series: [
    {
      bucketStart: '2026-05-09T09:59:00.000Z',
      action: 'exploration.start',
      requestCount: 12,
      avgMs: 180,
      p50Ms: 120,
      p90Ms: 300,
      p95Ms: 420,
      p99Ms: 900,
      errorRate: 0.0833,
      connectedPlayers: 2,
      activeConnections: 3,
      eventLoopLagMs: 2,
      memoryUsageMb: 120,
    },
  ],
} satisfies LatencyReport;

describe('LatencyAnalyticsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminGetLatencyActions).mockResolvedValue({
      data: { actions: ['exploration.start', 'equipment.change'] },
    });
    vi.mocked(adminGetLatencyReport).mockResolvedValue({ data: sampleReport });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders API Latency heading, action rows, latency, and error rate', async () => {
    render(<LatencyAnalyticsSection />);

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('1h', undefined));

    expect(screen.getByRole('heading', { name: 'API Latency' })).toBeTruthy();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('exploration.start')).toBeTruthy();
    expect(within(table).getByText('equipment.change')).toBeTruthy();
    expect(screen.getByText('420 ms')).toBeTruthy();
    expect(screen.getByText('8.3%')).toBeTruthy();
  });

  it('initial fetch calls the 1h report without an action filter', async () => {
    render(<LatencyAnalyticsSection />);

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('1h', undefined));
  });

  it('changing period to 24h refetches the report without an action filter', async () => {
    render(<LatencyAnalyticsSection />);

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('1h', undefined));

    fireEvent.click(screen.getByRole('button', { name: '24h' }));

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('24h', undefined));
  });

  it('renders a no-data state for empty reports', async () => {
    vi.mocked(adminGetLatencyReport).mockResolvedValueOnce({
      data: { ...sampleReport, actions: [], series: [] },
    });

    render(<LatencyAnalyticsSection />);

    expect(await screen.findByText('No latency samples for this period.')).toBeTruthy();
  });
});
