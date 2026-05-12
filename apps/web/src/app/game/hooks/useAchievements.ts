import { useCallback, useEffect, useState } from 'react';
import {
  getAchievements,
  getAchievementUnclaimedCount,
  getActiveTitle,
  claimAchievementReward,
  setActiveTitle,
  type AchievementsResponse,
} from '@/lib/api';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import { getSocket } from '@/lib/socket';

export function useAchievements(
  isAuthenticated: boolean,
  onClaimReward?: () => Promise<void>,
) {
  const [achievementData, setAchievementData] = useState<AchievementsResponse | null>(null);
  const [achievementUnclaimedCount, setAchievementUnclaimedCount] = useState(0);
  const [activeTitle, setActiveTitleState] = useState<string | null>(null);

  const loadAchievements = useCallback(async () => {
    const res = await getAchievements();
    if (res.data) {
      setAchievementData(res.data);
      setAchievementUnclaimedCount(res.data.unclaimedCount);
    }
  }, []);

  const loadAchievementUnclaimedCount = useCallback(async () => {
    const res = await getAchievementUnclaimedCount();
    if (res.data) setAchievementUnclaimedCount(res.data.unclaimedCount);
  }, []);

  // Initial load
  useEffect(() => {
    if (!isAuthenticated) return;
    void loadAchievementUnclaimedCount();
    void getActiveTitle().then((res) => {
      if (res.data) setActiveTitleState(res.data.activeTitle);
    });
  }, [isAuthenticated, loadAchievementUnclaimedCount]);

  // Poll unclaimed count during active page use.
  useVisibleInterval(() => void loadAchievementUnclaimedCount(), 60_000, isAuthenticated);

  // Socket listener for real-time achievement unlocks
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();
    const handleAchievementUnlocked = (data: { id: string; title: string; category: string }) => {
      const showToast = (window as unknown as Record<string, unknown>).__showAchievementToast as
        | ((toast: { id: string; title: string; category: string }) => void)
        | undefined;
      if (showToast) showToast(data);
      void loadAchievementUnclaimedCount();
    };
    socket.on('achievement_unlocked', handleAchievementUnlocked);
    return () => { socket.off('achievement_unlocked', handleAchievementUnlocked); };
  }, [isAuthenticated, loadAchievementUnclaimedCount]);

  const handleClaimAchievement = async (achievementId: string) => {
    const res = await claimAchievementReward(achievementId);
    if (res.data) {
      await loadAchievements();
      if (onClaimReward) await onClaimReward();
    }
  };

  const handleSetActiveTitle = async (achievementId: string | null) => {
    const res = await setActiveTitle(achievementId);
    if (res.data) {
      setActiveTitleState(res.data.activeTitle);
    }
  };

  return {
    achievementData,
    achievementUnclaimedCount,
    activeTitle,
    loadAchievements,
    loadAchievementUnclaimedCount,
    handleClaimAchievement,
    handleSetActiveTitle,
  } as const;
}
