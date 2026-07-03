import { useCallback } from 'react';
import { trackEvent, trackOnce } from '@/lib/analytics';
import { craft } from '@/lib/api';
import type { CraftRequestOptions } from '@/lib/api/items';
import type { QuestProgressUpdate } from '@pocketrealm/shared';
import { TUTORIAL_STEP_CRAFT, TUTORIAL_STEP_REFINE } from '@/lib/tutorial';
import { prettyStatName, formatStatValue } from '@/lib/statFormat';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import type { ActivityLogEntry } from '../gameController.types';
import { nowStamp } from './useActivityLog';

type RunAction = (name: string, fn: () => Promise<void>) => Promise<void>;

interface CraftingRecipeForAction {
  id: string;
  turnCost: number;
  materials: Array<{ templateId: string; quantity: number }>;
  materialTemplates: Array<{ id: string; name: string }>;
  resultTemplate: { name: string };
}

interface UseCraftingActionsParams {
  craftingRecipes: CraftingRecipeForAction[];
  runAction: RunAction;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (turns: number) => void;
  setActionError: (message: string) => void;
  stateSetters: StateSetters;
  updateQuestProgress: (updates?: QuestProgressUpdate[]) => void;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
}

export function useCraftingActions({
  craftingRecipes,
  runAction,
  pushLog,
  setTurns,
  setActionError,
  stateSetters,
  updateQuestProgress,
  advanceTutorial,
}: UseCraftingActionsParams) {
  const handleCraft = useCallback(async (
    recipeId: string,
    quantity: number = 1,
    options: CraftRequestOptions = {},
  ) => {
    await runAction('crafting', async () => {
      const recipe = craftingRecipes.find((entry) => entry.id === recipeId);
      const res = await craft(recipeId, quantity, options);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Crafting failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      updateQuestProgress(data.questProgress);

      const newLogs: ActivityLogEntry[] = [];
      const timestamp = nowStamp();
      const skillName = data.xp.skillType.charAt(0).toUpperCase() + data.xp.skillType.slice(1);

      if (recipe) {
        const materialsUsed = recipe.materials
          .map((material) => {
            const meta = recipe.materialTemplates.find((template) => template.id === material.templateId);
            const consumed = material.quantity * data.crafted.quantity;
            return `${meta?.name ?? 'Unknown'} x${consumed}`;
          })
          .join(', ');

        newLogs.push({
          timestamp,
          type: 'info',
          message: `Used materials: ${materialsUsed}.`,
        });
      }

      newLogs.push({
        timestamp,
        type: 'success',
        message: `Crafted ${recipe?.resultTemplate.name ?? 'item'} x${data.crafted.quantity}.`,
      });

      for (const detail of data.craftedItemDetails ?? []) {
        if (!detail.isCrit || !detail.bonusStats) continue;
        const rarityLabel = detail.rarity !== 'uncommon' ? ` ${detail.rarity}` : '';
        for (const [stat, value] of Object.entries(detail.bonusStats)) {
          newLogs.push({
            timestamp,
            type: 'success',
            message: `Critical${rarityLabel} craft! +${formatStatValue(stat, value)} ${prettyStatName(stat)}.`,
          });
        }
      }

      if (data.autoForge) {
        for (const attempt of data.autoForge.attempts) {
          newLogs.push({
            timestamp,
            type: attempt.success ? 'success' : 'info',
            message: attempt.success
              ? `Auto-forge ${attempt.fromRarity} -> ${attempt.toRarity} succeeded.`
              : `Auto-forge ${attempt.fromRarity} -> ${attempt.toRarity} failed.`,
          });
        }

        const finalSummary = Object.entries(data.autoForge.finalCountsByRarity)
          .map(([rarity, count]) => `${rarity} x${count}`)
          .join(', ');
        if (finalSummary) {
          newLogs.push({
            timestamp,
            type: 'success',
            message: `Auto-forge results: ${finalSummary}.`,
          });
        }

        const leftoverSummary = Object.entries(data.autoForge.leftoverCountsByRarity)
          .map(([rarity, count]) => `${rarity} x${count}`)
          .join(', ');
        if (leftoverSummary) {
          newLogs.push({
            timestamp,
            type: 'info',
            message: `Auto-forge leftovers: ${leftoverSummary}.`,
          });
        }
      }

      newLogs.push({
        timestamp,
        type: 'success',
        message: `Gained ${data.xp.xpAfterEfficiency.toLocaleString()} ${skillName} XP.`,
      });

      if (data.xp?.leveledUp) {
        newLogs.push({
          timestamp,
          type: 'success',
          message: `${skillName} leveled up to ${data.xp.newLevel}!`,
        });
      }

      if (data.xp?.atDailyCap) {
        newLogs.push({
          timestamp,
          type: 'info',
          message: `${skillName} has reached the daily XP cap.`,
        });
      }

      pushLog(...newLogs);
      applyStateUpdates(data.stateUpdates, stateSetters);
      const craftTurns = recipe ? recipe.turnCost * data.crafted.quantity : 50;
      trackEvent('action', { type: data.xp.skillType, turns: craftTurns });
      trackOnce('first_craft', { skill: data.xp.skillType });
      if (data.xp?.leveledUp) {
        trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
      }
      await advanceTutorial(TUTORIAL_STEP_REFINE);
      await advanceTutorial(TUTORIAL_STEP_CRAFT);
    });
  }, [
    advanceTutorial,
    craftingRecipes,
    pushLog,
    runAction,
    setActionError,
    setTurns,
    stateSetters,
    updateQuestProgress,
  ]);

  return { handleCraft };
}
