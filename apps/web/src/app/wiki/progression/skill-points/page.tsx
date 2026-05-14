import { TALENT_TREE_DEFINITIONS } from '@pocketrealm/shared/constants/talentTreeDefinitions';
import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  ALL_SKILLS, CHARACTER_CONSTANTS, PREMIUM_CONSTANTS, SKILL_CONSTANTS, SKILL_POINT_CONSTANTS } from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Skill Points - Pocketrealm Wiki',
  description:
    'How skill points are earned, talent tree structure, allocation, and respec.',
};

const progressionRelated = [
  { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
  { label: 'Efficiency & Caps', href: '/wiki/progression/efficiency' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
];

const treeNames = Object.keys(TALENT_TREE_DEFINITIONS) as (keyof typeof TALENT_TREE_DEFINITIONS)[];
const skillCount = ALL_SKILLS.length;
const maxLevelUps = skillCount * (SKILL_CONSTANTS.MAX_LEVEL - 1);
const maxPointsFromLevels = maxLevelUps * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL;
const theoreticalMaxPoints = CHARACTER_CONSTANTS.STARTING_SKILL_POINTS + maxPointsFromLevels;

export default function SkillPointsPage() {
  return (
    <WikiSection
      title="Skill Points"
      summary="Skill points are earned by leveling up skills and spent in talent trees to unlock combat actions and passive bonuses."
      related={progressionRelated}
    >
      <h2>Earning Skill Points</h2>
      <p>
        You start with{' '}
        <Const>{CHARACTER_CONSTANTS.STARTING_SKILL_POINTS}</Const> skill
        points, then earn <Const>{SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL}</Const>{' '}
        skill point every time any of your {skillCount} skills levels up. Since
        each skill has a max level of <Const>{SKILL_CONSTANTS.MAX_LEVEL}</Const>,
        the theoretical maximum is{' '}
        <Const>{CHARACTER_CONSTANTS.STARTING_SKILL_POINTS}</Const> + {skillCount}{' '}
        &times; {SKILL_CONSTANTS.MAX_LEVEL - 1} ={' '}
        <Const>{theoreticalMaxPoints.toLocaleString()}</Const> skill points.
      </p>
      <FormulaBlock>
        <Out>totalPoints</Out> <Op>=</Op>{' '}
        <Var>startingSkillPoints</Var> <Op>+</Op>{' '}
        <Const>{SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL}</Const>{' '}
        <Op>&times;</Op> <Var>totalLevelUps</Var>
        <Comment> {'//'} across all skills</Comment>
      </FormulaBlock>

      <h2>Talent Trees</h2>
      <p>
        Skill points are spent in four talent trees:{' '}
        <strong>Melee</strong>, <strong>Ranged</strong>,{' '}
        <strong>Magic</strong>, and <strong>Survival</strong>. Each tree has
        five tiers of nodes. Higher tiers require both sufficient invested
        points and a skill level gate.
      </p>

      {treeNames.map((treeName) => {
        const nodes = TALENT_TREE_DEFINITIONS[treeName];
        const tiers = [1, 2, 3, 4, 5];
        return (
          <div key={treeName}>
            <h3>{treeName.charAt(0).toUpperCase() + treeName.slice(1)} Tree</h3>
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Node</th>
                  <th>Cost</th>
                  <th>Type</th>
                  <th>Effect</th>
                </tr>
              </thead>
              <tbody>
                {tiers.flatMap((tier) =>
                  nodes
                    .filter((n) => n.tier === tier)
                    .map((node) => (
                      <tr key={node.id}>
                        <td>{node.tier}</td>
                        <td>{node.name}</td>
                        <td>{node.pointCost}</td>
                        <td>{node.unlocksAction ? 'Action' : 'Passive'}</td>
                        <td>{node.description}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      <h2>Tier Progression</h2>
      <p>
        Each tier has a skill level gate that prevents early access to powerful
        abilities:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Typical Point Cost</th>
            <th>Skill Level Gate</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>5 pts</td><td>None</td></tr>
          <tr><td>2</td><td>10 pts</td><td>15</td></tr>
          <tr><td>3</td><td>15-20 pts</td><td>35</td></tr>
          <tr><td>4</td><td>25-35 pts</td><td>60</td></tr>
          <tr><td>5</td><td>50 pts</td><td>85</td></tr>
        </tbody>
      </table>
      <p>
        Nodes also have prerequisite nodes that must be unlocked before them,
        forming branching paths through the tree.
      </p>

      <h2>Allocation &amp; Respec</h2>
      <p>
        Points can be freely allocated into any unlocked node whose
        prerequisites are met. To reallocate all points, you can respec for{' '}
        <Const>{SKILL_POINT_CONSTANTS.RESPEC_TURN_COST.toLocaleString()}</Const>{' '}
        turns. Respec removes all allocations and returns all points to spend
        fresh.
      </p>

      <h2>Combat Templates</h2>
      <p>
        Unlocked talent actions become available in your combat templates. You
        can save <Const>{PREMIUM_CONSTANTS.TEMPLATE_LIMIT_FREE}</Const> combat
        templates on a free account or{' '}
        <Const>{PREMIUM_CONSTANTS.TEMPLATE_LIMIT_CHAMPION}</Const> as a Champion
        supporter. The default action for empty template slots is{' '}
        <code>{SKILL_POINT_CONSTANTS.DEFAULT_ACTION_ID}</code>.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'POINTS_PER_LEVEL',
            value: SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL,
            description: 'Skill points earned per skill level-up',
          },
          {
            name: 'STARTING_SKILL_POINTS',
            value: CHARACTER_CONSTANTS.STARTING_SKILL_POINTS,
            description: 'Skill points granted at character creation',
          },
          {
            name: 'RESPEC_TURN_COST',
            value: SKILL_POINT_CONSTANTS.RESPEC_TURN_COST.toLocaleString(),
            description: 'Turns spent to respec all skill points',
          },
          {
            name: 'TEMPLATE_LIMIT_FREE',
            value: PREMIUM_CONSTANTS.TEMPLATE_LIMIT_FREE,
            description: 'Maximum saved combat templates for free accounts',
          },
          {
            name: 'TEMPLATE_LIMIT_CHAMPION',
            value: PREMIUM_CONSTANTS.TEMPLATE_LIMIT_CHAMPION,
            description: 'Maximum saved combat templates for Champion supporters',
          },
          {
            name: 'SKILL_COUNT',
            value: skillCount,
            description: 'Number of skills that can contribute skill points',
          },
        ]}
      />
    </WikiSection>
  );
}
