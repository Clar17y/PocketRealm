import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { SKILL_CONSTANTS } from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Efficiency & Caps - Pocketrealm Wiki',
  description:
    'XP efficiency decay formula, rolling windows, per-skill daily caps, and how diminishing returns work.',
};

const progressionRelated = [
  { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
  { label: 'Skill Points', href: '/wiki/progression/skill-points' },
];

const windowsPerDay = 24 / SKILL_CONSTANTS.XP_WINDOW_HOURS;

const skillCaps = [
  {
    category: 'Combat (melee, ranged, magic)',
    dailyCap: SKILL_CONSTANTS.DAILY_CAP_COMBAT,
    windowCap: Math.floor(SKILL_CONSTANTS.DAILY_CAP_COMBAT / windowsPerDay),
  },
  {
    category: 'Gathering (mining, foraging, woodcutting)',
    dailyCap: SKILL_CONSTANTS.DAILY_CAP_GATHERING,
    windowCap: Math.floor(SKILL_CONSTANTS.DAILY_CAP_GATHERING / windowsPerDay),
  },
  {
    category: 'Processing (refining, tanning, weaving)',
    dailyCap: SKILL_CONSTANTS.DAILY_CAP_PROCESSING,
    windowCap: Math.floor(SKILL_CONSTANTS.DAILY_CAP_PROCESSING / windowsPerDay),
  },
  {
    category: 'Crafting (weaponsmithing, armorsmithing, etc.)',
    dailyCap: SKILL_CONSTANTS.DAILY_CAP_CRAFTING,
    windowCap: Math.floor(SKILL_CONSTANTS.DAILY_CAP_CRAFTING / windowsPerDay),
  },
];

export default function EfficiencyPage() {
  return (
    <WikiSection
      title="Efficiency & Caps"
      summary="XP efficiency decays as you grind within a rolling window, preventing no-life burnout and encouraging balanced play sessions."
      related={progressionRelated}
    >
      <h2>Efficiency Formula</h2>
      <p>
        Each XP gain is multiplied by an efficiency factor between 0 and 1. As
        you earn more XP within a window, efficiency drops:
      </p>
      <FormulaBlock>
        <Out>efficiency</Out> <Op>=</Op> <Op>max(</Op><Const>0</Const>
        <Op>,</Op> <Const>1</Const> <Op>-</Op> <Op>(</Op>
        <Var>windowXpGained</Var> <Op>/</Op> <Var>windowCap</Var>
        <Op>)</Op><Op>^</Op>
        <Const>{SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER}</Const><Op>)</Op>
        <Comment> {'//'} quadratic decay</Comment>
      </FormulaBlock>
      <p>
        The effective XP received is then:
      </p>
      <FormulaBlock>
        <Out>xpGained</Out> <Op>=</Op> <Op>round(</Op><Var>rawXp</Var>{' '}
        <Op>&times;</Op> <Var>efficiency</Var><Op>)</Op>
      </FormulaBlock>

      <h2>Quadratic Decay</h2>
      <p>
        With an exponent of{' '}
        <Const>{SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER}</Const> (quadratic),
        the decay is gentle at the start and accelerates toward the cap:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>% of Window Cap Used</th>
            <th>Efficiency</th>
            <th>Effective XP Rate</th>
          </tr>
        </thead>
        <tbody>
          {[0, 10, 25, 50, 75, 90, 100].map((pct) => {
            const ratio = pct / 100;
            const eff = Math.max(
              0,
              1 - Math.pow(ratio, SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER)
            );
            return (
              <tr key={pct}>
                <td>{pct}%</td>
                <td>{(eff * 100).toFixed(1)}%</td>
                <td>
                  {pct === 0
                    ? 'Full XP'
                    : pct >= 100
                      ? 'No XP'
                      : `${(eff * 100).toFixed(0)}% of raw XP`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        At 50% of the cap, you still earn 75% efficiency. Diminishing returns
        only become harsh above 75% usage.
      </p>

      <h2>Rolling Windows</h2>
      <p>
        The day is divided into{' '}
        <Const>{windowsPerDay}</Const> windows of{' '}
        <Const>{SKILL_CONSTANTS.XP_WINDOW_HOURS}</Const> hours each. Each
        window tracks XP earned independently. When a window expires (based on
        the player&rsquo;s last reset timestamp), the window XP counter resets
        to zero and efficiency returns to 100%.
      </p>
      <p>
        Windows are <em>rolling</em>, meaning they reset relative to the
        player&rsquo;s last reset time, not on fixed clock boundaries.
      </p>

      <h2>Per-Window Caps by Skill Category</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Skill Category</th>
            <th>Daily Cap</th>
            <th>Per-Window Cap</th>
          </tr>
        </thead>
        <tbody>
          {skillCaps.map((row) => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td>{row.dailyCap.toLocaleString()}</td>
              <td>{row.windowCap.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Combat skills have a lower cap than gathering, processing, and crafting
        skills, reflecting that combat XP comes in larger bursts per action
        while trade skills are more sustained.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'XP_WINDOW_HOURS',
            value: SKILL_CONSTANTS.XP_WINDOW_HOURS,
            description: 'Duration of each rolling XP window',
          },
          {
            name: 'EFFICIENCY_DECAY_POWER',
            value: SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER,
            description: 'Exponent for the diminishing returns curve',
          },
          {
            name: 'DAILY_CAP_COMBAT',
            value: SKILL_CONSTANTS.DAILY_CAP_COMBAT.toLocaleString(),
            description: 'Total daily XP cap for combat skills',
          },
          {
            name: 'DAILY_CAP_GATHERING',
            value: SKILL_CONSTANTS.DAILY_CAP_GATHERING.toLocaleString(),
            description: 'Total daily XP cap for gathering skills',
          },
          {
            name: 'DAILY_CAP_PROCESSING',
            value: SKILL_CONSTANTS.DAILY_CAP_PROCESSING.toLocaleString(),
            description: 'Total daily XP cap for processing skills',
          },
          {
            name: 'DAILY_CAP_CRAFTING',
            value: SKILL_CONSTANTS.DAILY_CAP_CRAFTING.toLocaleString(),
            description: 'Total daily XP cap for crafting skills',
          },
        ]}
      />
    </WikiSection>
  );
}
