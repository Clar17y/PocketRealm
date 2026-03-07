import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('./friendMailService', () => ({
  sendSystemMail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({ currentTurns: 800 }),
}));

vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ isRecovering: false, currentHp: 100 }),
}));

import { validateSpar, spendSparTurns, sendSparResultMail } from './sparService';
import { isBlocked } from './blockService';
import { getHpState } from './hpService';
import { spendPlayerTurnsTx } from './turnBankService';
import { sendSystemMail } from './friendMailService';
import { SPAR_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

const ATTACKER_ID = 'attacker';
const DEFENDER_ID = 'defender';
const FRIENDSHIP_ID = 'f1';

describe('sparService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateSpar', () => {
    it('throws if friendship not found', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(validateSpar(ATTACKER_ID, 'bad-id')).rejects.toThrow('Friendship not found');
      await expect(validateSpar(ATTACKER_ID, 'bad-id')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('throws if player is recovering', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: ATTACKER_ID,
        receiverId: DEFENDER_ID,
      });

      vi.mocked(getHpState).mockResolvedValueOnce({
        isRecovering: true,
        currentHp: 0,
      } as Awaited<ReturnType<typeof getHpState>>);

      await expect(validateSpar(ATTACKER_ID, FRIENDSHIP_ID)).rejects.toThrow('Cannot spar while recovering');
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: ATTACKER_ID,
        receiverId: DEFENDER_ID,
      });
      vi.mocked(getHpState).mockResolvedValueOnce({
        isRecovering: true,
        currentHp: 0,
      } as Awaited<ReturnType<typeof getHpState>>);
      await expect(validateSpar(ATTACKER_ID, FRIENDSHIP_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'IS_RECOVERING',
      });
    });

    it('throws if defender has blocked attacker', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: ATTACKER_ID,
        receiverId: DEFENDER_ID,
      });

      vi.mocked(isBlocked).mockResolvedValueOnce(true);

      await expect(validateSpar(ATTACKER_ID, FRIENDSHIP_ID)).rejects.toThrow('Cannot spar with this player');
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: ATTACKER_ID,
        receiverId: DEFENDER_ID,
      });
      vi.mocked(isBlocked).mockResolvedValueOnce(true);
      await expect(validateSpar(ATTACKER_ID, FRIENDSHIP_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'BLOCKED',
      });
    });

    it('returns attacker and defender IDs when valid', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: ATTACKER_ID,
        receiverId: DEFENDER_ID,
      });

      const result = await validateSpar(ATTACKER_ID, FRIENDSHIP_ID);

      expect(result).toEqual({
        attackerId: ATTACKER_ID,
        defenderId: DEFENDER_ID,
      });
    });

    it('resolves defenderId correctly when attacker is the receiver', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        senderId: DEFENDER_ID,
        receiverId: ATTACKER_ID,
      });

      const result = await validateSpar(ATTACKER_ID, FRIENDSHIP_ID);

      expect(result).toEqual({
        attackerId: ATTACKER_ID,
        defenderId: DEFENDER_ID,
      });
    });
  });

  describe('spendSparTurns', () => {
    it('calls spendPlayerTurnsTx with SPAR_CONSTANTS.TURN_COST', async () => {
      await spendSparTurns(ATTACKER_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(vi.mocked(spendPlayerTurnsTx)).toHaveBeenCalledWith(
        mockPrisma,
        ATTACKER_ID,
        SPAR_CONSTANTS.TURN_COST,
      );
    });
  });

  describe('sendSparResultMail', () => {
    it('sends correct message when attacker won', async () => {
      await sendSparResultMail(ATTACKER_ID, 'HeroKnight', DEFENDER_ID, true, 42);

      expect(vi.mocked(sendSystemMail)).toHaveBeenCalledWith(
        ATTACKER_ID,
        DEFENDER_ID,
        'Friendly Spar Result',
        'HeroKnight beat you in a friendly spar! They ended on 42 HP.',
      );
    });

    it('sends correct message when attacker lost', async () => {
      await sendSparResultMail(ATTACKER_ID, 'HeroKnight', DEFENDER_ID, false, 55);

      expect(vi.mocked(sendSystemMail)).toHaveBeenCalledWith(
        ATTACKER_ID,
        DEFENDER_ID,
        'Friendly Spar Result',
        'HeroKnight lost to you in a friendly spar! You showed them who\'s boss.',
      );
    });
  });
});
