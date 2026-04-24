import { useCallback, useState } from 'react';
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
  forgeConfirmRarity?: ConfirmRarity | null;
  homeTownId?: string | null;
  notifyPvpAttack?: boolean | null;
  notifyPvpScout?: boolean | null;
  notifyBossAppeared?: boolean | null;
  notifyBossKilled?: boolean | null;
  notifyTurnBankFull?: boolean | null;
  notifyExpeditionStarted?: boolean | null;
  notifyExpeditionFinished?: boolean | null;
  showNpcDialogue?: boolean | null;
  showItemFlavourText?: boolean | null;
  showBestiaryLore?: boolean | null;
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
  const [forgeConfirmRarity, setForgeConfirmRarity] = useState<ConfirmRarity>('rare');
  const [guildTaxRate, setGuildTaxRate] = useState(0);
  const [homeTownId, setHomeTownId] = useState<string | null>(null);
  const [showNpcDialogue, setShowNpcDialogue] = useState(true);
  const [showItemFlavourText, setShowItemFlavourText] = useState(true);
  const [showBestiaryLore, setShowBestiaryLore] = useState(true);

  const [notificationPrefs, setNotificationPrefs] = useState({
    notifyPvpAttack: true,
    notifyPvpScout: true,
    notifyBossAppeared: true,
    notifyBossKilled: true,
    notifyTurnBankFull: true,
    notifyExpeditionStarted: true,
    notifyExpeditionFinished: true,
  });

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
  const handleSetForgeConfirmRarity = (value: ConfirmRarity) =>
    handleSetSetting('forgeConfirmRarity', value, setForgeConfirmRarity, forgeConfirmRarity);
  const handleSetHomeTown = (zoneId: string) =>
    handleSetSetting('homeTownId', zoneId, setHomeTownId, homeTownId);
  const handleSetShowNpcDialogue = (value: boolean) =>
    handleSetSetting('showNpcDialogue', value, setShowNpcDialogue, showNpcDialogue);
  const handleSetShowItemFlavourText = (value: boolean) =>
    handleSetSetting('showItemFlavourText', value, setShowItemFlavourText, showItemFlavourText);
  const handleSetShowBestiaryLore = (value: boolean) =>
    handleSetSetting('showBestiaryLore', value, setShowBestiaryLore, showBestiaryLore);

  const handleSetNotificationPref = async (key: keyof typeof notificationPrefs, value: boolean) => {
    const prev = notificationPrefs[key];
    setNotificationPrefs((p) => ({ ...p, [key]: value }));
    const res = await updatePlayerSettings({ [key]: value });
    if (!res.data) setNotificationPrefs((p) => ({ ...p, [key]: prev }));
  };

  // --- server hydration ---------------------------------------------------------

  const initSettingsFromServer = useCallback((s: ServerSettingsPayload) => {
    setCombatLogSpeedMs(s.combatLogSpeedMs ?? 800);
    setExplorationSpeedMs(s.explorationSpeedMs ?? 800);
    setAutoSkipKnownCombat(s.autoSkipKnownCombat ?? false);
    setDefaultExploreTurns(s.defaultExploreTurns ?? 100);
    setQuickRestHealPercent(s.quickRestHealPercent ?? 100);
    setDefaultRefiningMax(s.defaultRefiningMax ?? false);
    setLowHpWarning(s.lowHpWarning ?? true);
    setConfirmRarity(s.confirmRarity ?? 'uncommon');
    setLootRevealRarity(s.lootRevealRarity ?? 'uncommon');
    setForgeConfirmRarity(s.forgeConfirmRarity ?? 'rare');
    setHomeTownId(s.homeTownId ?? null);
    setShowNpcDialogue(s.showNpcDialogue ?? true);
    setShowItemFlavourText(s.showItemFlavourText ?? true);
    setShowBestiaryLore(s.showBestiaryLore ?? true);
    setNotificationPrefs({
      notifyPvpAttack: s.notifyPvpAttack ?? true,
      notifyPvpScout: s.notifyPvpScout ?? true,
      notifyBossAppeared: s.notifyBossAppeared ?? true,
      notifyBossKilled: s.notifyBossKilled ?? true,
      notifyTurnBankFull: s.notifyTurnBankFull ?? true,
      notifyExpeditionStarted: s.notifyExpeditionStarted ?? true,
      notifyExpeditionFinished: s.notifyExpeditionFinished ?? true,
    });
  }, []);

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
    forgeConfirmRarity,
    guildTaxRate,
    homeTownId,

    showNpcDialogue,
    showItemFlavourText,
    showBestiaryLore,

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
    handleSetForgeConfirmRarity,
    handleSetHomeTown,
    handleSetShowNpcDialogue,
    handleSetShowItemFlavourText,
    handleSetShowBestiaryLore,
    notificationPrefs,
    handleSetNotificationPref,

    // Initialization
    initSettingsFromServer,
  } as const;
}
