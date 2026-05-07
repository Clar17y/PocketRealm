import type { Metadata } from 'next';
import { HP_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Health System',
  description:
    'Max HP calculation, passive regeneration, rest healing, knockout recovery, and low-HP warning threshold.',
};

export default function HealthPage() {
  return (
    <WikiSection
      title="Health System"
      summary="Health determines how much damage a player can take before being knocked out. It scales with the Vitality attribute and equipment health bonuses."
      related={[
        { label: 'Stamina', href: '/wiki/resources/stamina' },
        { label: 'Mana', href: '/wiki/resources/mana' },
        { label: 'Flee Mechanics', href: '/wiki/resources/flee' },
      ]}
    >
      <h2>Maximum HP</h2>
      <FormulaBlock>
        <Out>maxHP</Out> <Op>=</Op> <Const>{HP_CONSTANTS.BASE_HP}</Const>{' '}
        <Op>+</Op> <Var>vitalityLevel</Var> <Op>*</Op>{' '}
        <Const>{HP_CONSTANTS.HP_PER_VITALITY}</Const> <Op>+</Op>{' '}
        <Var>equipmentHealthBonus</Var>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_HP', value: HP_CONSTANTS.BASE_HP, description: 'Base HP for all players' },
          { name: 'HP_PER_VITALITY', value: HP_CONSTANTS.HP_PER_VITALITY, description: 'Additional HP per Vitality level' },
        ]}
      />

      <h2>Passive Regeneration</h2>
      <p>
        HP regenerates passively while out of combat. Regeneration is paused
        during the knockout recovery state.
      </p>
      <FormulaBlock>
        <Out>regenPerSecond</Out> <Op>=</Op>{' '}
        <Const>{HP_CONSTANTS.BASE_PASSIVE_REGEN}</Const> <Op>+</Op>{' '}
        <Var>vitalityLevel</Var> <Op>*</Op>{' '}
        <Const>{HP_CONSTANTS.PASSIVE_REGEN_PER_VITALITY}</Const>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_PASSIVE_REGEN', value: HP_CONSTANTS.BASE_PASSIVE_REGEN, description: 'Base passive HP regen per second' },
          { name: 'PASSIVE_REGEN_PER_VITALITY', value: HP_CONSTANTS.PASSIVE_REGEN_PER_VITALITY, description: 'Additional regen per Vitality level (per second)' },
        ]}
      />

      <h2>Rest Healing</h2>
      <p>
        Players can spend turns to rest and heal HP. The amount healed per turn
        scales with Vitality.
      </p>
      <FormulaBlock>
        <Out>healPerTurn</Out> <Op>=</Op>{' '}
        <Const>{HP_CONSTANTS.BASE_REST_HEAL}</Const> <Op>+</Op>{' '}
        <Var>vitalityLevel</Var> <Op>*</Op>{' '}
        <Const>{HP_CONSTANTS.REST_HEAL_PER_VITALITY}</Const>
      </FormulaBlock>

      <h2>Knockout &amp; Recovery</h2>
      <p>
        When HP reaches 0, the player enters a knockout recovery state. Passive
        regen is disabled during recovery. Exiting recovery costs turns and
        restores a percentage of max HP.
      </p>
      <FormulaBlock>
        <Out>recoveryCost</Out> <Op>=</Op> <Var>maxHP</Var> <Op>*</Op>{' '}
        <Const>{HP_CONSTANTS.RECOVERY_TURNS_PER_MAX_HP}</Const>{' '}
        <Comment>turns</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>exitHP</Out> <Op>=</Op> <Var>maxHP</Var> <Op>*</Op>{' '}
        <Const>{HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT}</Const>{' '}
        <Comment>({(HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT * 100).toFixed(0)}% of max HP)</Comment>
      </FormulaBlock>

      <h2>Low HP Warning</h2>
      <p>
        A warning indicator is shown when current HP drops below{' '}
        <strong>{(HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD * 100).toFixed(0)}%</strong> of
        max HP.
      </p>
    </WikiSection>
  );
}
