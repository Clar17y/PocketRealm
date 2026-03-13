import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  BASE_ACTION_DEFINITIONS,
  ALWAYS_AVAILABLE_ACTION_IDS,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS } from '@pocketrealm/shared';
import type { ActionDefinition } from '@pocketrealm/shared';

export const metadata: Metadata = {
  title: 'Combat Actions - Pocketrealm Wiki',
  description:
    'Every combat action: damage multipliers, accuracy modifiers, resource costs, scaling stats, and special properties.',
};

const combatRelated = [
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
  { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
];

type ActionGroup = { label: string; actions: ActionDefinition[] };

function groupActions(): ActionGroup[] {
  const allActions = Object.values(BASE_ACTION_DEFINITIONS);

  const baseOffensive: ActionDefinition[] = [];
  const baseDefensive: ActionDefinition[] = [];
  const baseSupportive: ActionDefinition[] = [];
  const melee: ActionDefinition[] = [];
  const ranged: ActionDefinition[] = [];
  const magic: ActionDefinition[] = [];
  const crossType: ActionDefinition[] = [];
  const survival: ActionDefinition[] = [];

  for (const action of allActions) {
    const isBase = ALWAYS_AVAILABLE_ACTION_IDS.has(action.id);
    if (isBase) {
      if (action.category === 'offensive') baseOffensive.push(action);
      else if (action.category === 'defensive') baseDefensive.push(action);
      else baseSupportive.push(action);
      continue;
    }

    const scaling = action.scalingStat ?? 'weapon';
    if (scaling === 'weapon') {
      survival.push(action);
    } else if (scaling === 'melee') {
      // Distinguish cross-type (uses mana + stamina, or magic damage type on melee)
      const isCross = (action.cost.mana > 0 && action.cost.stamina > 0)
        || (action.damageType === 'magic' && scaling === 'melee')
        || action.id === 'rending_slash';
      if (isCross) crossType.push(action);
      else melee.push(action);
    } else if (scaling === 'ranged') {
      const isCross = (action.cost.mana > 0 && action.cost.stamina > 0)
        || action.id === 'barbed_arrow'
        || action.id === 'flame_arrow';
      if (isCross) crossType.push(action);
      else ranged.push(action);
    } else if (scaling === 'magic') {
      const isCross = action.cost.stamina > 0 || action.damageType === 'physical';
      if (isCross) crossType.push(action);
      else magic.push(action);
    }
  }

  return [
    { label: 'Base Offensive', actions: baseOffensive },
    { label: 'Base Defensive', actions: baseDefensive },
    { label: 'Base Supportive', actions: baseSupportive },
    { label: 'Melee Talents', actions: melee },
    { label: 'Ranged Talents', actions: ranged },
    { label: 'Magic Talents', actions: magic },
    { label: 'Cross-Type Talents', actions: crossType },
    { label: 'Survival Talents', actions: survival },
  ].filter((g) => g.actions.length > 0);
}

function formatCost(action: ActionDefinition): string {
  const parts: string[] = [];
  if (action.cost.stamina > 0) parts.push(`${action.cost.stamina} sta`);
  if (action.cost.mana > 0) parts.push(`${action.cost.mana} mana`);
  return parts.length > 0 ? parts.join(' + ') : 'Free';
}

function formatSpecial(action: ActionDefinition): string {
  const tags: string[] = [];
  if (action.isChanneling) tags.push('Channeling');
  if (action.avoidsPhysical) tags.push('Avoids physical');
  if (action.resistsMagic) tags.push('Resists magic');
  if (action.alwaysHits) tags.push('Always hits');
  if (action.damageType === 'magic') tags.push('Magic damage');
  if (action.defenceReduction) tags.push(`-${action.defenceReduction}% def`);
  if (action.lifeLeechPercent) tags.push(`${action.lifeLeechPercent}% leech`);
  if (action.healPercent) tags.push(`Heal ${(action.healPercent * 100).toFixed(0)}% HP`);
  if (action.effect) tags.push(`Effect: ${action.effect.name}`);
  if (action.damageReductionPercent) tags.push(`-${(action.damageReductionPercent * 100).toFixed(0)}% dmg taken`);
  if (action.potionType) tags.push(`Potion: ${action.potionType}`);
  if (action.tauntDuration) tags.push(`Taunt ${action.tauntDuration}r`);
  return tags.join(', ') || '-';
}

function ActionTable({ actions }: { actions: ActionDefinition[] }) {
  return (
    <table className="wiki-table">
      <thead>
        <tr>
          <th>Action</th>
          <th>Dmg Multi</th>
          <th>Acc Mod</th>
          <th>Cost</th>
          <th>Scaling</th>
          <th>Special</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((a) => (
          <tr key={a.id}>
            <td>
              <strong>{a.name}</strong>
              <br />
              <small>{a.description}</small>
            </td>
            <td>{a.damageMultiplier != null ? `${a.damageMultiplier}x` : '-'}</td>
            <td>{a.accuracyModifier != null && a.accuracyModifier !== 0 ? `+${a.accuracyModifier}` : '-'}</td>
            <td>{formatCost(a)}</td>
            <td>{a.scalingStat ?? 'weapon'}</td>
            <td>{formatSpecial(a)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const groups = groupActions();

export default function ActionsPage() {
  return (
    <WikiSection
      title="Combat Actions"
      summary="Every action available during combat, grouped by unlock source. Base actions are always available; talent actions require skill point investment."
      related={combatRelated}
    >
      {groups.map((group) => (
        <section key={group.label}>
          <h2>{group.label}</h2>
          <ActionTable actions={group.actions} />
        </section>
      ))}

      <h2>Key Constants</h2>
      <ConstantsTable
        rows={[
          {
            name: 'CHANNELING_BONUS_DAMAGE',
            value: `${COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE}x`,
            description: 'Bonus damage multiplier when hitting a channeling target',
          },
          {
            name: 'MAX_ACTIVE_BUFFS',
            value: COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS,
            description: 'Maximum simultaneous buffs a combatant can have',
          },
          {
            name: 'POTION_SICKNESS_ROUNDS',
            value: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
            description: 'Rounds of potion sickness after using any potion',
          },
          {
            name: 'DEFEND_DAMAGE_REDUCTION',
            value: `${(COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION * 100).toFixed(0)}%`,
            description: 'Flat damage reduction when using Defend',
          },
        ]}
      />
    </WikiSection>
  );
}
