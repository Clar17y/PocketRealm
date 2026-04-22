import type {
  ActionDefinition,
  CombatActor,
  CombatLogEntry,
  CombatPotion,
  PotionConsumed,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS } from '@pocketrealm/shared';
import {
  buildLogEntry,
  type RoundContext,
  type TemplateCombatState,
} from '../templateCombatTypes';
import {
  applyActionEffect,
  consumePotionAndApplySickness,
  hasPotionSickness,
  isMagicDot,
  isStatDebuff,
} from '../templateEffects';

export function executePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = (action.potionType ?? 'hp') as 'hp' | 'stamina' | 'mana';

  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  const potionIndex = availablePotions.findIndex((potion) => potion.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but has none left!`,
    }));
    return;
  }

  const combatant = state.combatants[actorKey];
  let actualRestore = 0;
  let resourceLabel: string;

  if (potionType === 'hp') {
    const hpBefore = combatant.hp;
    combatant.hp = Math.min(combatant.maxHp, combatant.hp + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(combatant.hp - hpBefore);
    resourceLabel = 'HP';
  } else if (potionType === 'stamina') {
    const before = combatant.stamina;
    combatant.stamina = Math.min(combatant.maxStamina, combatant.stamina + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(combatant.stamina - before);
    resourceLabel = 'Stamina';
  } else {
    const before = combatant.mana;
    combatant.mana = Math.min(combatant.maxMana, combatant.mana + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(combatant.mana - before);
    resourceLabel = 'Mana';
  }

  const potion = consumePotionAndApplySickness(
    state,
    actorKey,
    availablePotions,
    potionIndex,
    potionsConsumed,
    actualRestore,
  );

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    healAmount: actualRestore,
    healResourceType: potionType,
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      target: actorKey,
    }],
    message: `${actorName} drinks a ${potion.name}! +${actualRestore} ${resourceLabel}`,
  }));
}

export function executeCleanseAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  const potionIndex = availablePotions.findIndex((potion) => potion.potionType === 'cleanse');
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a cleanse potion but has none left!`,
    }));
    return;
  }

  const statDebuffs = state.activeEffects.filter((effect) => isStatDebuff(effect, actorKey));
  const magicDots = state.activeEffects.filter((effect) => isMagicDot(effect, actorKey));

  if (statDebuffs.length === 0 && magicDots.length === 0) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to cleanse but has no debuffs to remove!`,
    }));
    return;
  }

  const cleansedEntries: Array<{ name: string; target: CombatActor; stacksRemoved: number }> = [];
  const cleansedNames: string[] = [];

  if (statDebuffs.length > 0) {
    const debuffNames = new Set(statDebuffs.map((effect) => effect.name));
    state.activeEffects = state.activeEffects.filter((effect) => !isStatDebuff(effect, actorKey));
    for (const name of debuffNames) {
      const count = statDebuffs.filter((effect) => effect.name === name).length;
      cleansedEntries.push({ name, target: actorKey, stacksRemoved: count });
      cleansedNames.push(`${count}x ${name}`);
    }
  }

  const dotGroupsToClear = availablePotions[potionIndex].buffValue ?? 1;
  if (magicDots.length > 0) {
    const groups = new Map<string, { totalDamage: number; count: number }>();
    for (const dot of magicDots) {
      const existing = groups.get(dot.name) ?? { totalDamage: 0, count: 0 };
      existing.totalDamage += dot.resolvedDamagePerRound ?? 0;
      existing.count += 1;
      groups.set(dot.name, existing);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].totalDamage - a[1].totalDamage);
    const groupsToRemove = dotGroupsToClear === 0 ? sortedGroups : sortedGroups.slice(0, dotGroupsToClear);
    const namesToRemove = new Set(groupsToRemove.map(([name]) => name));

    state.activeEffects = state.activeEffects.filter(
      (effect) => !(isMagicDot(effect, actorKey) && namesToRemove.has(effect.name)),
    );

    for (const [name, group] of groupsToRemove) {
      cleansedEntries.push({ name, target: actorKey, stacksRemoved: group.count });
      cleansedNames.push(`${group.count}x ${name}`);
    }
  }

  const potion = consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, 0);

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'cleanse',
    spellName: potion.name,
    effectsCleansed: cleansedEntries,
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      target: actorKey,
    }],
    message: `${actorName} drinks ${potion.name}! Cleanses ${cleansedNames.join(', ')}!`,
  }));
}

export function executeBuffPotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = action.potionType as 'buff_attack' | 'buff_defence';

  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  const potionIndex = availablePotions.findIndex((potion) => potion.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a buff potion but has none left!`,
    }));
    return;
  }

  const potion = availablePotions[potionIndex];
  const duration = potion.buffDuration ?? 5;
  const value = potion.buffValue ?? 0;
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  if (potionType === 'buff_attack') {
    const applied = applyActionEffect(state, {
      name: 'Elixir of Power',
      stat: 'attackPercent',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (applied) {
      appliedEffects.push(...applied);
    }
  } else {
    const defenceApplied = applyActionEffect(state, {
      name: 'Resist Potion',
      stat: 'defence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (defenceApplied) {
      appliedEffects.push(...defenceApplied);
    }

    const magicDefenceApplied = applyActionEffect(state, {
      name: 'Resist Potion (Magic)',
      stat: 'magicDefence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (magicDefenceApplied) {
      appliedEffects.push(...magicDefenceApplied);
    }
  }

  consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, 0);
  const buffDescription = appliedEffects.length > 0
    ? appliedEffects
      .map((effect) => `${effect.stat} ${effect.modifier > 0 ? '+' : ''}${effect.modifier} (${effect.duration} rds)`)
      .join(', ')
    : 'buff cap reached';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    effectsApplied: [
      ...(appliedEffects.length > 0 ? appliedEffects : []),
      {
        stat: 'potionSickness',
        modifier: 0,
        duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
        target: actorKey,
      },
    ],
    message: `${actorName} drinks ${potion.name}! ${buffDescription}`,
  }));
}

export function canUsePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  availablePotions: CombatPotion[],
): boolean {
  if (!action.potionType) {
    return true;
  }
  if (hasPotionSickness(state, actorKey)) {
    return false;
  }

  if (action.potionType === 'cleanse') {
    const hasPotion = availablePotions.some((potion) => potion.potionType === 'cleanse');
    const hasDebuff = state.activeEffects.some((effect) => isStatDebuff(effect, actorKey) || isMagicDot(effect, actorKey));
    return hasPotion && hasDebuff;
  }

  return availablePotions.some((potion) => potion.potionType === action.potionType);
}
