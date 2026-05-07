import type { Metadata } from 'next';
import { ROOM_CONSTANTS, CHEST_CONSTANTS, ENCOUNTER_SITE_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

export const metadata: Metadata = {
  title: 'Room Generation',
  description:
    'Encounter site room counts by size, mobs per room, chest drops, recipe chances, material rolls, and auto-resolve bonuses.',
};

export default function RoomsPage() {
  return (
    <WikiSection
      title="Room Generation"
      summary="When an encounter site is discovered, rooms are generated based on the site's size. Each room contains a set number of mobs. Clearing all rooms awards a chest."
      related={[
        { label: 'Probability Model', href: '/wiki/exploration/probability' },
        { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
        { label: 'Rarity System', href: '/wiki/items/rarity' },
      ]}
    >
      <h2>Room Counts by Size</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>Rooms</th>
            <th>Mobs per Room</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Small</td>
            <td>{ROOM_CONSTANTS.ROOMS_SMALL.min}&#8211;{ROOM_CONSTANTS.ROOMS_SMALL.max}</td>
            <td>{ROOM_CONSTANTS.MOBS_PER_ROOM_SMALL.min}&#8211;{ROOM_CONSTANTS.MOBS_PER_ROOM_SMALL.max}</td>
          </tr>
          <tr>
            <td>Medium</td>
            <td>{ROOM_CONSTANTS.ROOMS_MEDIUM.min}&#8211;{ROOM_CONSTANTS.ROOMS_MEDIUM.max}</td>
            <td>{ROOM_CONSTANTS.MOBS_PER_ROOM_MEDIUM.min}&#8211;{ROOM_CONSTANTS.MOBS_PER_ROOM_MEDIUM.max}</td>
          </tr>
          <tr>
            <td>Large</td>
            <td>{ROOM_CONSTANTS.ROOMS_LARGE.min}&#8211;{ROOM_CONSTANTS.ROOMS_LARGE.max}</td>
            <td>{ROOM_CONSTANTS.MOBS_PER_ROOM_LARGE.min}&#8211;{ROOM_CONSTANTS.MOBS_PER_ROOM_LARGE.max}</td>
          </tr>
        </tbody>
      </table>

      <h2>Chest Drops</h2>
      <p>
        Clearing an encounter site awards a chest. Chest rarity is based on
        total room count, so larger sites yield better chests with more
        materials and higher recipe chances.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Total Rooms</th>
            <th>Chest Rarity</th>
            <th>Recipe Chance</th>
            <th>Material Rolls</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Common</td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_SMALL * 100).toFixed(0)}%</td>
            <td>{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL.min}&#8211;{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL.max}</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Uncommon</td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM * 100).toFixed(0)}%</td>
            <td>{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM.min}&#8211;{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM.max}</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Rare</td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LARGE * 100).toFixed(0)}%</td>
            <td>{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE.min}&#8211;{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE.max}</td>
          </tr>
          <tr>
            <td>4+</td>
            <td>Epic</td>
            <td>{(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_EPIC * 100).toFixed(0)}%</td>
            <td>{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_EPIC.min}&#8211;{CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_EPIC.max}</td>
          </tr>
        </tbody>
      </table>

      <h2>Auto-Resolve Bonus</h2>
      <p>
        If unresolved rooms are auto-resolved after decay, material rolls and
        recipe chance receive a proportional bonus based on the fraction of
        rooms resolved automatically. A fully auto-resolved site receives the
        full multiplier.
      </p>
      <ConstantsTable
        rows={[
          { name: 'AUTO_RESOLVE_DROP_MULTIPLIER', value: `${ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER}x`, description: 'Maximum material-roll multiplier from auto-resolved rooms' },
          { name: 'AUTO_RESOLVE_RECIPE_MULTIPLIER', value: `${ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER}x`, description: 'Maximum recipe chance multiplier from auto-resolved rooms' },
          { name: 'AUTO_RESOLVE_MAX_ROUNDS', value: ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS, description: 'Maximum rounds used by auto-resolve simulation' },
        ]}
      />
    </WikiSection>
  );
}
