import type { Metadata } from 'next';
import { MANA_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Mana',
  description:
    'Max mana pool, combat regen per round, passive regen, and rest healing.',
};

export default function ManaPage() {
  return (
    <WikiSection
      title="Mana"
      summary="Mana powers magical combat actions and spells. It scales with the Magic skill level. The engine supports equipment mana bonuses, but current equipment stat pools do not add mana."
      related={[
        { label: 'Health', href: '/wiki/resources/health' },
        { label: 'Stamina', href: '/wiki/resources/stamina' },
        { label: 'Actions & Abilities', href: '/wiki/combat/actions' },
      ]}
    >
      <h2>Maximum Mana</h2>
      <FormulaBlock>
        <Out>maxMana</Out> <Op>=</Op>{' '}
        <Const>{MANA_CONSTANTS.BASE_POOL}</Const> <Op>+</Op>{' '}
        <Var>magicLevel</Var> <Op>*</Op>{' '}
        <Const>{MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL}</Const> <Op>+</Op>{' '}
        <Var>equipmentManaBonus</Var>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_POOL', value: MANA_CONSTANTS.BASE_POOL, description: 'Base mana pool for all players' },
          { name: 'POOL_PER_MAGIC_LEVEL', value: MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL, description: 'Additional mana per Magic skill level' },
        ]}
      />

      <h2>Combat Regen (per Round)</h2>
      <p>
        Mana regenerates each combat round, scaling with Magic level.
      </p>
      <FormulaBlock>
        <Out>regenPerRound</Out> <Op>=</Op>{' '}
        <Const>{MANA_CONSTANTS.BASE_REGEN_PER_ROUND}</Const> <Op>+</Op>{' '}
        <Var>magicLevel</Var> <Op>*</Op>{' '}
        <Const>{MANA_CONSTANTS.REGEN_PER_MAGIC_LEVEL}</Const>
      </FormulaBlock>

      <h2>Passive Regen (Out of Combat)</h2>
      <p>
        Outside combat, mana regenerates continuously and scales with Magic
        level.
      </p>
      <FormulaBlock>
        <Out>regenPerSecond</Out> <Op>=</Op>{' '}
        <Const>{MANA_CONSTANTS.PASSIVE_REGEN_PER_SECOND}</Const> <Op>+</Op>{' '}
        <Var>magicLevel</Var> <Op>*</Op>{' '}
        <Const>{MANA_CONSTANTS.PASSIVE_REGEN_PER_MAGIC_LEVEL}</Const>
      </FormulaBlock>

      <h2>Rest Healing</h2>
      <p>
        Resting restores mana per turn spent, also scaling with Magic level.
      </p>
      <FormulaBlock>
        <Out>restHealPerTurn</Out> <Op>=</Op>{' '}
        <Const>{MANA_CONSTANTS.REST_HEAL_PER_TURN}</Const> <Op>+</Op>{' '}
        <Var>magicLevel</Var> <Op>*</Op>{' '}
        <Const>{MANA_CONSTANTS.REST_HEAL_PER_MAGIC_LEVEL}</Const>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_REGEN_PER_ROUND', value: MANA_CONSTANTS.BASE_REGEN_PER_ROUND, description: 'Base mana regen per combat round' },
          { name: 'REGEN_PER_MAGIC_LEVEL', value: MANA_CONSTANTS.REGEN_PER_MAGIC_LEVEL, description: 'Additional regen per Magic skill level' },
          { name: 'PASSIVE_REGEN_PER_SECOND', value: MANA_CONSTANTS.PASSIVE_REGEN_PER_SECOND, description: 'Out-of-combat regen rate per second' },
          { name: 'PASSIVE_REGEN_PER_MAGIC_LEVEL', value: MANA_CONSTANTS.PASSIVE_REGEN_PER_MAGIC_LEVEL, description: 'Additional passive regen per Magic skill level' },
          { name: 'REST_HEAL_PER_TURN', value: MANA_CONSTANTS.REST_HEAL_PER_TURN, description: 'Mana healed per turn when resting' },
          { name: 'REST_HEAL_PER_MAGIC_LEVEL', value: MANA_CONSTANTS.REST_HEAL_PER_MAGIC_LEVEL, description: 'Additional rest healing per Magic skill level' },
        ]}
      />
    </WikiSection>
  );
}
