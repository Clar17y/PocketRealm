export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.12',
    date: '2026-02-24',
    title: 'Game Assets & Visual Polish',
    summary:
      'Added a full pixel art asset pack with icons, monsters, and zone backgrounds. Login and register pages redesigned with zone art. Pixelated 128px assets now used across all UI.',
  },
  {
    version: '0.11',
    date: '2026-02-23',
    title: 'Guilds, Jewellery & Landing Page',
    summary:
      'Guilds are here! Create or join a guild, take on weekly bounty contracts, and collaborate on guild projects. Plus a new Jewelcrafting skill — find gems while gathering and craft rings, necklaces, and charms. The landing page got a full redesign with zone showcases and a monster parade.',
  },
  {
    version: '0.10',
    date: '2026-02-22',
    title: 'HP Visibility & Equipment UX',
    summary:
      'HP bars now appear directly on the Combat and Exploration screens so you always know where you stand. Low-HP warnings protect you from risky actions. Equipment got repair buttons, a Repair All option, and durability bars on every item card.',
  },
  {
    version: '0.9',
    date: '2026-02-21',
    title: 'Tutorial, Admin & Preferences',
    summary:
      'New players get an 8-step interactive tutorial walking them through their first explore, fight, and craft. User preferences let you adjust combat speed, auto-skip known encounters, set default explore turns, and more.',
  },
  {
    version: '0.8',
    date: '2026-02-20',
    title: 'Achievements & Early Game Rooms',
    summary:
      'Nearly 100 achievements to earn across combat, gathering, crafting, and exploration. Encounter sites now have room-based progression — fight through multiple rooms for a full-clear bonus chest. Mob icons appear everywhere.',
  },
  {
    version: '0.7',
    date: '2026-02-19',
    title: 'Leaderboards & Zone Progression',
    summary:
      'Compete on leaderboards across multiple categories. Zones now track your exploration progress — unlock tougher mobs as you explore deeper into each area.',
  },
  {
    version: '0.6',
    date: '2026-02-17',
    title: 'PvP Arena & World Bosses',
    summary:
      'Challenge other players in the PvP arena with Elo-based matchmaking. World bosses spawn during events — rally together to take them down for trophies, loot, and unique recipes.',
  },
  {
    version: '0.5',
    date: '2026-02-15',
    title: 'World Events & Auto-Potions',
    summary:
      'Dynamic world events buff and debuff gathering, combat, and crafting across zones. Boss encounters appear during events. Auto-potion keeps you alive by using potions automatically in combat.',
  },
  {
    version: '0.4',
    date: '2026-02-13',
    title: 'Chat, Spells & Rare Crafting',
    summary:
      'Real-time zone chat with badges and pinned messages. Mobs now cast spells with damage, heals, buffs, and debuffs. Crafting can now crit into rare and epic quality. Town zones restrict crafting by level.',
  },
  {
    version: '0.3',
    date: '2026-02-12',
    title: 'Zone Travel & Combat Playback',
    summary:
      'Explore a connected world map and travel between zones — but watch out for ambushes. Combat and exploration play out with animated HP bars and progress tracking. Magic defence and durability systems added.',
  },
  {
    version: '0.2',
    date: '2026-02-09',
    title: 'Items, Crits & Attributes',
    summary:
      'Item rarity system with a Forge for upgrading and re-rolling gear. Crit chance and crit damage stats. Full attribute system with vitality, strength, dexterity, intelligence, luck, and evasion.',
  },
  {
    version: '0.1',
    date: '2026-02-05',
    title: 'HP System & Core Polish',
    summary:
      'Persistent HP with rest, knockout, and recovery. Flee mechanics let you escape tough fights. Enhanced combat log with damage calculations. New skills: foraging, woodcutting, and alchemy.',
  },
];

export function getLatestVersion(): string {
  return changelog[0]?.version ?? '';
}
