import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { getAllMobPrefixes, NO_PREFIX_WEIGHT } from '@pocketrealm/shared';

export const metadata: Metadata = {
  title: 'Mob Prefixes - Pocketrealm Wiki',
  description:
    'How mob prefix variants work: stat multipliers, XP/drop bonuses, spell templates, and weighted random selection.',
};

const combatRelated = [
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
];

const prefixes = getAllMobPrefixes();
const totalWeight = prefixes.reduce((sum, p) => sum + p.weight, 0) + NO_PREFIX_WEIGHT;

function pct(weight: number): string {
  return ((weight / totalWeight) * 100).toFixed(1);
}

function mult(val: number | undefined): string {
  if (val == null) return '1.0x';
  return `${val}x`;
}

export default function MobPrefixesPage() {
  return (
    <WikiSection
      title="Mob Prefixes"
      summary="Every mob encounter rolls a weighted prefix that modifies the base creature's stats, XP, and drop rates. Most encounters are unprefixed, but variant mobs offer greater challenge and reward."
      related={combatRelated}
    >
      <h2>Weighted Selection</h2>
      <p>
        When a mob spawns, a weighted random roll determines its prefix. The
        &quot;no prefix&quot; outcome has a weight of{' '}
        <strong>{NO_PREFIX_WEIGHT}</strong>, making unprefixed mobs the most
        common ({pct(NO_PREFIX_WEIGHT)}% chance). Rarer prefixes like Ancient
        and Spectral appear much less frequently.
      </p>

      <h2>Prefix Table</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="wiki-table">
          <thead>
            <tr>
              <th>Prefix</th>
              <th>Weight</th>
              <th>Chance</th>
              <th>HP</th>
              <th>Accuracy</th>
              <th>Defence</th>
              <th>Magic Def</th>
              <th>Evasion</th>
              <th>Damage</th>
              <th>XP</th>
              <th>Drops</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><em>(none)</em></td>
              <td>{NO_PREFIX_WEIGHT}</td>
              <td>{pct(NO_PREFIX_WEIGHT)}%</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
              <td>1.0x</td>
            </tr>
            {prefixes.map((p) => (
              <tr key={p.key}>
                <td><strong>{p.displayName}</strong></td>
                <td>{p.weight}</td>
                <td>{pct(p.weight)}%</td>
                <td>{mult(p.statMultipliers.hp)}</td>
                <td>{mult(p.statMultipliers.accuracy)}</td>
                <td>{mult(p.statMultipliers.defence)}</td>
                <td>{mult(p.statMultipliers.magicDefence)}</td>
                <td>{mult(p.statMultipliers.evasion)}</td>
                <td>{mult(p.statMultipliers.damageMin)}</td>
                <td>{p.xpMultiplier}x</td>
                <td>{p.dropChanceMultiplier}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Prefix Descriptions</h2>
      <ul>
        {prefixes.map((p) => (
          <li key={p.key}>
            <strong>{p.displayName}</strong> -- {p.description}
          </li>
        ))}
      </ul>

      <h2>Spellcasting Prefixes</h2>
      <p>
        Some prefixes grant the mob a spell template, giving it periodic special
        attacks on fixed intervals:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Prefix</th>
            <th>Spell Name</th>
            <th>Start Round</th>
            <th>Interval</th>
            <th>Damage Formula</th>
            <th>Multiplier</th>
          </tr>
        </thead>
        <tbody>
          {prefixes
            .filter((p) => p.spellTemplate)
            .map((p) => (
              <tr key={p.key}>
                <td>{p.displayName}</td>
                <td>{p.spellTemplate!.actionName}</td>
                <td>Round {p.spellTemplate!.startRound}</td>
                <td>Every {p.spellTemplate!.interval} rounds</td>
                <td>{p.spellTemplate!.damageFormula}</td>
                <td>{p.spellTemplate!.damageMultiplier}x</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p>
        The <code>damageFormula</code> determines how the base damage is
        computed for the spell: <code>avg</code> uses the average of damageMin
        and damageMax, <code>min</code> uses damageMin, and <code>max</code>{' '}
        uses damageMax. The multiplier then scales this value.
      </p>
      <p>
        Prefixes with <code>damageTypeOverride</code> convert all of the
        mob&apos;s damage (including normal attacks) to that type. Shaman and
        Spectral override to magic damage, making them resistant to physical
        defence stacking.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'NO_PREFIX_WEIGHT',
            value: NO_PREFIX_WEIGHT,
            description: 'Selection weight for unprefixed (normal) mobs',
          },
          {
            name: 'Total weight pool',
            value: totalWeight,
            description: 'Sum of all prefix weights + no-prefix weight',
          },
        ]}
      />
    </WikiSection>
  );
}
