import { useState } from 'react';
import { updatePlayerSettings, type PlayerSettings } from '@/lib/api';
import type { ConfirmRarity } from '@/lib/rarity';

/** Shape accepted by initSettingsFromServer — matches the player API response fields. */
export interface ServerSettingsPayload {
  combatLogSpeedMs?: number | null;
  explorationSpeedMs?: number | null;
  autoSkipKnownCombat?: boolean | null;
  defaultExploreTurns?: number | null;
  quickRestHealPercent?: number | null;
  defaultRefiningMax?: boolean | null;
  lowHpWarning?: boolean | null;
  confirmRarity?: ConfirmRarity | null;
  lootRevealRarity?: ConfirmRarity | null;
  homeTownId?: string | null;
}

export function usePlayerSettings() {
  const [combatLogSpeedMs, setCombatLogSpeedMs] = useState(800);
  const [explorationSpeedMs, setExplorationSpeedMs] = useState(800);
  const [autoSkipKnownCombat, setAutoSkipKnownCombat] = useState(false);
  const [defaultExploreTurns, setDefaultExploreTurns] = useState(100);
  const [quickRestHealPercent, setQuickRestHealPercent] = useState(100);
  const [defaultRefiningMax, setDefaultRefiningMax] = useState(false);
  const [lowHpWarning, setLowHpWarning] = useState(true);
  const [confirmRarity, setConfirmRarity] = useState<ConfirmRarity>('uncommon');
  const [lootRevealRarity, setLootRevealRarity] = useState<ConfirmRarity>('uncommon');
  const [guildTaxRate, setGuildTaxRate] = useState(0);
  const [homeTownId, setHomeTownId] = useState<string | null>(null);

  // --- generic persist helper ---------------------------------------------------

  const handleSetSetting = async <T>(key: keyof PlayerSettings, value: T, setter: (v: T) => void, prev: T) => {
    setter(value);
    const res = await updatePlayerSettings({ [key]: value });
    if (!res.data) setter(prev);
  };

  // --- individual handlers (persist to server) ----------------------------------

  const handleSetCombatLogSpeed = (value: number) =>
    handleSetSetting('combatLogSpeedMs', value, setCombatLogSpeedMs, combatLogSpeedMs);
  const handleSetExplorationSpeed = (value: number) =>
    handleSetSetting('explorationSpeedMs', value, setExplorationSpeedMs, explorationSpeedMs);
  const handleSetAutoSkipKnownCombat = (value: boolean) =>
    handleSetSetting('autoSkipKnownCombat', value, setAutoSkipKnownCombat, autoSkipKnownCombat);
  const handleSetDefaultExploreTurns = (value: number) =>
    handleSetSetting('defaultExploreTurns', value, setDefaultExploreTurns, defaultExploreTurns);
  const handleSetQuickRestHealPercent = (value: number) =>
    handleSetSetting('quickRestHealPercent', value, setQuickRestHealPercent, quickRestHealPercent);
  const handleSetDefaultRefiningMax = (value: boolean) =>
    handleSetSetting('defaultRefiningMax', value, setDefaultRefiningMax, defaultRefiningMax);
  const handleSetLowHpWarning = (value: boolean) =>
    handleSetSetting('lowHpWarning', value, setLowHpWarning, lowHpWarning);
  const handleSetConfirmRarity = (value: ConfirmRarity) =>
    handleSetSetting('confirmRarity', value, setConfirmRarity, confirmRarity);
  const handleSetLootRevealRarity = (value: ConfirmRarity) =>
    handleSetSetting('lootRevealRarity', value, setLootRevealRarity, lootRevealRarity);
  const handleSetHomeTown = (zoneId: string) =>
    handleSetSetting('homeTownId', zoneId, setHomeTownId, homeTownId);

  // --- server hydration ---------------------------------------------------------

  const initSettingsFromServer = (s: ServerSettingsPayload) => {
    setCombatLogSpeedMs(s.combatLogSpeedMs ?? 800);
    setExplorationSpeedMs(s.explorationSpeedMs ?? 800);
    setAutoSkipKnownCombat(s.autoSkipKnownCombat ?? false);
    setDefaultExploreTurns(s.defaultExploreTurns ?? 100);
    setQuickRestHealPercent(s.quickRestHealPercent ?? 100);
    setDefaultRefiningMax(s.defaultRefiningMax ?? false);
    setLowHpWarning(s.lowHpWarning ?? true);
    setConfirmRarity(s.confirmRarity ?? 'uncommon');
    setLootRevealRarity(s.lootRevealRarity ?? 'uncommon');
    setHomeTownId(s.homeTownId ?? null);
  };

  return {
    // Values
    combatLogSpeedMs,
    explorationSpeedMs,
    autoSkipKnownCombat,
    defaultExploreTurns,
    quickRestHealPercent,
    defaultRefiningMax,
    lowHpWarning,
    confirmRarity,
    lootRevealRarity,
    guildTaxRate,
    homeTownId,

    // Raw setters for optimistic / external updates
    setCombatLogSpeedMs,
    setExplorationSpeedMs,
    setDefaultExploreTurns,
    setQuickRestHealPercent,
    setGuildTaxRate,

    // Handlers that persist to server
    handleSetCombatLogSpeed,
    handleSetExplorationSpeed,
    handleSetAutoSkipKnownCombat,
    handleSetDefaultExploreTurns,
    handleSetQuickRestHealPercent,
    handleSetDefaultRefiningMax,
    handleSetLowHpWarning,
    handleSetConfirmRarity,
    handleSetLootRevealRarity,
    handleSetHomeTown,

    // Initialization
    initSettingsFromServer,
  } as const;
}
