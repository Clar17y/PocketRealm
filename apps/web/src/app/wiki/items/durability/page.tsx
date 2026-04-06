import type { Metadata } from 'next';
import { DURABILITY_CONSTANTS, SELL_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Durability & Selling',
  description:
    'Equipment durability degradation, repair costs, broken penalties, and sell price formula.',
};

export default function DurabilityPage() {
  return (
    <WikiSection
      title="Durability & Selling"
      summary="Equipment degrades during combat and must be repaired. Broken items suffer stat penalties. Selling items is affected by rarity and durability."
      related={[
        { label: 'Rarity System', href: '/wiki/items/rarity' },
        { label: 'Inventory', href: '/wiki/items/inventory' },
        { label: 'Forge & Upgrades', href: '/wiki/items/forge' },
      ]}
    >
      <h2>Durability Degradation</h2>
      <p>
        Each hit landed or received in combat reduces equipped item durability
        by <strong>{DURABILITY_CONSTANTS.COMBAT_DEGRADATION}</strong> (
        {(DURABILITY_CONSTANTS.COMBAT_DEGRADATION * 100).toFixed(0)}% per hit).
      </p>

      <h2>Repair</h2>
      <h3>Repair Cost by Item Tier</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Cost (turns)</th>
            <th>Broken Cost</th>
          </tr>
        </thead>
        <tbody>
          {([1, 2, 3, 4, 5] as const).map((t) => {
            const base = DURABILITY_CONSTANTS.REPAIR_TURN_COST_BY_TIER[t];
            return (
              <tr key={t}>
                <td>T{t}</td>
                <td>{base}</td>
                <td>{Math.ceil(base * DURABILITY_CONSTANTS.BROKEN_REPAIR_MULTIPLIER)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Max Durability Decay by Rarity</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Max Decay per Repair</th>
          </tr>
        </thead>
        <tbody>
          {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
            <tr key={r}>
              <td className="capitalize">{r}</td>
              <td>1–{DURABILITY_CONSTANTS.REPAIR_MAX_DECAY_BY_RARITY[r]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Each repair reduces the item&apos;s maximum durability by a random
        amount based on rarity (legendary items always lose exactly 1). When
        maximum durability reaches <strong>0</strong>, the item is permanently
        destroyed.
      </p>

      <h2>Low Durability Warning</h2>
      <p>
        A warning appears when durability falls below{' '}
        <strong>{(DURABILITY_CONSTANTS.WARNING_THRESHOLD * 100).toFixed(0)}%</strong>.
      </p>

      <h2>Encounter Sites</h2>
      <p>
        Encounter site combat degrades durability the same way as open-world
        fights. Each hit you land wears your weapon, and each hit you take
        wears your armour. Equipment stats are locked at the start of each room,
        so even if an item reaches 0 durability mid-room its stat contributions
        are preserved until the room ends. The broken penalty applies from the
        next room onward.
      </p>

      <h2>Sell Price</h2>
      <FormulaBlock>
        <Out>sellPrice</Out> <Op>=</Op> <Var>baseSellPrice</Var> <Op>*</Op>{' '}
        <Var>rarityMultiplier</Var>
      </FormulaBlock>
      <FormulaBlock>
        <Comment>If durability ratio {'<'} {SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD}:</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>sellPrice</Out> <Op>=</Op> floor<Op>(</Op>
        <Var>sellPrice</Var> <Op>*</Op> <Var>durabilityRatio</Var>
        <Op>)</Op>{' '}
        <Comment>(minimum 1 gold)</Comment>
      </FormulaBlock>

      <h3>Rarity Multipliers</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Multiplier</th>
          </tr>
        </thead>
        <tbody>
          {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
            <tr key={r}>
              <td className="capitalize">{r}</td>
              <td>{SELL_CONSTANTS.RARITY_MULTIPLIERS[r]}x</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConstantsTable
        rows={[
          { name: 'DURABILITY_PENALTY_THRESHOLD', value: `${(SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD * 100).toFixed(0)}%`, description: 'Durability ratio below which sell price is reduced' },
        ]}
      />
    </WikiSection>
  );
}
