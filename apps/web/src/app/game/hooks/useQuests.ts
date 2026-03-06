import { useCallback, useState } from 'react';
import { getQuests, claimQuestReward, claimDailyBonus } from '@/lib/api';
import type { PlayerQuestData, PlayerQuestStateData } from '@pocketrealm/shared';

export function useQuests() {
  const [quests, setQuests] = useState<PlayerQuestData[]>([]);
  const [questState, setQuestState] = useState<PlayerQuestStateData | null>(null);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questsError, setQuestsError] = useState<string | null>(null);

  const loadQuests = useCallback(async () => {
    setQuestsLoading(true);
    setQuestsError(null);
    try {
      const res = await getQuests();
      if (res.data) {
        setQuests(res.data.quests);
        setQuestState(res.data.state);
      } else if (res.error) {
        setQuestsError(res.error.message);
      }
    } catch {
      setQuestsError('Failed to load quests');
    } finally {
      setQuestsLoading(false);
    }
  }, []);

  const handleClaimQuestReward = useCallback(async (questId: string) => {
    const res = await claimQuestReward(questId);
    if (res.data) {
      // Mark quest as claimed in local state
      setQuests((prev) =>
        prev.map((q) =>
          q.id === questId ? { ...q, status: 'claimed' as const, claimedAt: new Date().toISOString() } : q,
        ),
      );
      // Update token balance
      setQuestState((prev) =>
        prev ? { ...prev, questTokens: res.data!.newBalance } : prev,
      );
    }
  }, []);

  const handleClaimDailyBonus = useCallback(async () => {
    const res = await claimDailyBonus();
    if (res.data) {
      setQuestState((prev) =>
        prev ? { ...prev, questTokens: res.data!.newBalance, dailyBonusClaimed: true } : prev,
      );
    }
  }, []);

  return {
    quests,
    questState,
    questsLoading,
    questsError,
    loadQuests,
    handleClaimQuestReward,
    handleClaimDailyBonus,
  } as const;
}
