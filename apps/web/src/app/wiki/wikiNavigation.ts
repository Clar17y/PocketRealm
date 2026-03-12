export interface WikiNavItem {
  label: string;
  href: string;
}

export interface WikiNavSection {
  label: string;
  slug: string;
  icon: string;
  items: WikiNavItem[];
}

export const wikiNavigation: WikiNavSection[] = [
  {
    label: 'Combat',
    slug: 'combat',
    icon: '/assets/ui/ui_attack-pixelated-128.webp',
    items: [
      { label: 'Damage Calculation', href: '/wiki/combat/damage' },
      { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
      { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
      { label: 'Actions & Abilities', href: '/wiki/combat/actions' },
      { label: 'Buffs, Debuffs & DoTs', href: '/wiki/combat/buffs-debuffs' },
      { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
      { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
    ],
  },
  {
    label: 'Bosses',
    slug: 'bosses',
    icon: '/assets/monsters/monster_crystal_titan-pixelated-128.webp',
    items: [
      { label: 'Boss Encounters', href: '/wiki/bosses/encounters' },
      { label: 'Threat & Contribution', href: '/wiki/bosses/threat' },
      { label: 'Expeditions', href: '/wiki/bosses/expeditions' },
    ],
  },
  {
    label: 'PvP',
    slug: 'pvp',
    icon: '/assets/ui/ui_guild-pixelated-128.webp',
    items: [
      { label: 'PvP Combat', href: '/wiki/pvp/combat' },
      { label: 'ELO & Matchmaking', href: '/wiki/pvp/elo' },
    ],
  },
  {
    label: 'Progression',
    slug: 'progression',
    icon: '/assets/ui/ui_xp-pixelated-128.webp',
    items: [
      { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
      { label: 'Efficiency & Caps', href: '/wiki/progression/efficiency' },
      { label: 'Skill Points', href: '/wiki/progression/skill-points' },
    ],
  },
  {
    label: 'Resources',
    slug: 'resources',
    icon: '/assets/ui/ui_hp-pixelated-128.webp',
    items: [
      { label: 'Health', href: '/wiki/resources/health' },
      { label: 'Stamina', href: '/wiki/resources/stamina' },
      { label: 'Mana', href: '/wiki/resources/mana' },
      { label: 'Flee Mechanics', href: '/wiki/resources/flee' },
    ],
  },
  {
    label: 'Items & Equipment',
    slug: 'items',
    icon: '/assets/ui/ui_inventory-pixelated-128.webp',
    items: [
      { label: 'Rarity System', href: '/wiki/items/rarity' },
      { label: 'Drop Tables', href: '/wiki/items/drops' },
      { label: 'Forge & Upgrades', href: '/wiki/items/forge' },
      { label: 'Durability & Selling', href: '/wiki/items/durability' },
      { label: 'Inventory', href: '/wiki/items/inventory' },
    ],
  },
  {
    label: 'Crafting & Gathering',
    slug: 'crafting',
    icon: '/assets/ui/ui_scroll-pixelated-128.webp',
    items: [
      { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
      { label: 'Gathering & Gems', href: '/wiki/crafting/gathering' },
      { label: 'Salvage', href: '/wiki/crafting/salvage' },
    ],
  },
  {
    label: 'Exploration & Zones',
    slug: 'exploration',
    icon: '/assets/ui/ui_explore-pixelated-128.webp',
    items: [
      { label: 'Probability Model', href: '/wiki/exploration/probability' },
      { label: 'Room Generation', href: '/wiki/exploration/rooms' },
      { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
      { label: 'Zone Progression', href: '/wiki/exploration/zones' },
    ],
  },
];
