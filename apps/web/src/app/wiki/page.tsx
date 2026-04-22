import type { Metadata } from 'next';
import { WikiCard } from '@/components/wiki/WikiCard';
import { wikiNavigation } from './wikiNavigation';

export const metadata: Metadata = {
  title: 'Pocketrealm Wiki',
  description:
    'Complete game mechanics reference for Pocketrealm covering every formula, constant, and calculation.',
};

const sectionDescriptions: Record<string, string> = {
  combat:
    'Damage formulas, hit curves, crit mechanics, actions, buffs, and mob modifiers.',
  bosses:
    'Boss encounter scaling, threat system, contribution scoring, and expedition mechanics.',
  pvp: 'Player vs player combat differences, ELO rating, and matchmaking.',
  progression:
    'XP formulas, leveling curves, efficiency decay, and skill point allocation.',
  resources:
    'Turn bank, health, stamina, mana, regen rates, rest, and flee mechanics.',
  items: 'Item rarity, drop tables, forge upgrades, durability, sell prices, and inventory.',
  crafting:
    'Crafting crit system, gathering yields, gem drops, and salvage rates.',
  exploration:
    'Exploration probability model, room generation, mob tiers, and zone progression.',
};

export default function WikiIndexPage() {
  return (
    <article>
      <h1 className="wiki-page-title">Pocketrealm Wiki</h1>
      <p className="wiki-page-summary">
        Complete game mechanics reference covering every formula, constant, and
        calculation. Pick a category to dive in.
      </p>

      <div className="wiki-index-grid">
        {wikiNavigation.map((section) => (
          <WikiCard
            key={section.slug}
            title={section.label}
            description={sectionDescriptions[section.slug] ?? ''}
            href={section.items[0]?.href ?? `/wiki/${section.slug}`}
            icon={section.icon}
            count={section.items.length}
          />
        ))}
      </div>
    </article>
  );
}
