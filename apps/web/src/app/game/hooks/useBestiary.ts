import { useCallback, useEffect, useState } from 'react';
import { getBestiary, getExpeditionBestiary, getWorldBossBestiary } from '@/lib/api';
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

export interface ExpeditionBestiaryTheme {
  theme: string;
  themeName: string;
  attempted: boolean;
  mobs: Array<{
    mobTemplateId: string;
    name: string;
    role: 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';
    killCount: number;
    stats: { hp: number; attack: number; defence: number } | null;
    rotation: Array<{ round: number; actionName: string; targetMode: string }> | null;
  }>;
}

export interface WorldBossEntry {
  bossTemplateId: string;
  name: string;
  defeatCount: number;
  hpPerParticipant: number | null;
  stats: { accuracy: number; defence: number } | null;
  rotation: Array<{ round: number; actionName: string; targetMode: string; isTelegraphed: boolean }> | null;
}

export function useBestiary(isAuthenticated: boolean, activeScreen: Screen) {
  const [bestiaryMobs, setBestiaryMobs] = useState<BestiaryMob[]>([]);
  const [bestiaryLoading, setBestiaryLoading] = useState(false);
  const [bestiaryError, setBestiaryError] = useState<string | null>(null);
  const [bestiaryPrefixSummary, setBestiaryPrefixSummary] = useState<PrefixSummary[]>([]);
  const [expeditionThemes, setExpeditionThemes] = useState<ExpeditionBestiaryTheme[]>([]);
  const [worldBosses, setWorldBosses] = useState<WorldBossEntry[]>([]);

  const loadBestiary = useCallback(async () => {
    setBestiaryError(null);
    setBestiaryLoading(true);
    try {
      const [bestiaryRes, expRes, bossRes] = await Promise.all([
        getBestiary(),
        getExpeditionBestiary(),
        getWorldBossBestiary(),
      ]);
      if (bestiaryRes.data) {
        setBestiaryMobs(bestiaryRes.data.mobs);
        setBestiaryPrefixSummary(bestiaryRes.data.prefixSummary);
      } else {
        setBestiaryError(bestiaryRes.error?.message ?? 'Failed to load bestiary');
      }
      if (expRes.data) setExpeditionThemes(expRes.data.themes);
      if (bossRes.data) setWorldBosses(bossRes.data.bosses);
    } finally {
      setBestiaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && (activeScreen === 'bestiary' || activeScreen === 'combat')) {
      void loadBestiary();
    }
  }, [isAuthenticated, activeScreen, loadBestiary]);

  return { bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary, expeditionThemes, worldBosses, loadBestiary } as const;
}
