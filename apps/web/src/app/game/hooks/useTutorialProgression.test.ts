import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_SAVE_TEMPLATE,
} from '@/lib/tutorial';
import { useTutorialProgression } from './useTutorialProgression';

const { activateTemplate, claimStarterWeapon, updateTutorialStep } = vi.hoisted(() => ({
  activateTemplate: vi.fn(),
  claimStarterWeapon: vi.fn(),
  updateTutorialStep: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  activateTemplate,
  claimStarterWeapon,
  updateTutorialStep,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('useTutorialProgression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the refining tab when the tutorial reaches the refine step', () => {
    const setActiveGatheringSkill = vi.fn();
    const setActiveCraftingSkill = vi.fn();

    renderHook(() => useTutorialProgression({
      tutorialStep: TUTORIAL_STEP_REFINE,
      setTutorialStep: vi.fn(),
      setActiveGatheringSkill,
      setActiveCraftingSkill,
      setStarterWeaponType: vi.fn(),
      loadAll: vi.fn(),
      handleLoadTemplates: vi.fn(),
    }));

    expect(setActiveCraftingSkill).toHaveBeenCalledWith('refining');
    expect(setActiveGatheringSkill).not.toHaveBeenCalled();
  });

  it('activates and reloads a template, then advances the tutorial when saving during the tutorial step', async () => {
    activateTemplate.mockResolvedValue({ data: { success: true } });
    updateTutorialStep.mockResolvedValue({ data: { tutorialStep: TUTORIAL_STEP_SAVE_TEMPLATE + 1 } });
    const setTutorialStep = vi.fn();
    const handleLoadTemplates = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTutorialProgression({
      tutorialStep: TUTORIAL_STEP_SAVE_TEMPLATE,
      setTutorialStep,
      setActiveGatheringSkill: vi.fn(),
      setActiveCraftingSkill: vi.fn(),
      setStarterWeaponType: vi.fn(),
      loadAll: vi.fn(),
      handleLoadTemplates,
    }));

    await act(async () => {
      await result.current.handleTemplateSaved('template-1');
    });

    expect(activateTemplate).toHaveBeenCalledWith('template-1');
    expect(handleLoadTemplates).toHaveBeenCalled();
    expect(updateTutorialStep).toHaveBeenCalledWith(TUTORIAL_STEP_SAVE_TEMPLATE + 1);
    expect(setTutorialStep).toHaveBeenCalledWith(TUTORIAL_STEP_SAVE_TEMPLATE + 1);
  });
});
