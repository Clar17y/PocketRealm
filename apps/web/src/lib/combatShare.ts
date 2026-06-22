import type { ExpeditionRoundLog, PlayerRoundActionEntry } from '@pocketrealm/shared';

export interface ShareCombatLogEntry {
  round: number;
  actor: 'combatantA' | 'combatantB';
  actorName?: string;
  roll?: number;
  damage?: number;
  evaded?: boolean;
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
  combatantAHpAfter?: number;
  combatantBHpAfter?: number;
}

export interface ShareCombatRewards {
  xp: number;
  skillXpGrants?: Array<{
    skillType: string;
    xpAfterEfficiency: number;
  }>;
  loot: Array<{ itemTemplateId: string; quantity: number; itemName?: string | null }>;
}

export interface CombatShareInput {
  outcome: string;
  log: ShareCombatLogEntry[];
  rewards: ShareCombatRewards;
  playerMaxHp?: number;
  mobMaxHp?: number;
  mobName?: string;
  zoneName?: string;
  createdAt?: string;
}

export interface EncounterSiteShareInput {
  outcome: string;
  rounds: unknown[];
  rewards?: {
    xp?: number;
    skillXpGrants?: Array<{
      skillType: string;
      xpAfterEfficiency: number;
    }>;
    loot?: Array<{ itemTemplateId: string; quantity: number; itemName?: string | null }>;
  } | null;
  siteName?: string | null;
  zoneName?: string | null;
  room?: number | null;
  totalRooms?: number | null;
  createdAt?: string;
}

function hpWithMax(current: number | undefined, max: number | undefined): string {
  if (current === undefined) return '-';
  if (max === undefined) return `${current}`;
  return `${current}/${max}`;
}

export function resolvePlayerMaxHp(log: ShareCombatLogEntry[], explicit?: number): number | undefined {
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  const values = log.map((entry) => entry.combatantAHpAfter).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

export function resolveMobMaxHp(log: ShareCombatLogEntry[], explicit?: number): number | undefined {
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  const values = log.map((entry) => entry.combatantBHpAfter).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

export function formatCombatShareText(input: CombatShareInput): string {
  const log = input.log ?? [];
  const playerMaxHp = resolvePlayerMaxHp(log, input.playerMaxHp);
  const mobMaxHp = resolveMobMaxHp(log, input.mobMaxHp);

  const lines: string[] = [];
  lines.push('PocketRealm Combat Log');
  lines.push(`Outcome: ${input.outcome}`);
  if (input.mobName) lines.push(`Mob: ${input.mobName}`);
  if (input.zoneName) lines.push(`Zone: ${input.zoneName}`);
  if (input.createdAt) lines.push(`Time: ${input.createdAt}`);
  lines.push('');
  lines.push('Rounds');

  for (const entry of log) {
    const actor = entry.actor === 'combatantA' ? (entry.actorName ?? 'You') : (entry.actorName ?? 'Mob');
    const dmg = entry.damage !== undefined ? ` ${entry.damage} dmg` : '';
    const isExplicitMiss = (
      entry.hitChance !== undefined &&
      entry.hitRollValue !== undefined &&
      entry.attackerHitScore !== undefined &&
      entry.defenderAvoidScore !== undefined &&
      entry.damage === undefined &&
      entry.hitRollValue >= entry.hitChance
    );
    const status = entry.evaded ? ' Dodged' : (isExplicitMiss ? ' Miss' : '');
    lines.push(
      `R${entry.round} ${actor}${dmg}${status} | You ${hpWithMax(entry.combatantAHpAfter, playerMaxHp)} | Mob ${hpWithMax(entry.combatantBHpAfter, mobMaxHp)}`
    );
  }

  lines.push('');
  lines.push('Rewards');
  lines.push(`XP: ${input.rewards.xp}`);

  for (const grant of input.rewards.skillXpGrants ?? []) {
    lines.push(`${grant.skillType}: +${grant.xpAfterEfficiency} XP`);
  }

  if (input.rewards.loot.length > 0) {
    lines.push('Loot:');
    for (const drop of input.rewards.loot) {
      const name = drop.itemName?.trim() || drop.itemTemplateId;
      lines.push(`- ${name}${drop.quantity > 1 ? ` x${drop.quantity}` : ''}`);
    }
  }

  return lines.join('\n');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExpeditionRoundLog(value: unknown): value is ExpeditionRoundLog {
  return isObject(value) && isObject(value.phases);
}

function extractRoundLog(value: unknown): ExpeditionRoundLog | null {
  if (isExpeditionRoundLog(value)) return value;
  if (isObject(value) && isExpeditionRoundLog(value.log)) return value.log;
  return null;
}

function formatPlayerRoundAction(round: number, attack: PlayerRoundActionEntry): string[] {
  if (attack.entryType === 'exhausted') {
    return [`R${round} ${attack.username}: ${attack.intendedActionLabel} -> ${attack.fallbackActionLabel} (exhausted)`];
  }

  if (attack.entryType === 'defensive') {
    return [`R${round} ${attack.username}: ${attack.actionLabel}`];
  }

  const target = attack.targetMobName ? ` -> ${attack.targetMobName}` : '';
  const outcome = attack.hit
    ? `${attack.crit ? 'CRIT' : 'HIT'}${attack.totalDamage !== undefined ? ` ${attack.totalDamage} dmg` : ''}`
    : 'MISS';
  const roll = attack.damageRoll !== undefined ? ` (roll ${attack.damageRoll} raw)` : '';
  const lines = [`R${round} ${attack.username}${target}: ${outcome}${roll}`];

  for (const [index, cascade] of (attack.splashCascade ?? []).entries()) {
    const cascadeOutcome = cascade.hit
      ? `${cascade.crit ? 'CRIT' : 'HIT'}${cascade.totalDamage !== undefined ? ` ${cascade.totalDamage} dmg` : ''}`
      : 'MISS';
    const cascadeRoll = cascade.damageRoll !== undefined ? ` (roll ${cascade.damageRoll} raw)` : '';
    lines.push(`R${round} Splash ${index + 1} -> ${cascade.targetMobName}: ${cascadeOutcome}${cascadeRoll}`);
  }

  return lines;
}

export function formatEncounterSiteShareText(input: EncounterSiteShareInput): string {
  const roundLogs = input.rounds.map(extractRoundLog).filter((log): log is ExpeditionRoundLog => log !== null);

  const lines: string[] = [];
  lines.push('PocketRealm Encounter Site Combat Log');
  lines.push(`Outcome: ${input.outcome}`);
  if (input.siteName) lines.push(`Site: ${input.siteName}`);
  if (input.zoneName) lines.push(`Zone: ${input.zoneName}`);
  if (input.room !== undefined && input.room !== null) {
    lines.push(input.totalRooms ? `Room: ${input.room}/${input.totalRooms}` : `Room: ${input.room}`);
  }
  if (input.createdAt) lines.push(`Time: ${input.createdAt}`);
  lines.push('');
  lines.push('Rounds');

  for (const log of roundLogs) {
    for (const attack of log.phases.playerAttacks) {
      lines.push(...formatPlayerRoundAction(log.round, attack));
    }

    for (const mobAction of log.phases.mobActions) {
      for (const target of mobAction.targets) {
        const outcome = target.blocked
          ? 'BLOCKED'
          : target.dodged
            ? 'DODGED'
            : `${target.damageTaken} dmg${target.knockedOut ? ' KO' : ''}`;
        const roll = target.damageRoll !== undefined ? ` (roll ${target.damageRoll} raw)` : '';
        lines.push(`R${log.round} ${mobAction.mobName} -> ${target.username}: ${outcome}${roll}`);
      }
    }

    for (const healing of log.phases.healing) {
      lines.push(`R${log.round} ${healing.username} -> ${healing.targetUsername}: +${healing.amountHealed} HP`);
    }

    for (const tick of log.phases.effectTicks) {
      lines.push(`R${log.round} ${tick.targetName}: ${tick.damage} ${tick.damageType} damage from ${tick.effectName}`);
    }
  }

  lines.push('');
  lines.push('Rewards');
  lines.push(`XP: ${input.rewards?.xp ?? 0}`);

  for (const grant of input.rewards?.skillXpGrants ?? []) {
    lines.push(`${grant.skillType}: +${grant.xpAfterEfficiency} XP`);
  }

  const loot = input.rewards?.loot ?? [];
  if (loot.length > 0) {
    lines.push('Loot:');
    for (const drop of loot) {
      const name = drop.itemName?.trim() || drop.itemTemplateId;
      lines.push(`- ${name}${drop.quantity > 1 ? ` x${drop.quantity}` : ''}`);
    }
  }

  return lines.join('\n');
}
