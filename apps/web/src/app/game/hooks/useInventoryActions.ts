import { trackEvent } from '@/lib/analytics';
import {
  salvage, salvageBatch, forgeUpgrade, forgeReroll,
  destroyInventoryItem, repairItem, repairAllEquipped,
  useItem, equip, unequip, sellItem, sellBulk,
  depositToStash, depositBatchToStash,
  withdrawFromStash, withdrawBatchFromStash,
  type ApiResponse,
} from '@/lib/api';
import { CRAFTING_CONSTANTS, ITEM_RARITY_CONSTANTS } from '@pocketrealm/shared';
import { nowStamp } from './useActivityLog';
import { showForgeToast } from '../gameControllerHelpers';
import { TUTORIAL_STEP_EQUIP } from '@/lib/tutorial';
import type { ActivityLogEntry } from '../gameController.types';

interface UseInventoryActionsParams {
  simpleAction: <T>(
    actionName: string,
    apiFn: () => Promise<ApiResponse<T>>,
    onSuccess?: (data: T) => void | Promise<void>,
  ) => Promise<void>;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (n: number) => void;
  setGold: (n: number) => void;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
}

export function useInventoryActions({
  simpleAction,
  pushLog,
  setTurns,
  setGold,
  advanceTutorial,
}: UseInventoryActionsParams) {
  const handleSalvageItem = (itemId: string) =>
    simpleAction('salvage', () => salvage(itemId), (data) => {
      setTurns(data.turns.currentTurns);
      const materialSummary = data.salvage.returnedMaterials.map((e) => `${e.name} x${e.quantity}`).join(', ');
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Salvaged item for: ${materialSummary}.` });
      trackEvent('action', { type: 'salvage', turns: CRAFTING_CONSTANTS.SALVAGE_TURN_COST });
    });

  const handleSalvageBatch = (itemIds: string[]) =>
    simpleAction('salvage_batch', () => salvageBatch(itemIds), (data) => {
      setTurns(data.turns.currentTurns);
      const materialSummary = data.returnedMaterials.map((e) => `${e.name} x${e.quantity}`).join(', ');
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Salvaged ${data.salvaged.length} items (${data.totalTurnCost} turns). Recovered: ${materialSummary}` });
      trackEvent('action', { type: 'salvage', turns: data.totalTurnCost });
    });

  const handleForgeUpgrade = (itemId: string, sacrificialItemId: string) =>
    simpleAction('forge_upgrade', () => forgeUpgrade(itemId, sacrificialItemId), (data) => {
      setTurns(data.turns.currentTurns);
      const fromLabel = data.forge.fromRarity.charAt(0).toUpperCase() + data.forge.fromRarity.slice(1);
      const toLabel = data.forge.toRarity.charAt(0).toUpperCase() + data.forge.toRarity.slice(1);
      const effectiveChance = data.forge.adjustedChance ?? data.forge.successChance;
      const chancePct = (effectiveChance * 100).toFixed(1);
      const buffTag = data.forge.buffUsed === 'forge_luck' ? ' [Forge Luck active]'
        : data.forge.buffUsed === 'forge_protection' ? ' [Forge Protection active]'
        : '';

      if (data.forge.success) {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Forge success: ${fromLabel} -> ${toLabel} (${chancePct}% chance).${buffTag} Sacrificial item consumed.`,
        });
        showForgeToast({ type: 'upgrade_success', message: `Upgraded to ${toLabel}!` });
      } else if (data.forge.protected) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Forge failed at ${fromLabel} (${chancePct}% chance) but item was protected!${buffTag} Sacrifice consumed.`,
        });
        showForgeToast({ type: 'upgrade_protected', message: `Failed but protected!` });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Forge failed at ${fromLabel} (${chancePct}% chance).${buffTag} Target and sacrifice consumed.`,
        });
        showForgeToast({ type: 'upgrade_fail', message: `Upgrade failed — target and sacrifice consumed` });
      }
      const upgradeTurns = ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY[data.forge.fromRarity as keyof typeof ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY] ?? 100;
      trackEvent('action', { type: 'forge_upgrade', turns: upgradeTurns });
    });

  const handleForgeReroll = (itemId: string, sacrificialItemId: string) =>
    simpleAction('forge_reroll', () => forgeReroll(itemId, sacrificialItemId), (data) => {
      setTurns(data.turns.currentTurns);
      const rarityLabel = data.forge.rarity.charAt(0).toUpperCase() + data.forge.rarity.slice(1);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Re-rolled ${rarityLabel} item bonus stats. Sacrificial duplicate consumed.` });
      showForgeToast({ type: 'reroll', message: `Stats rerolled!` });
      const rerollTurns = ITEM_RARITY_CONSTANTS.REROLL_TURN_COST_BY_RARITY[data.forge.rarity as keyof typeof ITEM_RARITY_CONSTANTS.REROLL_TURN_COST_BY_RARITY] ?? 75;
      trackEvent('action', { type: 'forge_reroll', turns: rerollTurns });
    });

  const handleDestroyItem = (itemId: string) =>
    simpleAction('destroy', () => destroyInventoryItem(itemId));

  const handleRepairItem = (itemId: string) =>
    simpleAction('repair', () => repairItem(itemId), (data) => {
      if (data.turns) setTurns(data.turns.currentTurns);
      if (data.destroyed) {
        const label = data.name ?? 'Item';
        pushLog({ timestamp: nowStamp(), type: 'warning', message: `${label} was too degraded to survive repair and has been permanently destroyed.` });
      }
    });

  const handleRepairAllEquipped = () =>
    simpleAction('repair_all', () => repairAllEquipped(), (data) => {
      if (data.turns) setTurns(data.turns.currentTurns);
      const destroyed = data.items.filter((i) => i.destroyed);
      for (const item of destroyed) {
        pushLog({ timestamp: nowStamp(), type: 'warning', message: `${item.name} was too degraded to survive repair and has been permanently destroyed.` });
      }
    });

  const handleUseItem = (itemId: string) =>
    simpleAction('use_item', () => useItem(itemId));

  const handleEquipItem = (itemId: string, slot: string) =>
    simpleAction('equip', () => equip(itemId, slot), async () => {
      await advanceTutorial(TUTORIAL_STEP_EQUIP);
    });

  const handleUnequipSlot = (slot: string) =>
    simpleAction('unequip', () => unequip(slot));

  const handleSellItem = (itemId: string) =>
    simpleAction('sell', () => sellItem(itemId), (data) => {
      setGold(data.newGold);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Sold item for ${data.goldEarned} gold` });
    });

  const handleSellBatch = (itemIds: string[]) =>
    simpleAction('sell_batch', () => sellBulk(itemIds), (data) => {
      setGold(data.newGold);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Sold ${data.soldCount} item(s) for ${data.totalGoldEarned} gold` });
    });

  const handleDepositItem = (itemId: string) =>
    simpleAction('deposit', () => depositToStash(itemId), () => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: 'Item deposited to stash' });
    });

  const handleDepositBatch = (itemIds: string[]) =>
    simpleAction('deposit_batch', () => depositBatchToStash(itemIds), (data) => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: `${data.depositedCount} item(s) deposited to stash` });
    });

  const handleWithdrawItem = (itemId: string) =>
    simpleAction('withdraw', () => withdrawFromStash(itemId), () => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: 'Item withdrawn from stash' });
    });

  const handleWithdrawBatch = (itemIds: string[]) =>
    simpleAction('withdraw_batch', () => withdrawBatchFromStash(itemIds), (data) => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: `${data.withdrawnCount} item(s) withdrawn from stash` });
    });

  return {
    handleSalvageItem,
    handleSalvageBatch,
    handleForgeUpgrade,
    handleForgeReroll,
    handleDestroyItem,
    handleRepairItem,
    handleRepairAllEquipped,
    handleUseItem,
    handleEquipItem,
    handleUnequipSlot,
    handleSellItem,
    handleSellBatch,
    handleDepositItem,
    handleDepositBatch,
    handleWithdrawItem,
    handleWithdrawBatch,
  };
}
