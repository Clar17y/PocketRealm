import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  EXPLORATION_CONSTANTS,
  EXPLORATION_TRACKING_CONSTANTS,
  ENCOUNTER_SITE_CONSTANTS,
  CHEST_CONSTANTS,
  COMBAT_CONSTANTS,
} from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Encounter Sites - Pocketrealm Wiki',
  description:
    'Encounter site mechanics: discovery, room progression, combat modes, mob decay, and chest rewards.',
};

const related = [
  { label: 'Probability Model', href: '/wiki/exploration/probability' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
  { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
];

export default function EncounterSitesPage() {
  return (
    <WikiSection
      title="Encounter Sites"
      summary="Encounter sites are multi-room dungeons discovered during exploration. Each site contains mobs distributed across several rooms that must be cleared one at a time. Clearing all rooms unlocks a chest reward containing materials and a chance at a recipe."
      related={related}
    >
      <h2>Discovery</h2>
      <p>
        While exploring a zone, each turn carries a{' '}
        <Const>{(EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * 100).toFixed(2)}%</Const>{' '}
        chance of discovering an encounter site. Sites come in three sizes
        determined by their total mob count:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>Mob Count</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Small</td>
            <td>
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL.min}–
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL.max}
            </td>
          </tr>
          <tr>
            <td>Medium</td>
            <td>
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM.min}–
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM.max}
            </td>
          </tr>
          <tr>
            <td>Large</td>
            <td>
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE.min}–
              {EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE.max}
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Mobs are distributed across rooms when the site is generated. You must
        clear rooms sequentially. The next room becomes available only after
        the current one is fully defeated.
      </p>
      <p>
        If mob family tracking is enabled, encounter-site family discovery is
        biased toward the tracked family using a{' '}
        <strong>{EXPLORATION_TRACKING_CONSTANTS.TRACKED_FAMILY_WEIGHT_MULTIPLIER}x</strong>{' '}
        weight boost, while non-tracked families are suppressed to{' '}
        <strong>{EXPLORATION_TRACKING_CONSTANTS.NON_TRACKED_WEIGHT_MULTIPLIER}x</strong>.
        Tracking also reduces overall ambush and site result rate to{' '}
        <strong>{EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER}x</strong>{' '}
        normal. If the tracked family cannot build a valid site at the current
        tier, site generation falls back to the normal non-tracked family pool.
      </p>

      <h2>Mob Decay</h2>
      <p>
        Mobs in an unfinished encounter site decay at a rate of{' '}
        <Const>{EXPLORATION_CONSTANTS.ENCOUNTER_SITE_DECAY_RATE_PER_HOUR}</Const> mobs per hour
        (equivalent to one mob every four hours). If all remaining mobs in
        unfinished rooms decay before you finish, the site auto-clears and you
        receive the chest reward.
      </p>
      <p>
        Rooms that were fully cleared through decay rather than combat do not
        contribute to the auto-resolve loot bonus. Plan accordingly: the longer
        a site sits unfinished, the lower your expected chest quality.
      </p>

      <h2>Combat Modes</h2>
      <p>Each room can be fought in one of two ways:</p>

      <h3>Auto-Resolve</h3>
      <p>
        Auto-resolve uses your active combat template to simulate the entire
        room instantly, up to{' '}
        <Const>{ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS}</Const> rounds.
        You do not control individual rounds, but you receive a bonus on the
        final chest: rooms cleared by auto-resolve contribute proportionally to
        a loot multiplier (up to{' '}
        <Const>{ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER}x</Const>{' '}
        on material rolls) and a recipe chance multiplier (up to{' '}
        <Const>{ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER}x</Const>).
      </p>

      <h3>Manual Combat</h3>
      <p>
        Manual combat lets you control each round individually. You can switch
        combat templates between rounds and target specific mobs within the
        room. Manual combat does not grant the auto-resolve chest bonus, but
        gives you full tactical control, which is useful when your template is not
        optimised for the mob types present.
      </p>

      <h2>Turn Cost</h2>
      <p>
        Each mob fought costs{' '}
        <Const>{COMBAT_CONSTANTS.ENCOUNTER_TURN_COST}</Const> turns, regardless
        of combat mode. Turn cost is calculated per mob, so a room containing
        three mobs costs{' '}
        {COMBAT_CONSTANTS.ENCOUNTER_TURN_COST * 3} turns total.
      </p>
      <FormulaBlock>
        <Out>roomTurnCost</Out> <Op>=</Op> <Var>mobCount</Var> <Op>&times;</Op>{' '}
        <Const>{COMBAT_CONSTANTS.ENCOUNTER_TURN_COST}</Const>
        <Comment>
          {' '}{'//'} e.g. 3 mobs &rarr; {COMBAT_CONSTANTS.ENCOUNTER_TURN_COST * 3} turns
        </Comment>
      </FormulaBlock>

      <h2>Splash Cascade</h2>
      <p>
        Encounter site combat features a mechanic called Splash Cascade. When
        your attack misses its primary target, the attack bounces to another
        living enemy in the room. Each bounce independently re-rolls hit chance
        against the new target. This means missing one mob does not waste your
        action entirely when multiple enemies remain. The attack can still
        connect with a different mob.
      </p>

      <h2>Equipment Durability</h2>
      <p>
        Encounter site combat degrades equipped weapon and armour durability
        just like open-world encounters. Each hit you land reduces weapon
        durability, and each hit you take reduces armour durability. See{' '}
        <a href="/wiki/items/durability">Durability &amp; Selling</a> for the
        per-hit degradation rate.
      </p>

      <h2>Resource Management</h2>
      <p>
        HP, stamina, and mana carry over between rooms rather than resetting.
        However, all three regenerate naturally while you are between fights.
        You can also choose to rest before starting the next room to recover
        resources before engaging.
      </p>

      <h2>XP Rewards</h2>
      <p>
        Defeating mobs in encounter sites grants combat skill XP through the
        same pipeline as zone combat. XP is distributed to the attack skill
        associated with your equipped weapon (melee, ranged, or magic). XP is
        only granted when an entire room is fully cleared. Defeating individual
        mobs within a room does not award XP until the last mob in that room
        falls. Mob prefixes that carry XP multipliers apply normally.
      </p>

      <h2>Chest Rewards</h2>
      <p>
        Clearing all rooms unlocks a chest. Chest rarity, material rolls, and
        recipe chance scale with the number of rooms in the site:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rooms</th>
            <th>Chest Rarity</th>
            <th>Material Rolls</th>
            <th>Recipe Chance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Common</td>
            <td>
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL.min}–
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL.max}
            </td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_SMALL * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Uncommon</td>
            <td>
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM.min}–
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM.max}
            </td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Rare</td>
            <td>
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE.min}–
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE.max}
            </td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LARGE * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>4+</td>
            <td>Epic</td>
            <td>
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_EPIC.min}–
              {CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_EPIC.max}
            </td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_EPIC * 100).toFixed(1)}%</td>
          </tr>
        </tbody>
      </table>
      <p>
        Auto-resolve bonus: rooms cleared via auto-resolve contribute
        proportionally to a multiplier on material rolls (up to{' '}
        <Const>{ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER}x</Const>) and
        recipe chance (up to{' '}
        <Const>{ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER}x</Const>).
        A site where every room was auto-resolved receives the full multiplier;
        partially auto-resolved sites receive a proportional share.
      </p>

      <h2>Activity Lockout</h2>
      <p>
        While you have an active encounter site, other combat actions (including
        zone combat and expeditions) are disabled until the site is completed
        or abandoned. This prevents resource states from conflicting across
        simultaneous combat contexts.
      </p>

      <h2>Key Constants</h2>
      <ConstantsTable
        rows={[
          {
            name: 'ENCOUNTER_SITE_CHANCE_PER_TURN',
            value: `${(EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * 100).toFixed(2)}%`,
            description: 'Chance per exploration turn of discovering an encounter site',
          },
          {
            name: 'ENCOUNTER_SITE_DECAY_RATE_PER_HOUR',
            value: EXPLORATION_CONSTANTS.ENCOUNTER_SITE_DECAY_RATE_PER_HOUR,
            description: 'Mobs lost per hour in an unfinished site',
          },
          {
            name: 'ENCOUNTER_TURN_COST',
            value: COMBAT_CONSTANTS.ENCOUNTER_TURN_COST,
            description: 'Turns consumed per mob fought',
          },
          {
            name: 'AUTO_RESOLVE_MAX_ROUNDS',
            value: ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS,
            description: 'Maximum rounds simulated during auto-resolve',
          },
          {
            name: 'AUTO_RESOLVE_DROP_MULTIPLIER',
            value: `${ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER}x`,
            description: 'Maximum chest material roll multiplier from auto-resolving all rooms',
          },
          {
            name: 'AUTO_RESOLVE_RECIPE_MULTIPLIER',
            value: `${ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER}x`,
            description: 'Maximum recipe chance multiplier from auto-resolving all rooms',
          },
        ]}
      />
    </WikiSection>
  );
}
