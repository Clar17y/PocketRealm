import type { ActionDefinition } from './combatAction.types';

export type BossTargetMode = 'single_target' | 'aoe';

export interface BossTemplateAction {
  actionId: string;
  targetMode: BossTargetMode;
  isTelegraphed?: boolean;
  label?: string;
}

export interface BossTemplateDefinition {
  actions: BossTemplateAction[];
  actionDefinitions: Record<string, ActionDefinition>;
}

export interface BossRotationReveal {
  totalRounds: number;
  revealedRounds: number;
  actions: Array<{
    round: number;
    actionName: string;
    targetMode: BossTargetMode;
    isTelegraphed: boolean;
  }>;
}
