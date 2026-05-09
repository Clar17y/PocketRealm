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

  it('clears previous report rows when a later report fetch fails', async () => {
    vi.mocked(adminGetLatencyReport)
      .mockResolvedValueOnce({ data: sampleReport })
      .mockResolvedValueOnce({ error: { message: 'Latency report unavailable' } });

    render(<LatencyAnalyticsSection />);

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('cell', { name: 'exploration.start' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '6h' }));

    expect(await screen.findByText('Latency report unavailable')).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'exploration.start' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('drops a stale action filter when changing to a period that does not include it', async () => {
    vi.mocked(adminGetLatencyActions)
      .mockResolvedValueOnce({ data: { actions: ['exploration.start', 'equipment.change'] } })
      .mockResolvedValueOnce({ data: { actions: ['equipment.change'] } });

    render(<LatencyAnalyticsSection />);

    await screen.findByRole('option', { name: 'exploration.start' });
    fireEvent.change(screen.getByLabelText('Latency action'), { target: { value: 'exploration.start' } });

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('1h', 'exploration.start'));

    fireEvent.click(screen.getByRole('button', { name: '24h' }));

    await waitFor(() => expect(adminGetLatencyReport).toHaveBeenCalledWith('24h', undefined));
    expect(adminGetLatencyReport).not.toHaveBeenCalledWith('24h', 'exploration.start');
  });

  it('labels all-actions percentile charts as the slowest action per bucket', async () => {
    vi.mocked(adminGetLatencyReport).mockResolvedValueOnce({
      data: {
        ...sampleReport,
        series: [
          {
            ...sampleReport.series[0],
            bucketStart: '2026-05-09T09:58:00.000Z',
            action: 'exploration.start',
            requestCount: 10,
            p95Ms: 500,
            connectedPlayers: 2,
          },
          {
            ...sampleReport.series[0],
            bucketStart: '2026-05-09T09:58:00.000Z',
            action: 'equipment.change',
            requestCount: 5,
            p95Ms: 100,
            connectedPlayers: 4,
          },
          {
            ...sampleReport.series[0],
            bucketStart: '2026-05-09T09:59:00.000Z',
            action: 'exploration.start',
            requestCount: 8,
            p95Ms: 300,
            connectedPlayers: 3,
          },
          {
            ...sampleReport.series[0],
            bucketStart: '2026-05-09T09:59:00.000Z',
            action: 'equipment.change',
            requestCount: 12,
            p95Ms: 200,
            connectedPlayers: 5,
          },
        ],
      },
    });

    const { container } = render(<LatencyAnalyticsSection />);

    expect(await screen.findByRole('img', { name: 'API latency trend, slowest action per bucket' })).toBeTruthy();
    expect(screen.getByText('Slowest action per bucket')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'API latency trend, all actions aggregated by bucket' })).toBeNull();
    expect(container.querySelector('path[stroke-width="3"]')?.getAttribute('d')).toBe('M 24.0 24.0 L 616.0 76.8');
  });

  it('keeps the aggregated-by-bucket label for all-actions average latency charts', async () => {
    render(<LatencyAnalyticsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Avg' }));

    expect(await screen.findByRole('img', { name: 'API latency trend, all actions aggregated by bucket' })).toBeTruthy();
    expect(screen.getByText('All actions aggregated by bucket')).toBeTruthy();
  });
});
