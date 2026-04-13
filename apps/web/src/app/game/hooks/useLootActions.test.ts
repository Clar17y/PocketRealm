import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLootActions } from './useLootActions';

const apiMock = vi.hoisted(() => ({
  fetchPendingLoot: vi.fn(),
  claimLoot: vi.fn(),
}));

const applyStateUpdatesMock = vi.hoisted(() => ({
  applyStateUpdates: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);
vi.mock('../applyStateUpdates', () => applyStateUpdatesMock);
vi.mock('./useActivityLog', () => ({
  nowStamp: () => '2026-04-13T16:00:00.000Z',
}));

const sampleItem = (templateId: string, templateName: string) => ({
  templateId,
  templateName,
  rarity: 'common',
  quantity: 1,
  bonusStats: null,
  currentDurability: null,
  maxDurability: null,
});

function buildHook() {
  const pushLog = vi.fn();
  const setActionError = vi.fn();
  const activatePendingLootRef = { current: async (_sessionId: string) => {} };
  const pendingLootQueueRef = { current: [] as string[] };

  const hook = renderHook(() => useLootActions({
    runAction: async (_name, fn) => { await fn(); },
    pushLog,
    setActionError,
    stateSetters: {} as never,
    activatePendingLootRef,
    pendingLootQueueRef,
  }));

  return {
    ...hook,
    pushLog,
    setActionError,
    activatePendingLootRef,
    pendingLootQueueRef,
  };
}

describe('useLootActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines queued loot sessions into one pending view', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-2', 'Iron Ore'), sampleItem('item-3', 'Silver Ore')] } });

    const hook = buildHook();
    hook.pendingLootQueueRef.current = ['session-2'];

    await act(async () => {
      await hook.result.current.activatePendingLoot('session-1');
    });

    expect(hook.result.current.pendingLootSession?.sessionIds).toEqual(['session-1', 'session-2']);
    expect(hook.result.current.pendingLootSession?.items).toHaveLength(3);
    expect(hook.pendingLootQueueRef.current).toEqual([]);
  });

  it('claims selected loot across all combined sessions', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword'), sampleItem('item-2', 'Iron Ore')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-3', 'Silver Ore')] } });
    apiMock.claimLoot
      .mockResolvedValueOnce({ data: { success: true, stateUpdates: { inventoryAdded: [{ id: 'inv-1' }] } } })
      .mockResolvedValueOnce({ data: { success: true, stateUpdates: { inventoryAdded: [{ id: 'inv-2' }] } } });

    const hook = buildHook();
    hook.pendingLootQueueRef.current = ['session-2'];

    await act(async () => {
      await hook.result.current.activatePendingLoot('session-1');
    });

    await act(async () => {
      await hook.result.current.handleClaimLoot('session-1', [0, 2]);
    });

    expect(apiMock.claimLoot).toHaveBeenNthCalledWith(1, 'session-1', [0]);
    expect(apiMock.claimLoot).toHaveBeenNthCalledWith(2, 'session-2', [0]);
    expect(applyStateUpdatesMock.applyStateUpdates).toHaveBeenCalledTimes(2);
    expect(hook.pushLog).toHaveBeenCalledWith(expect.objectContaining({ message: 'Claimed 2 loot items' }));
    expect(hook.result.current.pendingLootSession).toBeNull();
  });

  it('preserves remaining sessions when a later grouped claim fails', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-2', 'Silver Ore')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-2', 'Silver Ore')] } });
    apiMock.claimLoot
      .mockResolvedValueOnce({ data: { success: true, stateUpdates: { inventoryAdded: [{ id: 'inv-1' }] } } })
      .mockResolvedValueOnce({ error: { message: 'Loot claim failed', code: 'NETWORK_ERROR' } });

    const hook = buildHook();
    hook.pendingLootQueueRef.current = ['session-2'];

    await act(async () => {
      await hook.result.current.activatePendingLoot('session-1');
    });

    await act(async () => {
      await hook.result.current.handleClaimLoot('session-1', [0, 1]);
    });

    expect(hook.setActionError).toHaveBeenCalledWith('Loot claim failed');
    expect(hook.result.current.pendingLootSession?.sessionIds).toEqual(['session-2']);
    expect(hook.result.current.pendingLootSession?.items).toHaveLength(1);
  });

  it('reopening a minimized bundle pulls in newly queued sessions', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword')] } })
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-2', 'Silver Ore')] } });

    const hook = buildHook();

    await act(async () => {
      await hook.result.current.activatePendingLoot('session-1');
    });

    act(() => {
      hook.result.current.handleDismissLoot();
      hook.pendingLootQueueRef.current.push('session-2');
    });

    await act(async () => {
      await hook.result.current.handleReopenLoot();
    });

    expect(hook.result.current.pendingLootSession?.minimized).toBe(false);
    expect(hook.result.current.pendingLootSession?.sessionIds).toEqual(['session-1', 'session-2']);
    expect(hook.result.current.pendingLootSession?.items).toHaveLength(2);
  });

  it('keeps queued sessions queued when reopening fails to refresh', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ data: { items: [sampleItem('item-1', 'Bronze Sword')] } })
      .mockResolvedValueOnce({ error: { message: 'Refresh failed', code: 'NETWORK_ERROR' } });

    const hook = buildHook();

    await act(async () => {
      await hook.result.current.activatePendingLoot('session-1');
    });

    act(() => {
      hook.result.current.handleDismissLoot();
      hook.pendingLootQueueRef.current.push('session-2');
    });

    await act(async () => {
      await hook.result.current.handleReopenLoot();
    });

    expect(hook.setActionError).toHaveBeenCalledWith('Refresh failed');
    expect(hook.pendingLootQueueRef.current).toEqual(['session-2']);
    expect(hook.result.current.pendingLootSession?.sessionIds).toEqual(['session-1']);
    expect(hook.result.current.pendingLootSession?.minimized).toBe(true);
  });

  it('keeps the queued session when activating the next bundle fails to refresh', async () => {
    apiMock.fetchPendingLoot
      .mockResolvedValueOnce({ error: { message: 'Refresh failed', code: 'NETWORK_ERROR' } });

    const hook = buildHook();
    hook.pendingLootQueueRef.current = ['session-1'];

    await act(async () => {
      await hook.result.current.activateNextQueuedLoot();
    });

    expect(hook.setActionError).toHaveBeenCalledWith('Refresh failed');
    expect(hook.pendingLootQueueRef.current).toEqual(['session-1']);
    expect(hook.result.current.pendingLootSession).toBeNull();
  });
});
