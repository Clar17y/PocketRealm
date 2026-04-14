import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStatus } from './useConnectionStatus';

type Listener = (...args: any[]) => void;

function createEmitter() {
  const listeners = new Map<string, Set<Listener>>();

  return {
    on(event: string, listener: Listener) {
      const bucket = listeners.get(event) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(event, bucket);
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, ...args: any[]) {
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
  };
}

const socketMock = vi.hoisted(() => {
  const socketEmitter = createEmitter();
  const ioEmitter = createEmitter();

  return {
    connected: true,
    on: socketEmitter.on,
    off: socketEmitter.off,
    emit: socketEmitter.emit,
    io: {
      on: ioEmitter.on,
      off: ioEmitter.off,
      emit: ioEmitter.emit,
    },
  };
});

vi.mock('@/lib/socket', () => ({
  getSocket: () => socketMock,
}));

function fireReachable(ok: boolean) {
  window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok } }));
}

describe('useConnectionStatus', () => {
  beforeEach(() => {
    socketMock.connected = true;
  });

  it('stays connected when socket is connected and API is reachable', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toBe('connected');
  });

  it('reports disconnected after consecutive API failures even if the socket stays connected', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      fireReachable(false);
      fireReachable(false);
    });

    expect(result.current).toBe('disconnected');
  });

  it('keeps socket reconnect states while the API is still reachable', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      socketMock.io.emit('reconnect_attempt');
    });
    expect(result.current).toBe('reconnecting');

    act(() => {
      fireReachable(true);
      socketMock.emit('connect');
    });
    expect(result.current).toBe('connected');
  });

  it('preserves the failed socket state when the API is unreachable', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      socketMock.io.emit('reconnect_failed');
      fireReachable(false);
      fireReachable(false);
    });

    expect(result.current).toBe('failed');
  });
});
