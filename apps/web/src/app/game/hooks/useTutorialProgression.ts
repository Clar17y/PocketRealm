import { useCallback, useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';
import { activateTemplate, claimStarterWeapon, updateTutorialStep } from '@/lib/api';
import {
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_SAVE_TEMPLATE,
  TUTORIAL_STEP_STARTER_WEAPON,
} from '@/lib/tutorial';

interface UseTutorialProgressionOptions {
  tutorialStep: number;
  setTutorialStep: (step: number) => void;
  setActiveGatheringSkill: (skill: 'mining' | 'foraging' | 'woodcutting') => void;
  setActiveCraftingSkill: (skill: 'refining' | 'tanning' | 'weaving' | 'weaponsmithing' | 'armorsmithing' | 'leatherworking' | 'tailoring' | 'alchemy' | 'jewelcrafting') => void;
  setStarterWeaponType: (weaponType: 'melee' | 'ranged' | 'magic' | null) => void;
  loadAll: () => Promise<void>;
  handleLoadTemplates: () => Promise<void>;
}

export function useTutorialProgression({
  tutorialStep,
  setTutorialStep,
  setActiveGatheringSkill,
  setActiveCraftingSkill,
  setStarterWeaponType,
  loadAll,
  handleLoadTemplates,
}: UseTutorialProgressionOptions) {
  const advanceTutorial = useCallback(async (fromStep: number) => {
    if (tutorialStep !== fromStep) {
      return;
    }

    const nextStep = fromStep + 1;
    const response = await updateTutorialStep(nextStep);
    if (response.data) {
      setTutorialStep(response.data.tutorialStep);
      if (response.data.tutorialStep === TUTORIAL_COMPLETED) {
        trackEvent('tutorial_complete');
      }
    }
  }, [setTutorialStep, tutorialStep]);

  const skipTutorial = useCallback(async () => {
    const response = await updateTutorialStep(TUTORIAL_SKIPPED);
    if (response.data) {
      setTutorialStep(response.data.tutorialStep);
    }
  }, [setTutorialStep]);

  const handleTemplateSaved = useCallback(async (templateId?: string) => {
    if (templateId) {
      await activateTemplate(templateId);
      await handleLoadTemplates();
    }
    if (tutorialStep === TUTORIAL_STEP_SAVE_TEMPLATE) {
      await advanceTutorial(TUTORIAL_STEP_SAVE_TEMPLATE);
    }
  }, [advanceTutorial, handleLoadTemplates, tutorialStep]);

  const handleClaimStarterWeapon = useCallback(async (weaponType: 'melee' | 'ranged' | 'magic') => {
    const response = await claimStarterWeapon(weaponType);
    if (response.data?.success) {
      setStarterWeaponType(weaponType);
      await loadAll();
      await advanceTutorial(TUTORIAL_STEP_STARTER_WEAPON);
    }
  }, [advanceTutorial, loadAll, setStarterWeaponType]);

  useEffect(() => {
    if (tutorialStep === TUTORIAL_STEP_GATHER) {
      setActiveGatheringSkill('woodcutting');
    } else if (tutorialStep === TUTORIAL_STEP_REFINE) {
      setActiveCraftingSkill('refining');
    } else if (tutorialStep === TUTORIAL_STEP_CRAFT) {
      setActiveCraftingSkill('weaponsmithing');
    }
  }, [setActiveCraftingSkill, setActiveGatheringSkill, tutorialStep]);

  return {
    advanceTutorial,
    skipTutorial,
    handleTemplateSaved,
    handleClaimStarterWeapon,
  };
}
