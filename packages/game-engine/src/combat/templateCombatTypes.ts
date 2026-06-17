import type {
  CombatTemplateSlotData,
  ActionDefinition,
  CombatOutcome,
  CombatLogEntry,
  CombatantStats,
  ActiveEffect,
  CombatActor,
  PerActionScaling,
} from '@pocketrealm/shared';

export const MAX_ROUNDS = 100;

// --- Public Combatant Type (lives here to avoid circular deps) ---

export interface TemplateCombatant {
  id: string;
  name: string;
  stats: CombatantStats;
  template: CombatTemplateSlotData[];
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  actionDefinitions: Record<string, ActionDefinition>;
  /** Per-action scaling data -- present for players, absent for mobs */
  perActionScaling?: PerActionScaling;
}

// --- Public Log Entry Type (needed by both engine and types) ---

export interface TemplateCombatLogEntry extends CombatLogEntry {
  combatantAAction: string;
  combatantBAction: string;
  combatantAStaminaAfter: number;
  combatantBStaminaAfter: number;
  combatantAManaAfter: number;
  combatantBManaAfter: number;
  wasExhausted?: boolean;
  interactionResult?: string;
  forcedActionReason?: 'pinned';
  tickType?: 'dot_tick' | 'hot_tick';
}

// --- Internal State ---

export interface CombatantState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaRegen: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
}

export interface TemplateCombatState {
  combatants: Record<CombatActor, CombatantState>;
  round: number;
  log: TemplateCombatLogEntry[];
  outcome: CombatOutcome | null;
  activeEffects: ActiveEffect[];
  damageByScalingStat: { melee: number; ranged: number; magic: number };
  resourceCostByScalingStat: { melee: number; ranged: number; magic: number };
}

/** Shared params passed through every action execution within a round. */
export interface RoundContext {
  combatantAAction: string;
  combatantBAction: string;
  wasExhausted: boolean;
  interactionResult: string;
  forcedActionReason?: 'pinned';
}

// --- Helpers ---

export function opponent(actor: CombatActor): CombatActor {
  return actor === 'combatantA' ? 'combatantB' : 'combatantA';
}

/** Build a log entry with HP/resource snapshots and round context baked in. */
export function buildLogEntry(
  state: TemplateCombatState,
  ctx: RoundContext | null,
  fields: Partial<TemplateCombatLogEntry> & Pick<TemplateCombatLogEntry, 'actor' | 'actorName' | 'action' | 'message'>,
): TemplateCombatLogEntry {
  const a = state.combatants.combatantA;
  const b = state.combatants.combatantB;
  return {
    round: state.round,
    combatantAHpAfter: Math.max(0, a.hp),
    combatantBHpAfter: Math.max(0, b.hp),
    combatantAStaminaAfter: a.stamina,
    combatantBStaminaAfter: b.stamina,
    combatantAManaAfter: a.mana,
    combatantBManaAfter: b.mana,
    combatantAAction: ctx?.combatantAAction ?? '',
    combatantBAction: ctx?.combatantBAction ?? '',
    wasExhausted: ctx?.wasExhausted,
    interactionResult: ctx?.interactionResult,
    forcedActionReason: ctx?.forcedActionReason,
    ...fields,
  };
}
