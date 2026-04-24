import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

import { createActivityLog } from '../activityLogService';
import { adminAudit, adminAuditTx } from './adminAuditService';

describe('adminAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a non-transactional admin audit log', async () => {
    await adminAudit('admin-1', 'grant_turns', { amount: 100 });

    expect(createActivityLog).toHaveBeenCalledWith({
      playerId: 'admin-1',
      activityType: 'admin_action',
      turnsSpent: 0,
      result: {
        action: 'grant_turns',
        amount: 100,
      },
    });
  });

  it('writes a transactional admin audit log', async () => {
    const tx = { marker: 'tx-1' } as never;

    await adminAuditTx(tx, 'admin-1', 'grant_premium', {
      targetPlayerId: 'player-1',
      days: 7,
    });

    expect(createActivityLog).toHaveBeenCalledWith({
      tx,
      playerId: 'admin-1',
      activityType: 'admin_action',
      turnsSpent: 0,
      result: {
        action: 'grant_premium',
        targetPlayerId: 'player-1',
        days: 7,
      },
    });
  });
});
