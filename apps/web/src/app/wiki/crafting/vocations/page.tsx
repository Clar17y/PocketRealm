import type { Metadata } from 'next';
import {
  describeVocationTechnique,
  isAdvancedVocationTechnique,
  VOCATION_DEFINITIONS,
  VOCATION_MASTERY,
} from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

export const metadata: Metadata = {
  title: 'Vocation Mastery',
  description:
    'Vocation honing turn costs, daily caps, mentor access, passive XP, technique branches, and craft mark effects.',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

function formatLabel(value: string): string {
  const label = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();

  return label.replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function VocationMasteryPage() {
  const fullDailyXp = Math.floor(
    VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT * VOCATION_MASTERY.ACTIVE_XP_PER_TURN,
  );

  return (
    <WikiSection
      title="Vocation Mastery"
      summary="Vocations are long-term crafting and gathering specialisations. Honing spends personal turns for mastery XP, while normal crafting and gathering still add slower passive progress."
      related={[
        { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
        { label: 'Gathering & Gems', href: '/wiki/crafting/gathering' },
        { label: 'Turns & Regeneration', href: '/wiki/resources/turns' },
      ]}
    >
      <h2>Honing</h2>
      <p>
        Honing is an active turn sink. Those turns could have been spent on
        exploration, encounter sites, gathering, crafting, or recovery, so the
        daily cap is deliberately large enough to be a real character choice.
      </p>
      <ConstantsTable
        rows={[
          {
            name: 'DAILY_HONING_TURN_LIMIT',
            value: formatNumber(VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT),
            description: `Maximum active honing turns per UTC day. A full day grants ${formatNumber(fullDailyXp)} vocation XP.`,
          },
          {
            name: 'HONE_ACTION_TURN_MIN',
            value: VOCATION_MASTERY.HONE_ACTION_TURN_MIN,
            description: 'Minimum turns in one honing action.',
          },
          {
            name: 'HONE_ACTION_TURN_LIMIT',
            value: formatNumber(VOCATION_MASTERY.HONE_ACTION_TURN_LIMIT),
            description: 'Maximum turns in one honing action.',
          },
          {
            name: 'ACTIVE_XP_PER_TURN',
            value: VOCATION_MASTERY.ACTIVE_XP_PER_TURN,
            description: 'Vocation XP gained per turn spent actively honing.',
          },
          {
            name: 'PASSIVE_CRAFT_XP_MULTIPLIER',
            value: `${(VOCATION_MASTERY.PASSIVE_CRAFT_XP_MULTIPLIER * 100).toFixed(0)}%`,
            description: 'Share of crafting XP also granted to the matching vocation.',
          },
          {
            name: 'PASSIVE_GATHER_XP_MULTIPLIER',
            value: `${(VOCATION_MASTERY.PASSIVE_GATHER_XP_MULTIPLIER * 100).toFixed(0)}%`,
            description: 'Share of gathering XP also granted to the matching vocation.',
          },
        ]}
      />

      <h2>Mentors</h2>
      <p>
        Millbrook and Thornwall mentors can both teach basic honing and rank
        1-4 techniques for every vocation. Rank{' '}
        <strong>{VOCATION_MASTERY.ADVANCED_MENTOR_RANK}</strong> and higher
        techniques require a Thornwall mentor.
      </p>

      <h2>Launch Vocations</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Vocation</th>
            <th>Primary Skill</th>
            <th>Branches</th>
          </tr>
        </thead>
        <tbody>
          {VOCATION_DEFINITIONS.map((vocation) => (
            <tr key={vocation.id}>
              <td>{vocation.name}</td>
              <td>{formatLabel(vocation.primarySkill)}</td>
              <td>{vocation.branches.map((branch) => branch.name).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Technique Effects</h2>
      <p>
        Technique names are flavour; the effect column is the mechanical rule
        applied after the technique is learned.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Vocation</th>
            <th>Technique</th>
            <th>Rank</th>
            <th>Mentor</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          {VOCATION_DEFINITIONS.flatMap((vocation) =>
            vocation.techniques.map((technique) => (
              <tr key={technique.id}>
                <td>{vocation.name}</td>
                <td>{technique.name}</td>
                <td>{technique.requiredRank}</td>
                <td>{isAdvancedVocationTechnique(technique) ? 'Thornwall' : 'Millbrook or Thornwall'}</td>
                <td>{describeVocationTechnique(technique)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </WikiSection>
  );
}
