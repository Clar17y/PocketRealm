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
