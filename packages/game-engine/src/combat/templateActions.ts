import type {
  CombatantStats,
  ActionDefinition,
  CombatLogEntry,
  CombatActor,
  CombatAction,
  PerActionScaling,
  CombatPotion,
  PotionConsumed,
  CombatMode,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS } from '@pocketrealm/shared';
import type { RoundInteraction } from './actionResolver';
import {
  rollD20,
  rollDamage,
  calculateHitChance,
  resolveHitCheck,
  guaranteedHitResult,
  calculateAvoidScore,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  resolveActionDamageStats,
  resolveScalingStat,
} from './damageCalculator';
import {
  opponent,
  buildLogEntry,
  type TemplateCombatState,
  type RoundContext,
} from './templateCombatTypes';
import {
  applyActionEffect,
  hasPotionSickness,
  isStatDebuff,
  isMagicDot,
  consumePotionAndApplySickness,
} from './templateEffects';

export function applyActionDefenceReduction(defence: number, reductionPercent?: number): number {
  if (!reductionPercent || reductionPercent <= 0) {
    return defence;
  }

  return Math.max(0, Math.floor(defence * (1 - reductionPercent / 100)));
}

export function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') return 'attack';
  if (action.category === 'defensive') return 'defend';
  if (action.actionType === 'use_potion') return 'potion';
  if (action.actionType === 'use_cleanse_potion') return 'cleanse';
  if (action.actionType === 'use_buff_potion') return 'potion';
  return 'spell';
}

export function executeOffensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  hitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal',
  interactionDamageMultiplier: number,
  damageReduction: number,
  actorName: string,
  targetName: string,
  ctx: RoundContext,
  combatMode: CombatMode,
  perActionScaling?: PerActionScaling,
): void {
  // Guaranteed miss (counter/ward blocked the attack)
  if (hitOverride === 'guaranteed_miss') {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} avoids ${actorName}'s ${action.name}!`,
    }));
    return;
  }

  // Resolve per-action damage stats when scaling data is available (players),
  // otherwise fall back to pre-computed combatant stats (mobs).
  let baseDamageMin = actorStats.damageMin;
  let baseDamageMax = actorStats.damageMax;
  let baseAccuracy = actorStats.accuracy;

  if (perActionScaling) {
    const actionStats = resolveActionDamageStats(
      action.scalingStat ?? 'weapon',
      perActionScaling,
    );
    baseDamageMin = actionStats.damageMin;
    baseDamageMax = actionStats.damageMax;
    baseAccuracy = actionStats.accuracy;

    // Re-apply buff/debuff modifiers from active effects (these were lost
    // when per-action stats replaced the pre-computed effective stats).
    // Also collect attackPercent in the same pass.
    let attackPercentModifier = 0;
    for (const effect of state.activeEffects) {
      if (effect.target !== actorKey) continue;
      if (effect.stat === 'attack') { baseDamageMin += effect.modifier; baseDamageMax += effect.modifier; }
      else if (effect.stat === 'accuracy') baseAccuracy += effect.modifier;
      else if (effect.stat === 'damageMin') baseDamageMin += effect.modifier;
      else if (effect.stat === 'damageMax') baseDamageMax += effect.modifier;
      else if (effect.stat === 'attackPercent') attackPercentModifier += effect.modifier;
    }
    // Apply guild damage multiplier
    if (perActionScaling.guildDamageMultiplier && perActionScaling.guildDamageMultiplier > 0) {
      baseDamageMin = Math.round(baseDamageMin * (1 + perActionScaling.guildDamageMultiplier));
      baseDamageMax = Math.round(baseDamageMax * (1 + perActionScaling.guildDamageMultiplier));
    }

    baseDamageMin = Math.max(1, baseDamageMin);
    baseDamageMax = Math.max(baseDamageMin, baseDamageMax);

    if (attackPercentModifier !== 0) {
      baseDamageMin = Math.max(1, Math.floor(baseDamageMin * (1 + attackPercentModifier)));
      baseDamageMax = Math.max(baseDamageMin, Math.floor(baseDamageMax * (1 + attackPercentModifier)));
    }
  } else {
    // No per-action scaling (mobs) — effective stats already include flat buffs
    // from getEffectiveStats, but attackPercent is only handled here.
    let attackPercentModifier = 0;
    for (const effect of state.activeEffects) {
      if (effect.target === actorKey && effect.stat === 'attackPercent') {
        attackPercentModifier += effect.modifier;
      }
    }
    if (attackPercentModifier !== 0) {
      baseDamageMin = Math.max(1, Math.floor(baseDamageMin * (1 + attackPercentModifier)));
      baseDamageMax = Math.max(baseDamageMin, Math.floor(baseDamageMax * (1 + attackPercentModifier)));
    }
  }

  const attackRoll = hitOverride === 'guaranteed_hit' ? 20 : rollD20();
  const accuracyBonus = baseAccuracy + (action.accuracyModifier ?? 0);
  const hitScore = accuracyBonus;
  const avoidScore = calculateAvoidScore(targetStats);
  const hitResolution = hitOverride === 'guaranteed_hit' || action.alwaysHits
    ? guaranteedHitResult(hitScore, avoidScore)
    : attackRoll === 1 || attackRoll === 20
      ? { ...calculateHitChance(combatMode, hitScore, avoidScore), hitRollValue: attackRoll === 1 ? 1 : 0, didHit: attackRoll === 20 }
      : resolveHitCheck({
        combatMode,
        hitScore,
        avoidScore,
      });
  const hits = hitResolution.didHit;

  if (!hits) {
    const appliedEffects = action.effect?.alwaysApplies
      ? applyActionEffect(state, action.effect, actorKey, {
        sourceScalingStat: perActionScaling
          ? resolveScalingStat(
            action.scalingStat ?? 'weapon',
            perActionScaling.weaponRequiredSkill,
            perActionScaling.skillLevels,
          )
          : undefined,
      })
      : undefined;
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      roll: attackRoll,
      hitChance: hitResolution.hitChance,
      hitRollValue: hitResolution.hitRollValue,
      attackerHitScore: hitResolution.hitScore,
      defenderAvoidScore: hitResolution.avoidScore,
      accuracyModifier: accuracyBonus,
      targetDodge: targetStats.dodge,
      targetEvasion: targetStats.evasion,
      effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
      message: `${actorName} uses ${action.name} but misses ${targetName}!`,
    }));
    return;
  }

  // Resolve scaling stat for this action (used for damage type + XP tracking)
  const resolvedScaling = perActionScaling
    ? resolveScalingStat(action.scalingStat ?? 'weapon', perActionScaling.weaponRequiredSkill, perActionScaling.skillLevels)
    : null;

  // Determine damage type from the action.
  // If the action doesn't specify, resolve from scalingStat:
  // - 'weapon' scalingStat -> use weapon's combat style (magic weapons deal magic damage)
  // - explicit scalingStat -> default to 'physical' (cross-type actions set damageType explicitly)
  let actionDamageType: 'physical' | 'magic' = action.damageType ?? 'physical';
  if (!action.damageType && (action.scalingStat ?? 'weapon') === 'weapon' && resolvedScaling) {
    actionDamageType = resolvedScaling === 'magic' ? 'magic' : 'physical';
  }
  const effectiveDefence = actionDamageType === 'magic'
    ? targetStats.magicDefence
    : applyActionDefenceReduction(targetStats.defence, action.defenceReduction);

  // Roll and apply damage multiplier from action
  let rawDamage = rollDamage(baseDamageMin, baseDamageMax);
  const actionMultiplier = action.damageMultiplier ?? 1.0;
  rawDamage = Math.floor(rawDamage * actionMultiplier * interactionDamageMultiplier);

  const crit = isCriticalHit(actorStats.critChance ?? 0);
  const { damage: damageAfterDefence, actualMultiplier } = calculateFinalDamage(
    rawDamage,
    effectiveDefence,
    crit,
    actorStats.critDamage ?? 0,
  );

  // Apply defend's damage reduction (percentage)
  let finalDamage = damageAfterDefence;
  if (damageReduction > 0) {
    finalDamage = Math.max(1, Math.floor(finalDamage * (1 - damageReduction)));
  }

  state.combatants[opponent(actorKey)].hp -= finalDamage;

  // Resolved scaling stat for XP attribution (damage tracking + DOT source)
  const xpStat = resolvedScaling ?? (actorStats.damageType === 'magic' ? 'magic' as const : 'melee' as const);

  // Track damage by scaling stat for XP splitting (combatantA only)
  if (actorKey === 'combatantA' && finalDamage > 0) {
    state.damageByScalingStat[xpStat] += finalDamage;
  }

  // Life leech -- heal attacker for % of damage dealt
  let leechHeal = 0;
  if (action.lifeLeechPercent && action.lifeLeechPercent > 0 && finalDamage > 0) {
    const rawLeech = Math.floor(finalDamage * action.lifeLeechPercent / 100);
    if (rawLeech > 0) {
      const ac = state.combatants[actorKey];
      const before = ac.hp;
      ac.hp = Math.min(ac.maxHp, ac.hp + rawLeech);
      leechHeal = ac.hp - before;
    }
  }

  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
  const critText = crit ? ' CRITICAL HIT!' : '';
  const leechText = leechHeal > 0 ? ` Leeches ${leechHeal} HP!` : '';

  const appliedEffects = action.effect
    ? applyActionEffect(state, action.effect, actorKey, {
      damageForPercentCalc: finalDamage,
      sourceScalingStat: xpStat,
    })
    : undefined;

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: actionToCombatAction(action),
    roll: attackRoll,
    hitChance: hitResolution.hitChance,
    hitRollValue: hitResolution.hitRollValue,
    attackerHitScore: hitResolution.hitScore,
    defenderAvoidScore: hitResolution.avoidScore,
    damage: finalDamage,
    rawDamage,
    isCritical: crit,
    ...(crit ? { critMultiplier: actualMultiplier } : {}),
    ...(leechHeal > 0 ? { leechHeal } : {}),
    accuracyModifier: accuracyBonus,
    targetDodge: targetStats.dodge,
    targetEvasion: targetStats.evasion,
    targetDefence: actionDamageType === 'magic' ? undefined : targetStats.defence,
    targetMagicDefence: actionDamageType === 'magic' ? targetStats.magicDefence : undefined,
    armorReduction: actionDamageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: actionDamageType === 'magic' ? armorReduction : undefined,
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name} on ${targetName} for ${finalDamage} damage!${critText}${leechText}`,
  }));

  // Check for kill
  if (state.combatants[opponent(actorKey)].hp <= 0) {
    state.outcome = actorKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} falls defeated!`,
    }));
  }
}

export function executeSupportiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  // Resource potion use (hp/stamina/mana)
  if (action.actionType === 'use_potion') {
    executePotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Cleanse potion
  if (action.actionType === 'use_cleanse_potion') {
    executeCleanseAction(state, actorKey, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Buff potion (resist / elixir)
  if (action.actionType === 'use_buff_potion') {
    executeBuffPotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Buff or heal
  let healAmount = 0;
  let appliedEffects: CombatLogEntry['effectsApplied'];

  // Apply heal
  if (action.healFlat || action.healPercent) {
    const c = state.combatants[actorKey];
    const flatHeal = action.healFlat ?? 0;
    const percentHeal = Math.floor((action.healPercent ?? 0) * c.maxHp);
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + flatHeal + percentHeal);
    healAmount = c.hp - before;
  }

  // Apply buff/debuff effect
  if (action.effect) {
    appliedEffects = applyActionEffect(state, action.effect, actorKey);
  }

  const parts: string[] = [];
  if (healAmount > 0) {
    parts.push(`+${healAmount} HP`);
  }
  if (appliedEffects && appliedEffects.length > 0) {
    const desc = appliedEffects.map(
      (e) => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`,
    ).join(', ');
    parts.push(desc);
  }

  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'spell',
    spellName: action.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name}!${detail}`,
  }));
}

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

  // Check potion sickness
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  // Find a matching potion by type
  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but has none left!`,
    }));
    return;
  }

  const c = state.combatants[actorKey];
  let actualRestore = 0;
  let resourceLabel: string;

  if (potionType === 'hp') {
    const hpBefore = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.hp - hpBefore);
    resourceLabel = 'HP';
  } else if (potionType === 'stamina') {
    const before = c.stamina;
    c.stamina = Math.min(c.maxStamina, c.stamina + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.stamina - before);
    resourceLabel = 'Stamina';
  } else {
    const before = c.mana;
    c.mana = Math.min(c.maxMana, c.mana + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.mana - before);
    resourceLabel = 'Mana';
  }

  const potion = consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, actualRestore);

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

  const potionIndex = availablePotions.findIndex(p => p.potionType === 'cleanse');
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a cleanse potion but has none left!`,
    }));
    return;
  }

  // Find all stat debuffs and magic DOTs
  const statDebuffs = state.activeEffects.filter(e => isStatDebuff(e, actorKey));
  const magicDots = state.activeEffects.filter(e => isMagicDot(e, actorKey));

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

  // Always clear ALL stat debuffs
  if (statDebuffs.length > 0) {
    const debuffNames = new Set(statDebuffs.map(e => e.name));
    state.activeEffects = state.activeEffects.filter(e => !isStatDebuff(e, actorKey));
    for (const name of debuffNames) {
      const count = statDebuffs.filter(e => e.name === name).length;
      cleansedEntries.push({ name, target: actorKey, stacksRemoved: count });
      cleansedNames.push(`${count}x ${name}`);
    }
  }

  // Clear N worst magic DOT groups (N = potion's buffValue, 0 = all)
  const dotGroupsToClear = availablePotions[potionIndex].buffValue ?? 1;

  if (magicDots.length > 0) {
    // Group by name, sum damage per group
    const groups = new Map<string, { totalDamage: number; count: number }>();
    for (const dot of magicDots) {
      const existing = groups.get(dot.name) ?? { totalDamage: 0, count: 0 };
      existing.totalDamage += dot.resolvedDamagePerRound!;
      existing.count++;
      groups.set(dot.name, existing);
    }

    // Sort groups by total damage descending
    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].totalDamage - a[1].totalDamage);

    // Clear N groups (0 = all)
    const groupsToRemove = dotGroupsToClear === 0 ? sortedGroups : sortedGroups.slice(0, dotGroupsToClear);
    const namesToRemove = new Set(groupsToRemove.map(([name]) => name));

    state.activeEffects = state.activeEffects.filter(
      e => !(isMagicDot(e, actorKey) && namesToRemove.has(e.name)),
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

  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
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
    if (applied) appliedEffects.push(...applied);
  } else {
    const defApplied = applyActionEffect(state, {
      name: 'Resist Potion',
      stat: 'defence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (defApplied) appliedEffects.push(...defApplied);

    const mdefApplied = applyActionEffect(state, {
      name: 'Resist Potion (Magic)',
      stat: 'magicDefence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (mdefApplied) appliedEffects.push(...mdefApplied);
  }

  consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, 0);

  const buffDesc = appliedEffects.length > 0
    ? appliedEffects.map(e => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`).join(', ')
    : 'buff cap reached';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    effectsApplied: [
      ...(appliedEffects.length > 0 ? appliedEffects : []),
      { stat: 'potionSickness', modifier: 0, duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS, target: actorKey },
    ],
    message: `${actorName} drinks ${potion.name}! ${buffDesc}`,
  }));
}

export function canUsePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  availablePotions: CombatPotion[],
): boolean {
  if (!action.potionType) return true;
  if (hasPotionSickness(state, actorKey)) return false;

  if (action.potionType === 'cleanse') {
    const hasPotion = availablePotions.some(p => p.potionType === 'cleanse');
    const hasDebuff = state.activeEffects.some(e => isStatDebuff(e, actorKey) || isMagicDot(e, actorKey));
    return hasPotion && hasDebuff;
  }

  return availablePotions.some(p => p.potionType === action.potionType);
}

export function executeDefensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
): void {
  // Defensive actions are passive -- they modify the interaction result,
  // which is already factored into the opponent's attack execution.
  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'defend',
    message: `${actorName} uses ${action.name}!`,
  }));
}

// Dispatch a single combatant's action
export function executeAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  interaction: RoundInteraction,
  isAttacker: boolean,
  actorName: string,
  targetName: string,
  ctx: RoundContext,
  combatMode: CombatMode,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
  perActionScaling?: PerActionScaling,
): void {
  // Determine hit override, damage multiplier, and damage reduction for this actor
  const hitOverride = isAttacker ? interaction.attackerHitOverride : interaction.defenderHitOverride;
  const interactionDmgMult = isAttacker ? interaction.attackerDamageMultiplier : interaction.defenderDamageMultiplier;
  // Damage reduction applies when this actor is being attacked (the opponent's reduction on us)
  // But actually: attackerDamageReduction = A's defend reduction (A takes less damage)
  // When A is executing their offensive action against B, B's defenderDamageReduction applies
  const dmgReduction = isAttacker ? interaction.defenderDamageReduction : interaction.attackerDamageReduction;

  // Track resource cost by scaling stat for XP splitting (combatantA only)
  if (actorKey === 'combatantA' && perActionScaling) {
    const cost = action.cost.stamina + action.cost.mana;
    if (cost > 0) {
      const resolved = resolveScalingStat(action.scalingStat ?? 'weapon', perActionScaling.weaponRequiredSkill, perActionScaling.skillLevels);
      state.resourceCostByScalingStat[resolved] += cost;
    }
  }

  if (action.category === 'offensive') {
    executeOffensiveAction(
      state, actorKey, actorStats, targetStats, action,
      hitOverride, interactionDmgMult, dmgReduction,
      actorName, targetName, ctx, combatMode,
      perActionScaling,
    );
  } else if (action.category === 'supportive') {
    executeSupportiveAction(
      state, actorKey, actorStats, action,
      actorName, ctx,
      availablePotions, potionsConsumed,
    );
  } else if (action.effect || action.healFlat || action.healPercent) {
    executeSupportiveAction(
      state, actorKey, actorStats, action,
      actorName, ctx,
      availablePotions, potionsConsumed,
    );
  } else {
    executeDefensiveAction(state, actorKey, action, actorName, ctx);
  }
}

export function describeInteraction(interaction: RoundInteraction): string {
  const parts: string[] = [];
  if (interaction.attackerHitOverride === 'guaranteed_miss') parts.push('A blocked');
  if (interaction.defenderHitOverride === 'guaranteed_miss') parts.push('B blocked');
  if (interaction.attackerDamageMultiplier > 1) parts.push('A channeling bonus');
  if (interaction.defenderDamageMultiplier > 1) parts.push('B channeling bonus');
  if (interaction.attackerDamageReduction > 0) parts.push('A defending');
  if (interaction.defenderDamageReduction > 0) parts.push('B defending');
  return parts.length > 0 ? parts.join(', ') : 'normal';
}
