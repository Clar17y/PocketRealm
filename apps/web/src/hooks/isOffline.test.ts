import { describe, it, expect } from 'vitest';
import type { ConnectionState } from './useConnectionStatus';

// Extract the isOffline logic as a pure function for testing
function computeIsOffline(apiReachable: boolean, connectionStatus: ConnectionState): boolean {
  return !apiReachable
    || connectionStatus === 'disconnected'
    || connectionStatus === 'reconnecting'
    || connectionStatus === 'failed';
}

describe('isOffline combination logic', () => {
  it('is false when both connected and API reachable', () => {
    expect(computeIsOffline(true, 'connected')).toBe(false);
  });

  it('is true when socket disconnected but API reachable', () => {
    expect(computeIsOffline(true, 'disconnected')).toBe(true);
  });

  it('is true when socket reconnecting but API reachable', () => {
    expect(computeIsOffline(true, 'reconnecting')).toBe(true);
  });

  it('is true when socket failed but API reachable', () => {
    expect(computeIsOffline(true, 'failed')).toBe(true);
  });

  it('is true when socket connected but API unreachable', () => {
    expect(computeIsOffline(false, 'connected')).toBe(true);
  });

  it('is true when both disconnected and API unreachable', () => {
    expect(computeIsOffline(false, 'disconnected')).toBe(true);
  });

  it('is true when both reconnecting and API unreachable', () => {
    expect(computeIsOffline(false, 'reconnecting')).toBe(true);
  });

  it('is true when both failed and API unreachable', () => {
    expect(computeIsOffline(false, 'failed')).toBe(true);
  });
});
