import {
  ActiveEffect,
  CombatActor,
  CombatState,
  CombatLogEntry,
  CombatOptions,
  CombatPotion,
  CombatResult,
  CombatantStats,
  Combatant,
  POTION_CONSTANTS,
  PotionConsumed,
  SpellAction,
} from '@adventure/shared';
import {
  rollD20,
  rollDamage,
  doesAttackHit,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  rollInitiative,
} from './damageCalculator';

const MAX_ROUNDS = 100;

function getHp(state: CombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAHp : state.combatantBHp;
}

function applyDamage(state: CombatState, target: CombatActor, damage: number): void {
  if (target === 'combatantA') {
    state.combatantAHp -= damage;
  } else {
    state.combatantBHp -= damage;
  }
}

function applyHeal(state: CombatState, target: CombatActor, heal: number): number {
  if (target === 'combatantA') {
    const before = state.combatantAHp;
    state.combatantAHp = Math.min(state.combatantAMaxHp, state.combatantAHp + heal);
    return state.combatantAHp - before;
  } else {
    const before = state.combatantBHp;
    state.combatantBHp = Math.min(state.combatantBMaxHp, state.combatantBHp + heal);
    return state.combatantBHp - before;
  }
}

function opponent(actor: CombatActor): CombatActor {
  return actor === 'combatantA' ? 'combatantB' : 'combatantA';
}

function hpSnapshot(state: CombatState): Pick<CombatLogEntry, 'combatantAHpAfter' | 'combatantBHpAfter'> {
  return {
    combatantAHpAfter: Math.max(0, state.combatantAHp),
    combatantBHpAfter: Math.max(0, state.combatantBHp),
  };
}

function tickEffects(state: CombatState, names: { combatantA: string; combatantB: string }): void {
  const expired: ActiveEffect[] = [];
  const remaining: ActiveEffect[] = [];

  for (const effect of state.activeEffects) {
    effect.remainingRounds--;
    if (effect.remainingRounds <= 0) {
      expired.push(effect);
    } else {
      remaining.push(effect);
    }
  }

  state.activeEffects = remaining;

  const expiredNames = new Map<string, { target: CombatActor }>();
  for (const e of expired) {
    if (!expiredNames.has(e.name)) {
      expiredNames.set(e.name, { target: e.target });
    }
  }

  if (expiredNames.size > 0) {
    const targets = Array.from(expiredNames.values()).map(e => e.target);
    const actor = targets.every(t => t === 'combatantA') ? 'combatantA' as CombatActor : 'combatantB' as CombatActor;

    state.log.push({
      round: state.round,
      actor,
      actorName: actor === 'combatantA' ? names.combatantA : names.combatantB,
      action: 'spell',
      message: Array.from(expiredNames.keys()).map(n => `${n} wore off.`).join(' '),
      effectsExpired: Array.from(expiredNames.entries()).map(([name, { target }]) => ({ name, target })),
      ...hpSnapshot(state),
    });
  }
}

function getEffectiveStats(baseStats: CombatantStats, activeEffects: ActiveEffect[], target: CombatActor): CombatantStats {
  const effective = { ...baseStats };

  for (const effect of activeEffects) {
    if (effect.target !== target) continue;

    switch (effect.stat) {
      case 'attack':
        effective.damageMin += effect.modifier;
        effective.damageMax += effect.modifier;
        break;
      case 'accuracy': effective.accuracy += effect.modifier; break;
      case 'defence': effective.defence += effect.modifier; break;
      case 'magicDefence': effective.magicDefence += effect.modifier; break;
      case 'dodge': effective.dodge += effect.modifier; break;
      case 'evasion': effective.evasion += effect.modifier; break;
      case 'speed': effective.speed += effect.modifier; break;
      case 'critChance': effective.critChance = (effective.critChance ?? 0) + effect.modifier; break;
      case 'damageMin': effective.damageMin += effect.modifier; break;
      case 'damageMax': effective.damageMax += effect.modifier; break;
    }
  }

  effective.defence = Math.max(0, effective.defence);
  effective.magicDefence = Math.max(0, effective.magicDefence);
  effective.dodge = Math.max(0, effective.dodge);
  effective.evasion = Math.max(0, effective.evasion);
  effective.damageMin = Math.max(1, effective.damageMin);
  effective.damageMax = Math.max(effective.damageMin, effective.damageMax);

  return effective;
}

function tryAutoPotion(
  state: CombatState,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
  threshold: number,
): boolean {
  if (threshold <= 0 || availablePotions.length === 0) return false;

  const hpPercent = (state.combatantAHp / state.combatantAMaxHp) * 100;
  if (hpPercent >= threshold) return false;

  // Check for Potion Sickness active effect
  const hasSickness = state.activeEffects.some(
    e => e.target === 'combatantA' && e.stat === 'potionSickness'
  );
  if (hasSickness) return false;

  // Filter to HP potions only for auto-potion
  const hpPotionIndices = availablePotions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.potionType === 'hp');
  if (hpPotionIndices.length === 0) return false;

  // Smart selection: pick weakest HP potion whose healAmount >= deficit
  const deficit = Math.floor(state.combatantAMaxHp * (threshold / 100)) - state.combatantAHp;
  let chosenIndex = -1;

  // Sort candidates by healAmount ascending for weakest-sufficient selection
  hpPotionIndices.sort((a, b) => a.p.healAmount - b.p.healAmount);

  for (const { i, p } of hpPotionIndices) {
    if (p.healAmount >= deficit) {
      chosenIndex = i;
      break;
    }
  }

  // If none fully covers the deficit, pick the strongest available HP potion
  if (chosenIndex === -1) {
    chosenIndex = hpPotionIndices[hpPotionIndices.length - 1].i;
  }

  const potion = availablePotions[chosenIndex];
  const hpBefore = state.combatantAHp;
  state.combatantAHp = Math.min(state.combatantAMaxHp, state.combatantAHp + potion.healAmount);
  const actualHeal = state.combatantAHp - hpBefore;

  // Remove used potion from pool
  availablePotions.splice(chosenIndex, 1);

  // Record consumption
  potionsConsumed.push({
    templateId: potion.templateId,
    name: potion.name,
    healAmount: actualHeal,
    round: state.round,
  });

  // Apply Potion Sickness cooldown
  const sicknessEffect: ActiveEffect = {
    name: 'Potion Sickness',
    target: 'combatantA',
    stat: 'potionSickness',
    modifier: 0,
    remainingRounds: POTION_CONSTANTS.AUTO_POTION_SICKNESS_DURATION,
  };
  state.activeEffects.push(sicknessEffect);

  // Log the potion use
  state.log.push({
    round: state.round,
    actor: 'combatantA',
    actorName: '',
    action: 'potion',
    spellName: potion.name,
    healAmount: actualHeal,
    message: `You drink a ${potion.name}! +${actualHeal} HP`,
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: POTION_CONSTANTS.AUTO_POTION_SICKNESS_DURATION,
      target: 'combatantA',
    }],
    ...hpSnapshot(state),
  });

  return true;
}

/**
 * Run a complete combat encounter between two combatants.
 * Pure function — no side effects, fully deterministic given same random seed.
 */
export function runCombat(combatantA: Combatant, combatantB: Combatant, options?: CombatOptions): CombatResult {
  const availablePotions = options?.potions ? [...options.potions] : [];
  const threshold = options?.autoPotionThreshold ?? 0;
  const potionsConsumed: PotionConsumed[] = [];

  const state: CombatState = {
    combatantAHp: combatantA.stats.hp,
    combatantAMaxHp: combatantA.stats.maxHp,
    combatantBHp: combatantB.stats.hp,
    combatantBMaxHp: combatantB.stats.maxHp,
    round: 0,
    log: [],
    outcome: null,
    activeEffects: [],
  };

  const names = { combatantA: combatantA.name, combatantB: combatantB.name };

  const initA = rollInitiative(combatantA.stats.speed);
  const initB = rollInitiative(combatantB.stats.speed);
  const aGoesFirst = initA >= initB;

  const firstName = aGoesFirst ? combatantA.name : combatantB.name;
  state.log.push({
    round: 0,
    actor: aGoesFirst ? 'combatantA' : 'combatantB',
    actorName: firstName,
    action: 'attack',
    roll: initA,
    message: `Combat begins! Initiative: ${combatantA.name} ${initA}, ${combatantB.name} ${initB}`,
    ...hpSnapshot(state),
  });

  while (state.round < MAX_ROUNDS && state.outcome === null) {
    state.round++;

    const effectiveA = getEffectiveStats(combatantA.stats, state.activeEffects, 'combatantA');
    const effectiveB = getEffectiveStats(combatantB.stats, state.activeEffects, 'combatantB');

    if (aGoesFirst) {
      const usedPotion = tryAutoPotion(state, availablePotions, potionsConsumed, threshold);
      if (!usedPotion) {
        executeAttack(state, 'combatantA', effectiveA, effectiveB, combatantA, combatantB);
      }
      if (state.outcome) break;
      executeAttack(state, 'combatantB', effectiveB, effectiveA, combatantB, combatantA);
    } else {
      executeAttack(state, 'combatantB', effectiveB, effectiveA, combatantB, combatantA);
      if (state.outcome) break;
      const usedPotion = tryAutoPotion(state, availablePotions, potionsConsumed, threshold);
      if (!usedPotion) {
        executeAttack(state, 'combatantA', effectiveA, effectiveB, combatantA, combatantB);
      }
    }

    tickEffects(state, names);
  }

  if (state.outcome === null) {
    // Both alive at round limit = draw; one dead = defeat
    const bothAlive = state.combatantAHp > 0 && state.combatantBHp > 0;
    state.outcome = bothAlive ? 'draw' : 'defeat';
    state.log.push({
      round: state.round,
      actor: 'combatantB',
      actorName: combatantB.name,
      action: 'attack',
      message: bothAlive
        ? 'Combat timed out. The fight ends in a draw.'
        : 'Combat timed out. The fight ends in exhaustion.',
      ...hpSnapshot(state),
    });
  }

  return {
    outcome: state.outcome,
    log: state.log,
    combatantAMaxHp: state.combatantAMaxHp,
    combatantBMaxHp: state.combatantBMaxHp,
    combatantAHpRemaining: Math.max(0, state.combatantAHp),
    combatantBHpRemaining: Math.max(0, state.combatantBHp),
    potionsConsumed,
  };
}

function executeAttack(
  state: CombatState,
  attackerKey: CombatActor,
  attackerStats: CombatantStats,
  defenderStats: CombatantStats,
  attacker: Combatant,
  defender: Combatant,
): void {
  // Check for spells first
  const spellAction = attacker.spells?.find((s) => s.round === state.round);
  if (spellAction) {
    executeSpell(state, spellAction, attackerKey, attackerStats, defenderStats, attacker.name, defender.name);
    return;
  }

  const attackRoll = rollD20();
  const hits = doesAttackHit(attackRoll, attackerStats.accuracy, defenderStats.dodge, defenderStats.evasion);

  if (!hits) {
    const wouldHitWithoutAvoidance = doesAttackHit(attackRoll, attackerStats.accuracy, 0, 0);

    state.log.push({
      round: state.round,
      actor: attackerKey,
      actorName: attacker.name,
      action: 'attack',
      roll: attackRoll,
      evaded: wouldHitWithoutAvoidance,
      attackModifier: attackerStats.attack,
      accuracyModifier: attackerStats.accuracy,
      targetDodge: defenderStats.dodge,
      targetEvasion: defenderStats.evasion,
      message: wouldHitWithoutAvoidance
        ? `${defender.name} avoids ${attacker.name}'s attack!`
        : `${attacker.name} swings at ${defender.name} but misses!`,
      ...hpSnapshot(state),
    });
    return;
  }

  const rawDamage = rollDamage(attackerStats.damageMin, attackerStats.damageMax);
  const crit = isCriticalHit(attackerStats.critChance ?? 0);
  const effectiveDefence = attackerStats.damageType === 'magic' ? defenderStats.magicDefence : defenderStats.defence;
  const { damage: finalDamage, actualMultiplier } = calculateFinalDamage(rawDamage, effectiveDefence, crit, attackerStats.critDamage ?? 0);
  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));

  applyDamage(state, opponent(attackerKey), finalDamage);

  const critText = crit ? ' CRITICAL HIT!' : '';
  state.log.push({
    round: state.round,
    actor: attackerKey,
    actorName: attacker.name,
    action: 'attack',
    roll: attackRoll,
    damage: finalDamage,
    attackModifier: attackerStats.attack,
    accuracyModifier: attackerStats.accuracy,
    targetDodge: defenderStats.dodge,
    targetEvasion: defenderStats.evasion,
    targetDefence: attackerStats.damageType === 'magic' ? undefined : defenderStats.defence,
    targetMagicDefence: attackerStats.damageType === 'magic' ? defenderStats.magicDefence : undefined,
    rawDamage,
    armorReduction: attackerStats.damageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: attackerStats.damageType === 'magic' ? armorReduction : undefined,
    isCritical: crit,
    ...(crit ? { critMultiplier: actualMultiplier } : {}),
    message: `${attacker.name} strikes ${defender.name} for ${finalDamage} damage!${critText}`,
    ...hpSnapshot(state),
  });

  const defenderHp = getHp(state, opponent(attackerKey));
  if (defenderHp <= 0) {
    state.outcome = attackerKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push({
      round: state.round,
      actor: attackerKey,
      actorName: attacker.name,
      action: 'attack',
      message: `${defender.name} falls defeated!`,
      ...hpSnapshot(state),
    });
  }
}

function executeSpell(
  state: CombatState,
  spell: SpellAction,
  casterKey: CombatActor,
  casterStats: CombatantStats,
  targetStats: CombatantStats,
  casterName: string,
  targetName: string,
): void {
  let finalDamage = 0;
  let healAmount = 0;
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  if (spell.damage) {
    const reduction = calculateDefenceReduction(targetStats.magicDefence);
    const mitigated = Math.floor(spell.damage * reduction);
    finalDamage = Math.max(1, spell.damage - mitigated);
    applyDamage(state, opponent(casterKey), finalDamage);
  }

  if (spell.heal) {
    healAmount = applyHeal(state, casterKey, spell.heal);
  }

  if (spell.effects) {
    for (const effect of spell.effects) {
      const target = effect.modifier >= 0 ? casterKey : opponent(casterKey);
      state.activeEffects.push({
        name: spell.name,
        target,
        stat: effect.stat,
        modifier: effect.modifier,
        remainingRounds: effect.duration,
      });
      appliedEffects.push({
        stat: effect.stat,
        modifier: effect.modifier,
        duration: effect.duration,
        target,
      });
    }
  }

  const parts: string[] = [];
  parts.push(`${casterName} casts ${spell.name}`);

  if (finalDamage > 0) {
    parts[0] += ` for ${finalDamage} damage`;
  }
  if (healAmount > 0) {
    if (finalDamage > 0) {
      parts.push(`Heals ${healAmount} HP`);
    } else {
      parts[0] += `! +${healAmount} HP`;
    }
  }
  if (appliedEffects.length > 0 && finalDamage === 0 && healAmount === 0) {
    const effectDesc = appliedEffects.map(e =>
      `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier}, ${e.duration} rds`
    ).join('; ');
    parts[0] += `! (${effectDesc})`;
  }

  const message = parts.length > 1 ? parts[0] + '! ' + parts.slice(1).join('. ') + '.' : parts[0] + '!';

  state.log.push({
    round: state.round,
    actor: casterKey,
    actorName: casterName,
    action: 'spell',
    damage: finalDamage > 0 ? finalDamage : undefined,
    rawDamage: spell.damage,
    targetMagicDefence: spell.damage ? targetStats.magicDefence : undefined,
    magicDefenceReduction: spell.damage ? Math.floor(spell.damage * calculateDefenceReduction(targetStats.magicDefence)) : undefined,
    spellName: spell.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects.length > 0 ? appliedEffects : undefined,
    message,
    ...hpSnapshot(state),
  });

  const defenderHp = getHp(state, opponent(casterKey));
  const casterHp = getHp(state, casterKey);

  if (defenderHp <= 0) {
    state.outcome = casterKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push({
      round: state.round,
      actor: casterKey,
      actorName: casterName,
      action: 'spell',
      message: `${targetName} falls defeated!`,
      ...hpSnapshot(state),
    });
  } else if (casterHp <= 0) {
    state.outcome = casterKey === 'combatantA' ? 'defeat' : 'victory';
    state.log.push({
      round: state.round,
      actor: opponent(casterKey),
      actorName: targetName,
      action: 'spell',
      message: `${casterName} has been knocked out!`,
      ...hpSnapshot(state),
    });
  }
}
