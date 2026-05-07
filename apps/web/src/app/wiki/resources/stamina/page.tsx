import type { Metadata } from 'next';
import { STAMINA_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Stamina',
  description:
    'Max stamina pool, combat regen per round, passive regen, and rest healing.',
};

export default function StaminaPage() {
  return (
    <WikiSection
      title="Stamina"
      summary="Stamina fuels physical combat actions. It scales with the average of melee, ranged, and evasion levels. The engine supports equipment stamina bonuses, but current equipment stat pools do not add stamina."
      related={[
        { label: 'Health', href: '/wiki/resources/health' },
        { label: 'Mana', href: '/wiki/resources/mana' },
        { label: 'Actions & Abilities', href: '/wiki/combat/actions' },
      ]}
    >
      <h2>Maximum Stamina</h2>
      <FormulaBlock>
        <Var>avgLevel</Var> <Op>=</Op> floor<Op>(</Op>
        <Op>(</Op><Var>meleeLevel</Var> <Op>+</Op> <Var>rangedLevel</Var>{' '}
        <Op>+</Op> <Var>evasionLevel</Var><Op>)</Op> <Op>/</Op>{' '}
        <Const>3</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>maxStamina</Out> <Op>=</Op>{' '}
        <Const>{STAMINA_CONSTANTS.BASE_POOL}</Const> <Op>+</Op>{' '}
        <Var>avgLevel</Var> <Op>*</Op>{' '}
        <Const>{STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL}</Const> <Op>+</Op>{' '}
        <Var>equipmentStaminaBonus</Var>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_POOL', value: STAMINA_CONSTANTS.BASE_POOL, description: 'Base stamina pool for all players' },
          { name: 'POOL_PER_SKILL_LEVEL', value: STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL, description: 'Additional stamina per average combat skill level' },
        ]}
      />

      <h2>Combat Regen (per Round)</h2>
      <p>
        Stamina regenerates each combat round. The rate scales with the average
        of melee, ranged, and evasion levels.
      </p>
      <FormulaBlock>
        <Out>regenPerRound</Out> <Op>=</Op>{' '}
        <Const>{STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND}</Const> <Op>+</Op>{' '}
        <Var>avgLevel</Var> <Op>*</Op>{' '}
        <Const>{STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL}</Const>
      </FormulaBlock>

      <h2>Passive Regen (Out of Combat)</h2>
      <p>
        Outside combat, stamina regenerates continuously and scales with the
        same average level used for the stamina pool.
      </p>
      <FormulaBlock>
        <Out>regenPerSecond</Out> <Op>=</Op>{' '}
        <Const>{STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SECOND}</Const> <Op>+</Op>{' '}
        <Var>avgLevel</Var> <Op>*</Op>{' '}
        <Const>{STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SKILL_LEVEL}</Const>
      </FormulaBlock>

      <h2>Rest Healing</h2>
      <p>
        Resting restores stamina per turn spent, also scaling with the average
        level.
      </p>
      <FormulaBlock>
        <Out>restHealPerTurn</Out> <Op>=</Op>{' '}
        <Const>{STAMINA_CONSTANTS.REST_HEAL_PER_TURN}</Const> <Op>+</Op>{' '}
        <Var>avgLevel</Var> <Op>*</Op>{' '}
        <Const>{STAMINA_CONSTANTS.REST_HEAL_PER_SKILL_LEVEL}</Const>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_REGEN_PER_ROUND', value: STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND, description: 'Base stamina regen per combat round' },
          { name: 'REGEN_PER_SKILL_LEVEL', value: STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL, description: 'Additional regen per average combat skill level' },
          { name: 'PASSIVE_REGEN_PER_SECOND', value: STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SECOND, description: 'Out-of-combat regen rate per second' },
          { name: 'PASSIVE_REGEN_PER_SKILL_LEVEL', value: STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SKILL_LEVEL, description: 'Additional passive regen per average level' },
          { name: 'REST_HEAL_PER_TURN', value: STAMINA_CONSTANTS.REST_HEAL_PER_TURN, description: 'Stamina healed per turn when resting' },
          { name: 'REST_HEAL_PER_SKILL_LEVEL', value: STAMINA_CONSTANTS.REST_HEAL_PER_SKILL_LEVEL, description: 'Additional rest healing per average level' },
        ]}
      />
    </WikiSection>
  );
}
