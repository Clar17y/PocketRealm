export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.23',
    date: '2026-03-02',
    title: 'Combat Rework: Templates, Resources & Skill Trees',
    summary:
      'Combat is no longer auto-attack. Build combat templates — ordered action rotations that your character follows each fight. Stamina and mana fuel your actions; run out and you fall back to Defend. A new Skill Tree lets you spend points earned from levelling to unlock 24 powerful abilities across Melee, Ranged, Magic, and General trees. Resource bars show HP, stamina, and mana on the Explore and Combat screens, with values embedded inside the bars. Combat playback now shows action names, resource costs, and interaction results like Countered! and Warded!',
  },
  {
    version: '0.22',
    date: '2026-03-02',
    title: 'Boss Encounters & PvP Rework',
    summary:
      'Boss encounters now use individual HP per participant instead of a shared raid pool. A new threat system determines who the boss targets — deal more damage, draw more aggro. Boss loot is distributed by contribution score. PvP uses your combat template so fights play out action-by-action. Scout notifications tell you when someone is sizing you up. The bestiary progressively reveals boss attack rotations as you fight them.',
  },
  {
    version: '0.21',
    date: '2026-03-02',
    title: 'Casino & Training Grounds',
    summary:
      'A brand new Casino has opened in every town! Exchange turns for gold and play roulette against other players — bet on numbers, colours, corners, and more. Watch chips pile up on the board in real-time, chat with fellow gamblers, and celebrate wins with a gold coin shower. The dealer announces results and calls out big winners. A Hot/Cold stats panel shows which numbers are running hot or cold over the last 200 spins. Casino leaderboards track total profit and wagered volume. 10 new casino achievements reward your gambling career. The Training Grounds let you practice against any monster from your bestiary with mob prefix variants — no turn cost, no risk. Both screens include first-visit how-to guides.',
  },
  {
    version: '0.20',
    date: '2026-03-01',
    title: 'Inventory & Backpack System',
    summary:
      'Your inventory is no longer bottomless. A new backpack equipment slot determines your carrying capacity — craft or find better backpacks to carry more. Items have sell prices and can be sold to vendors in town for gold. A new Stash in every town lets you store items you want to keep safe. Crafting pulls materials from both your backpack and stash, so you can safely store bulk materials without worrying about recipe availability. When loot drops exceed your capacity, a Loot Picker lets you choose which items to claim. Traveling or exploring with a full backpack warns you about pending loot. A "Confirm Before" setting in Settings lets you choose which item rarity triggers a confirmation dialog on drop, salvage, or sell — no more accidentally destroying your epics.',
  },
  {
    version: '0.19',
    date: '2026-02-28',
    title: 'Combat Log Improvements',
    summary:
      'Encounter site loot now aggregates properly instead of showing duplicates. Combat playback appears above the site list so you never have to scroll to find it. The Combat History tab groups encounter site fights into a single entry with 1/N navigation between individual fights. After a multi-fight encounter, the last combat panel lets you browse all fight logs with Prev/Next buttons (defaulting to the last fight). The panel is now collapsible and clears when you leave the screen. Encounter site timestamps show human-readable durations like "3d ago" instead of raw minutes.',
  },
  {
    version: '0.18',
    date: '2026-02-27',
    title: 'Forge & Salvage Overhaul',
    summary:
      'Forge upgrade and salvage costs now scale with your crafting skill — costs drop 20% per level above the recipe requirement, and at 5+ levels above it\'s free. A new Salvage Mode lets you multi-select items and salvage them all in one batch. The Forge sacrifice picker is now collapsed by default for a smoother mobile experience. The Salvage button shows the actual turn cost, and a tutorial popup explains the forge on your first visit.',
  },
  {
    version: '0.17',
    date: '2026-02-27',
    title: 'Atmospheric Backgrounds & WebP Migration',
    summary:
      'Every gameplay screen now has a subtle atmospheric background. Zone art appears behind Exploration, Combat, Gathering, Rest, and the Dashboard. Screen-specific pixel art backgrounds have been added for the Arena, Forge, Guild, Inventory, and all 9 crafting skills. Backgrounds crossfade smoothly when you change zones or switch screens. All game assets have been migrated from PNG to WebP for faster load times.',
  },
  {
    version: '0.16',
    date: '2026-02-26',
    title: 'XP Rate & Efficiency Balance',
    summary:
      'The old "efficiency" system has been renamed to "XP Rate" and is now visible on every screen where you earn XP — Skills, Gathering, Crafting, Exploration, and Combat. Higher-level gathering nodes now award more XP per action. All skills (including combat) use a gradual decay curve instead of the old all-or-nothing cutoff. A one-time tutorial explains the mechanic the first time your rate drops. Error messages now auto-scroll into view so you never miss them.',
  },
  {
    version: '0.15',
    date: '2026-02-25',
    title: 'World Events Overhaul',
    summary:
      'World events are now much more visible — event badges appear on gathering nodes, encounter sites, and combat logs so you always know what modifiers are active. Spawn rate events affect exploration ambush and encounter site rates. Per-zone event caps keep things balanced.',
  },
  {
    version: '0.14',
    date: '2026-02-25',
    title: 'Zone Exploration Upgrades',
    summary:
      'Choose which mob tier to hunt when exploring. Zone exit chance scales with your exploration progress and auto-unlocks at 100%. Undiscovered zone connections appear as mysterious \'???\' hints. Hidden caches now drop materials and soulbound items. Thematic tier names in the bestiary and exploration UI.',
  },
  {
    version: '0.13',
    date: '2026-02-25',
    title: 'Performance & Quality of Life',
    summary:
      'Combat logs now load lazily — exploration and encounter site responses are much lighter, with logs fetched on demand during playback. HTTP compression reduces API payload sizes. Auto-skip works on travel and exploration ambushes. Double-click protection on the explore button. Death tracking for boss and PvP knockouts.',
  },
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

export const CHANGELOG_STORAGE_KEY = 'lastSeenChangelog';

export function getLatestVersion(): string {
  return changelog[0]?.version ?? '';
}
