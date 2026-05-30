import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { COMBAT_ACTION_CONSTANTS } from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import {
  formatCombatEffectDescription,
  formatCombatEffectModifier,
  formatCombatEffectStatLabel,
  formatRounds,
} from '@pocketrealm/shared/constants/combatEffectNames';
import type { ActionDefinition } from '@pocketrealm/shared';

const { Var, Out, Enemy, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Buffs & Debuffs - Pocketrealm Wiki',
  description:
    'How buffs, debuffs, damage-over-time, and healing-over-time effects work in combat.',
};

const combatRelated = [
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
  { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
];

function getActionsWithEffects(): ActionDefinition[] {
  return Object.values(BASE_ACTION_DEFINITIONS).filter((a) => a.effect != null);
}

const effectActions = getActionsWithEffects();
const buffActions = effectActions.filter((a) => a.effect && !a.effect.isDebuff);
const debuffActions = effectActions.filter((a) => a.effect?.isDebuff);
const dotActions = effectActions.filter((a) => a.effect?.damagePerRound || a.effect?.damagePerRoundPercent);
const hotActions = effectActions.filter((a) => a.effect?.healPerRound);

export default function BuffsDebuffsPage() {
  return (
    <WikiSection
      title="Buffs & Debuffs"
      summary="Combat effects modify stats, deal periodic damage, or heal over time. Understanding how they stack, snapshot, and expire is key to advanced combat strategies."
      related={combatRelated}
    >
      <h2>Effect Structure</h2>
      <p>Every buff or debuff has these core properties:</p>
      <ul>
        <li><strong>stat:</strong> the stat modified (attack, defence, evasion, accuracy, speed, etc.)</li>
        <li><strong>modifier:</strong> flat value added/subtracted; attack percent effects show as percentages</li>
        <li><strong>duration:</strong> rounds until the effect expires</li>
        <li><strong>isDebuff:</strong> if true, applied to the target; otherwise applied to self</li>
      </ul>
      <p>
        A combatant can have at most{' '}
        <strong>{COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS}</strong> active buffs
        simultaneously. Applying a new buff when at the cap replaces the oldest.
      </p>

      <h2>Damage over Time (DoT)</h2>
      <p>
        DoTs tick at the start of each round for their full duration. The damage
        is calculated when the DoT is <em>applied</em> (snapshotted), not when
        it ticks.
      </p>
      <FormulaBlock>
        <Out>dotTick</Out> <Op>=</Op> <Const>baseDamagePerRound</Const>{' '}
        <Op>+</Op> <Op>floor(</Op><Var>triggeringDamage</Var> <Op>&times;</Op>{' '}
        <Const>damagePerRoundPercent</Const> <Op>/</Op> <Const>100</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        DoT ticks are then reduced by the target&apos;s relevant defence stat.
        Physical DoTs (<code>dotDamageType: physical</code>) check defence;
        magic DoTs check magic defence. The same diminishing-returns formula
        applies:
      </p>
      <FormulaBlock>
        <Out>reducedTick</Out> <Op>=</Op> <Op>max(</Op><Const>1</Const><Op>,</Op>{' '}
        <Op>floor(</Op><Out>dotTick</Out> <Op>&times;</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op> <Enemy>defence</Enemy> <Op>/</Op>{' '}
        <Op>(</Op><Enemy>defence</Enemy> <Op>+</Op> <Const>100</Const><Op>)))</Op>
        <Op>)</Op>
      </FormulaBlock>

      <h2>Healing over Time (HoT)</h2>
      <p>
        HoTs work similarly but restore HP each round. They are not reduced by
        any defence stat.
      </p>
      <FormulaBlock>
        <Out>hotTick</Out> <Op>=</Op> <Const>healPerRound</Const>
        <Comment> {'//'} flat heal each round</Comment>
      </FormulaBlock>

      <h2>Potion Sickness</h2>
      <p>
        After using any potion (HP, stamina, mana, cleanse, or buff), the
        combatant receives <strong>Potion Sickness</strong> for{' '}
        {COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS} rounds, preventing
        further potion use until it expires.
      </p>

      <h2>Buff Actions</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Effect</th>
            <th>Stat</th>
            <th>Modifier</th>
            <th>Duration</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {buffActions.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.effect!.name}</td>
              <td>{formatCombatEffectStatLabel(a.effect!.stat)}</td>
              <td>
                {a.effect!.modifier === 0 ? '-' : formatCombatEffectModifier(a.effect!)}
              </td>
              <td>{formatRounds(a.effect!.duration)}</td>
              <td>{formatCombatEffectDescription(a.effect!)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Debuff Actions</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Effect</th>
            <th>Stat</th>
            <th>Modifier</th>
            <th>Duration</th>
            <th>DoT</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {debuffActions.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.effect!.name}</td>
              <td>{formatCombatEffectStatLabel(a.effect!.stat)}</td>
              <td>{a.effect!.modifier === 0 ? '-' : formatCombatEffectModifier(a.effect!)}</td>
              <td>{formatRounds(a.effect!.duration)}</td>
              <td>
                {a.effect!.damagePerRound || a.effect!.damagePerRoundPercent
                  ? formatCombatEffectDescription(a.effect!, { includeDuration: false })
                  : '-'}
              </td>
              <td>{formatCombatEffectDescription(a.effect!)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {dotActions.length > 0 && (
        <>
          <h2>DoT Summary</h2>
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Source Action</th>
                <th>DoT Name</th>
                <th>Base/Round</th>
                <th>% of Hit</th>
                <th>Type</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {dotActions.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.effect!.name}</td>
                  <td>{a.effect!.damagePerRound ? `${a.effect!.damagePerRound} damage` : '-'}</td>
                  <td>{a.effect!.damagePerRoundPercent ? `${a.effect!.damagePerRoundPercent}% of hit` : '-'}</td>
                  <td>{a.effect!.dotDamageType === 'magic' ? 'Magic' : 'Physical'}</td>
                  <td>{formatRounds(a.effect!.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {hotActions.length > 0 && (
        <>
          <h2>HoT Summary</h2>
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Source Action</th>
                <th>Effect Name</th>
                <th>Heal/Round</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {hotActions.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.effect!.name}</td>
                  <td>{a.effect!.healPerRound} HP</td>
                  <td>{formatRounds(a.effect!.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'MAX_ACTIVE_BUFFS',
            value: COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS,
            description: 'Maximum simultaneous buffs per combatant',
          },
          {
            name: 'POTION_SICKNESS_ROUNDS',
            value: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
            description: 'Rounds of potion sickness after any potion use',
          },
        ]}
      />
    </WikiSection>
  );
}
