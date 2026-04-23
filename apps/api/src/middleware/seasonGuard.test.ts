import { describe, expect, it, vi } from 'vitest';
import { requireActiveSeason } from './seasonGuard';

describe('requireActiveSeason', () => {
  it('allows permanent-realm players through', () => {
    const next = vi.fn();

    requireActiveSeason({ season: undefined } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows active seasonal players through', () => {
    const next = vi.fn();

    requireActiveSeason({
      season: { id: 'season-1', status: 'active' },
    } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a seasonal token has no cached season state', () => {
    let thrown: unknown;

    try {
      requireActiveSeason({
        player: { seasonId: 'season-1' },
        season: undefined,
      } as any, {} as any, vi.fn());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      message: 'Season state is temporarily unavailable. Please retry in a moment.',
      statusCode: 503,
      code: 'SEASON_STATE_UNAVAILABLE',
    });
  });

  it('throws for ended seasons', () => {
    let thrown: unknown;

    try {
      requireActiveSeason({
        season: { id: 'season-1', status: 'ended' },
      } as any, {} as any, vi.fn());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      message: 'This season has ended. Your character is frozen pending merge.',
      statusCode: 403,
      code: 'SEASON_ENDED',
    });
  });
});
