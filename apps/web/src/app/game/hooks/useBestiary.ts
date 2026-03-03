import { useCallback, useEffect, useState } from 'react';
import { getBestiary } from '@/lib/api';
import type { Screen } from '../gameController.types';

interface BestiaryMob {
  id: string;
  name: string;
  level: number;
  isDiscovered: boolean;
  killCount: number;
  stats: { hp: number; accuracy: number; defence: number };
  zones: string[];
  description: string;
  drops: Array<{
    item: { id: string; name: string; itemType: string; tier: number };
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    dropRate: number;
    minQuantity: number;
    maxQuantity: number;
  }>;
  prefixesEncountered: string[];
  explorationTier: number;
  tierLocked: boolean;
  bossRotation?: {
    totalRounds: number;
    revealedRounds: number;
    actions: Array<{
      round: number;
      actionName: string;
      targetMode: 'single_target' | 'aoe';
      isTelegraphed: boolean;
    }>;
  };
}

interface PrefixSummary {
  prefix: string;
  displayName: string;
  totalKills: number;
  discovered: boolean;
}

export function useBestiary(isAuthenticated: boolean, activeScreen: Screen) {
  const [bestiaryMobs, setBestiaryMobs] = useState<BestiaryMob[]>([]);
  const [bestiaryLoading, setBestiaryLoading] = useState(false);
  const [bestiaryError, setBestiaryError] = useState<string | null>(null);
  const [bestiaryPrefixSummary, setBestiaryPrefixSummary] = useState<PrefixSummary[]>([]);

  const loadBestiary = useCallback(async () => {
    setBestiaryError(null);
    setBestiaryLoading(true);
    try {
      const { data, error } = await getBestiary();
      if (data) {
        setBestiaryMobs(data.mobs);
        setBestiaryPrefixSummary(data.prefixSummary);
      }
      else setBestiaryError(error?.message ?? 'Failed to load bestiary');
    } finally {
      setBestiaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && (activeScreen === 'bestiary' || activeScreen === 'combat')) {
      void loadBestiary();
    }
  }, [isAuthenticated, activeScreen, loadBestiary]);

  return { bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary, loadBestiary } as const;
}
