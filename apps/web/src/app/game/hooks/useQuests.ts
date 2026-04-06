import { useCallback, useEffect, useState } from 'react';
import { getQuests, claimQuestReward, claimDailyBonus, rerollQuest } from '@/lib/api';
import type { PlayerQuestData, PlayerQuestStateData, QuestProgressUpdate } from '@pocketrealm/shared';
import { showQuestToasts } from '../gameControllerHelpers';

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

  // Load quests on mount so badge count is available on the home screen
  useEffect(() => {
    void loadQuests();
  }, [loadQuests]);

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

  const handleRerollQuest = useCallback(async (questId: string) => {
    const res = await rerollQuest(questId);
    if (res.data) {
      // Replace old quest with new one in local state
      setQuests((prev) =>
        prev.map((q) => (q.id === questId ? res.data!.quest : q)),
      );
      // Increment rerollsUsed in local state
      setQuestState((prev) =>
        prev ? { ...prev, rerollsUsed: prev.rerollsUsed + 1 } : prev,
      );
    }
  }, []);

  /** Show toast notifications and update local quest state from progress updates returned by action endpoints. */
  const updateQuestProgress = useCallback((updates?: QuestProgressUpdate[]) => {
    if (!updates?.length) return;
    showQuestToasts(updates);
    setQuests((prev) => {
      const progressMap = new Map(updates.map((u) => [u.questId, u]));
      return prev.map((q) => {
        const update = progressMap.get(q.id);
        if (!update) return q;
        return {
          ...q,
          currentValue: update.current,
          status: update.completed && q.status === 'active' ? 'completed' as const : q.status,
          completedAt: update.completed && !q.completedAt ? new Date().toISOString() : q.completedAt,
        };
      });
    });
  }, []);

  return {
    quests,
    questState,
    questsLoading,
    questsError,
    loadQuests,
    handleClaimQuestReward,
    handleClaimDailyBonus,
    handleRerollQuest,
    updateQuestProgress,
  } as const;
}
