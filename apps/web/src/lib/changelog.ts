export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.61',
    date: '2026-05-28',
    title: 'Faster Exploration and Travel',
    summary:
      'Exploration and travel actions now run through a shared activity worker pool, improving responsiveness when multiple players act at the same time. Travel ambush logging and exploration result persistence were also streamlined to reduce action delays.',
  },
  {
    version: '0.60',
    date: '2026-05-23',
    title: 'Resource Prospecting',
    summary:
      'Exploration now supports resource prospecting, letting you focus searches toward mining, woodcutting, or foraging nodes instead of encounter sites while keeping ambush risk in the mix. Targeting starts modestly and improves as your gathering skill catches up to the node tier, making resource routes more reliable without removing broad exploration.',
  },
  {
    version: '0.59',
    date: '2026-05-14',
    title: 'Navigation, Onboarding, and Town Recovery',
    summary:
      'Explore now opens to the Map, Home navigation is tighter, onboarding prompts queue more calmly, chat stays clear of mobile action controls, and desktop layouts make better use of wider screens. If you are knocked out and wake up in town, crafting and forge screens now update immediately instead of showing the old zone facility state until refresh.',
  },
  {
    version: '0.58',
    date: '2026-05-12',
    title: 'Guild Chat',
    summary:
      'Guild members now get a dedicated Guild tab in the chat panel, with its own history, unread count, and pinned message support. The tab appears automatically when you join or create a guild, disappears when you leave, and stays scoped to your current guild so old guild messages do not leak into the wrong chat.',
  },
  {
    version: '0.57',
    date: '2026-05-09',
    title: 'Encounter Site Loot Rebalance',
    summary:
      'Encounter site chests now better match the family you clear. Full clears guarantee a family-signature material such as Spider Silk, Boar Hide, Wolf Pelt, Stolen Coin, or Ancient Bark, while generic ore, logs, and herbs have been removed from non-thematic site rewards. Treants can still yield logs, and mining-themed families such as Golems and Goblins can still yield ore. This makes spider nests, boar territories, bandit camps, and similar sites feel more reliable for targeted material farming.',
  },
  {
    version: '0.56',
    date: '2026-04-27',
    title: 'Realm Rankings & World Activity',
    summary:
      'Realm Rankings are now public on the homepage and at /rankings, with all-time and weekly leaderboards, seasonal Hall of Fame archives, and Crown Collectors for weekly crown totals. Weekly crowns track top performers across player leaderboard categories. World chat now separates notable game activity from normal conversation: rare loot, craft crits, zone discoveries, achievements, and boss defeats can appear in a compact activity shelf, and nearby NPCs can react to relevant accomplishments.',
  },
  {
    version: '0.55',
    date: '2026-04-24',
    title: 'Security, Stash & Exploration Polish',
    summary:
      'Stashing an item from its card now removes or updates that card immediately instead of waiting for a refresh. The combat template picker is cleaner, hides undiscovered talent actions, and groups core combat choices separately from utility actions. Discovering a new zone exit now pauses exploration playback with a dedicated discovery modal. Security has been tightened across sessions, chat, guilds, bosses, casino, and exploration: chat access now follows your current zone/guild, password changes and logouts disconnect active sockets, registration has stronger abuse protection, and unrelated players see less private boss/casino/exploration detail. The wiki now includes Turns & Regeneration and updated Champion and exploration rules.',
  },
  {
    version: '0.54',
    date: '2026-04-24',
    title: 'Seasonal Realms Foundation',
    summary:
      'Pocketrealm now has the foundation for limited-time seasonal realms. Preseason characters continue separately, but when a season is opened you will be able to create a fresh seasonal character, switch between realms in Settings, and compete on season-specific leaderboards. Seasons now have their own starter content, Hall of Fame archives, end-of-season rewards, and merge support for carrying eligible progress back to Preseason. Seasons may not be open immediately, but the groundwork for fresh-start races and separate seasonal progression is now in place.',
  },
  {
    version: '0.53',
    date: '2026-04-20',
    title: 'Support Pocketrealm & Champion Perks',
    summary:
      'Support Pocketrealm is now live as a one-time purchase that grants 30 days of Champion time and stacks if you buy it again. Champion perks now properly apply across turn regeneration, backpack space, combat templates, crafting, gathering, hidden caches, and boss rewards. The settings screen now shows support purchase history, a clearer active Champion status, and a proper success confirmation after checkout. Champion titles also support reusable special styles, with the Support Pocketrealm Champion title now showing its rainbow effect anywhere player titles appear, including achievements, chat, arena, and leaderboards.',
  },
  {
    version: '0.52',
    date: '2026-04-17',
    title: 'Account Settings & Security',
    summary:
      'Settings is now split into separate Account and Game tabs, so account management no longer sits mixed in with gameplay preferences. You can now change your email address and password from inside the game, check whether your email is verified, and resend the verification email without leaving the settings screen. The email update flow also avoids a confusing error if you submit your current address unchanged.',
  },
  {
    version: '0.51',
    date: '2026-04-14',
    title: 'Exploration Family Tracking',
    summary:
      'Exploration now supports mob family tracking. Once you have discovered a family in a zone, you can toggle tracking on the exploration screen and focus your runs toward that family for better material farming, such as hunting spiders for silk. Tracking still respects zone tier unlocks, keeps non-family outcomes like resources and exits in the pool, and lowers total combat and site yield so normal exploration remains better for broad progression. Zone data now refreshes more reliably after exploration, and tracking gracefully falls back to normal behavior if a saved selection no longer applies to your current tier.',
  },
  {
    version: '0.50',
    date: '2026-04-14',
    title: 'Guild Economy & Quest QoL',
    summary:
      'Guild progression has been rebalanced to make group play smoother and more rewarding. Guild projects now rely on member contributions instead of draining the treasury, contracts pay out much larger rewards and now grant renown, expedition cooldowns are tracked per player instead of blocking the whole guild, and active-member boosts now scale more smoothly. Guilds also earn XP from boss participation, treasury capacity has been increased, and expedition requirements and costs have been retuned. On the quality-of-life side, quest completion notifications now appear immediately when you finish them, and overflow loot handling is more reliable when claiming rewards or moving on to travel.',
  },
  {
    version: '0.49',
    date: '2026-03-23',
    title: 'Early Leveling Rebalance',
    summary:
      'The XP curve for levels 1–9 has been flattened so new players progress faster through the opening zones. Level 2 now requires 80 XP (down from 400) and level 5 needs 1,250 XP (down from 2,500); level 10 and above are unchanged. Forest Edge mobs have received a small accuracy and damage buff to keep early fights engaging during quicker leveling.',
  },
  {
    version: '0.48',
    date: '2026-03-20',
    title: 'Encounter Site XP & Polish',
    summary:
      'Encounter sites now grant combat skill XP for every mob you defeat, matching the zone combat XP pipeline. XP is awarded when a room is cleared (not on defeat) and split by your weapon\'s attack skill. The combat history tab shows XP earned and full chest contents (rarity, materials, recipes) instead of a generic message. Chest rewards now properly merge with existing inventory stacks. The template quick-switch dropdown is available during manual combat rounds and between rooms. Fixed an issue where the Continue button was unclickable after skipping auto-resolve playback.',
  },
  {
    version: '0.47',
    date: '2026-03-20',
    title: 'Encounter Site Rework',
    summary:
      'Encounter sites have been completely rebuilt as multi-room dungeons. Each site is divided into rooms that you clear one at a time, choosing between auto-resolve (template-locked, earns a chest loot bonus) or manual round-by-round combat. HP, stamina, and mana carry between rooms but regenerate naturally while you\'re between fights. Splash Cascade makes missed attacks bounce to other enemies in the room, each re-rolling hit chance against a new target. Mobs decay over time — if all remaining rooms decay, the site auto-clears and you receive your chest reward. Chest rarity scales with room count: more rooms means better loot. Combat logs now show detailed hit breakdowns including accuracy rolls, dodge checks, and splash chains. Combat history tracks encounter room fights with source filtering. An activity lockout prevents starting other actions while you\'re mid-site.',
  },
  {
    version: '0.46',
    date: '2026-03-19',
    title: 'NPC Expansion & Zone-Aware Dialogue',
    summary:
      'Thornwall and Millbrook now have their own distinct NPCs. Crafting benches show the correct town\'s smith, artisan, or jeweller depending on where you are. Eight new characters join the world: Nella Sable (Millbrook artisan), Orin Facet (Millbrook jeweller), Dorren Ashforge (Thornwall blacksmith), Sera Voss (Thornwall artisan), Maren Glint (Thornwall jeweller), Callum Dross (Thornwall herbalist), and Sergeant Hale (Thornwall guard). Aldric Voss now runs the Quest Board, Bram Holloway comments on your sales in the Inventory, Gavrik greets you when joining a guild, and Captain Darrow watches over the Zone Map. A mysterious figure may occasionally appear during exploration. Nearly 200 items now have flavour text, covering all armor sets, resources, and consumables.',
  },
  {
    version: '0.45',
    date: '2026-03-19',
    title: 'Lore & Flavour Text',
    summary:
      "NPCs now have much more to say. Every shopkeeper, crafter, and guide in Millbrook has expanded dialogue with lines that rotate without repeating. Visit a zone often enough and NPCs will comment on where you've been. Three new settings toggles (NPC Dialogue, Item Flavour Text, Bestiary Lore) let you disable any flavour text you find distracting. Zone descriptions, NPC speech bubbles, and bestiary lore sections are now collapsible to keep the UI clean on smaller screens.",
  },
  {
    version: '0.44',
    date: '2026-03-18',
    title: 'Push Notifications',
    summary:
      "Stay in the loop even when you're away. The game now sends push notifications for PvP attacks, boss round results, world boss spawns, and guild expedition launches. Tapping a notification deep-links you straight to the relevant screen. Per-type notification preferences in Settings let you mute categories you don't care about, and notifications are automatically suppressed when the app is already in focus.",
  },
  {
    version: '0.43',
    date: '2026-03-16',
    title: 'UI Fixes & Quality of Life',
    summary:
      "Exploration's max turns button now correctly reflects the 2,500-turn cap instead of showing a hardcoded 5,000. The casino displays your bet count and max bet amount, disabling the button when you hit the limit. A new \"Forge Destruction Confirmation\" setting lets you choose which rarity threshold triggers a confirmation dialog. Item stats like magic power, ranged power, luck, crit chance, and crit damage now show properly in both Inventory and Equipment views.",
  },
  {
    version: '0.42',
    date: '2026-03-16',
    title: 'Performance Optimization',
    summary:
      'Combat, exploration, and gathering should all feel noticeably faster. Behind the scenes, the server now does roughly half as much work per fight by caching equipment stats, batching lookups, and running post-combat rewards in parallel. Encounter sites, ambushes, and PvP all benefit. Crafting and other actions now show a clear error message when something goes wrong instead of a generic "Internal Server Error". Fixed an issue where rapid actions could incorrectly trigger a "too many requests" error.',
  },
  {
    version: '0.41',
    date: '2026-03-15',
    title: 'Durability Overhaul',
    summary:
      'Equipment durability has been reworked to make gear maintenance a meaningful part of progression. Degradation is now 3x faster (items break in ~317 fights instead of ~950), and elite/prefixed mobs wear your gear down 50% faster than normal enemies. Repair costs now scale by item tier (T1: 50 turns up to T5: 150 turns) with a 1.5x surcharge for broken items. Each repair slightly reduces an item\'s max durability based on rarity: common gear loses up to 5 max durability per repair while legendary items lose only 1. When max durability hits zero, the item is permanently destroyed and unequipped. A warning appears when durability drops below 10%, and the repair modal shows destruction risk. Choose your battles wisely and keep your best gear in good shape.',
  },
  {
    version: '0.40',
    date: '2026-03-14',
    title: 'Security Hardening & Balance Pass',
    summary:
      'A major round of under-the-hood improvements. Dozens of race conditions, transaction gaps, and edge cases have been fixed across combat, crafting, travel, guilds, expeditions, and the casino to make the game more fair and resilient. On the balance side: the XP curve has been retuned, PvP no longer costs you gold or knocks you out, flee chances and combat values have been adjusted, resource regeneration now scales more smoothly, mana potions have a proper T1–T5 progression, and world boss and event tuning has been revisited. A batch of 14 smaller balance tweaks rounds things out.',
  },
  {
    version: '0.39',
    date: '2026-03-13',
    title: 'Talent Tree Rebalance & AoE Actions',
    summary:
      'The General talent tree has been reworked into the Survival tree, focused on combat durability instead of crafting bonuses. Every combat tree now unlocks an AoE action at Tier 2 (Cleave, Scatter Shot, Frost Nova) with stronger AoE upgrades at Tier 3 (Whirlwind, Volley, Blizzard). New mechanics: Crippling Shot pins enemies so they skip their next attack, Scatter Shot and Volley suppress enemy accuracy, and Rally grants a group-wide defence buff in raids. AoE damage multipliers have been reduced across the board to balance multi-target power. Chain Lightning has been removed and replaced by Blizzard. Survival tree highlights include Brace and Thick Skin for damage reduction, Second Wind for low-HP regeneration, Rally as a group support action, and the Bulwark capstone for combined HP and defence bonuses. The wiki combat actions page now shows full effect details (stat, modifier, duration) in the table.',
  },
  {
    version: '0.38',
    date: '2026-03-12',
    title: 'Game Wiki',
    summary:
      'A comprehensive public wiki is now available at /wiki with 31 pages covering every game mechanic in full detail. All formulas, constants, and calculations are pulled directly from the source code, so the wiki is always accurate and up to date. Sections cover Combat (damage, hit chance, crits, actions, buffs, defensive mechanics, mob prefixes), Bosses and Expeditions (encounters, threat, contribution, raids), PvP (combat differences, ELO rating), Progression (XP curves, efficiency caps, skill points), Resources (HP, stamina, mana, flee mechanics), Items (rarity, drop tables, forge, durability, inventory), Crafting (crit system, gathering, salvage), and Exploration (probability model, room generation, mob tiers, zone progression). The wiki uses the same RPG art style and pixel art as the game itself.',
  },
  {
    version: '0.37',
    date: '2026-03-12',
    title: 'Expedition Auto-Resolve & Attempt History',
    summary:
      'Officers and leaders can now auto-resolve an expedition room instantly before the first round fires. Your templates are locked for the duration, but you earn a 25% token bonus on a successful clear. An auto-advance toggle lets you fire rounds every 10 seconds without clicking. Expedition history now shows per-attempt logs: after a wipe, you can review the full round-by-round combat log for each attempt while the expedition is still active, not just after it ends. The taunt action now correctly drops its threat bonus when the 2-round duration expires instead of holding aggro permanently.',
  },
  {
    version: '0.36',
    date: '2026-03-12',
    title: 'Potions, Threat & Expedition UX',
    summary:
      'Three new potion types work in both solo combat and expeditions: Cleansing Potion removes stat debuffs and magic DOTs, Resist Potion buffs defence and magic defence, and Elixir of Power boosts attack damage. All potions trigger potion sickness. Conditional templates now fall back to the else-branch when a potion can\'t fire (sickness, empty stock, or nothing to cleanse) instead of wasting your turn. A new threat meter on boss encounters and expeditions shows who has aggro. Expedition round logs now show only the latest round between the enemy status and your party, with previous rounds collapsed below. No more scrolling past 30 rounds of history to see your team.',
  },
  {
    version: '0.35',
    date: '2026-03-11',
    title: 'Expedition Combat Polish',
    summary:
      'Monsters in expeditions now use the same mode-aware hit system as the rest of the game, so evasion tanks are viable in dungeon runs. Mob spells like root and fear force affected players to defend, and boss abilities like Rally and Summon Adds make late rooms more dynamic. DOT effects now tick properly between raid rounds, and effect pills throughout the UI are easier to read at a glance. Dungeon rooms show randomised theme names instead of generic tier labels.',
  },
  {
    version: '0.34',
    date: '2026-03-11',
    title: 'Guild Expeditions',
    summary:
      'Guilds can now launch multi-room dungeon expeditions. Sign up with your guildmates, then fight through themed rooms of increasing difficulty. Four Tier 1 themes are available at launch: Webwood Hollow, Fungal Depths, Verdant Ruins, and Ember Caverns, each with their own mob roster and flavour. Rooms scale in size and danger, ending with a boss encounter. Loot is distributed at the end based on contribution.',
  },
  {
    version: '0.33',
    date: '2026-03-10',
    title: 'Combat Balance Remediation',
    summary:
      'Hit chance now scales by combat mode, so open-world fights, PvP, and bosses can each be tuned separately. Early monsters should feel fairer to hit, dodge-heavy builds are less likely to create miserable nat-20-only fights in normal PvE, and anti-evasion counterplay is clearer when you need it. Starter combat has been smoothed out, the tutorial equip step now completes correctly after you equip your starter weapon, and the Wayfinder Buckler art has been added.',
  },
  {
    version: '0.32',
    date: '2026-03-09',
    title: 'First-Visit Tutorials & UI Polish',
    summary:
      'Seven new screens now greet you with a quick tutorial on your first visit: Guilds, Equipment, Bestiary, Achievements, Zone Map, World Events, and Quests. All tutorial and modal popups now render correctly in the centre of the screen instead of getting pushed off by scrollable content. The changelog no longer appears over the new-player tutorial on first login.',
  },
  {
    version: '0.31',
    date: '2026-03-08',
    title: 'Playback Overhaul & Multi-Hop Travel',
    summary:
      'Combat, exploration, and travel playback now share a unified replay surface that stays pinned at the top of the screen. No more scrolling to find your fight. The Arena, Training Grounds, Friends sparring, and encounter sites all use the same sticky playback region. Map travel supports multi-hop routes: click any discovered zone and the game auto-paths through intermediate zones, showing hop-by-hop travel playback with ambush encounters along the way. The map action area is now a top primary-action region with Explore and Travel always reachable, swapping into playback during travel.',
  },
  {
    version: '0.30',
    date: '2026-03-08',
    title: 'Quest Shop & Combat Buffs',
    summary:
      'Spend your hard-earned Quest Tokens at the new Quest Shop! Buy combat scrolls (Combat Power, Iron Skin, and Durability Shield) that boost your stats for a set number of fights. Reset your attributes, talents, or XP rate for a price. Teleport to any discovered zone, set a new home town, or reroll a guild contract you don\'t like. Unlock prestige titles tied to achievements. Use a Bestiary Tome to reveal mob prefix details you haven\'t discovered yet. Active buffs show as badges on combat, crafting, gathering, and forge screens so you always know what\'s boosting you. Forge Protection scrolls save your item on a failed upgrade. Forge Luck scrolls increase your success chance.',
  },
  {
    version: '0.29',
    date: '2026-03-07',
    title: 'Friends & Social',
    summary:
      'Add friends, send mail, and spar. Search for players by name (partial, case-insensitive) and send friend requests. View their profile (level, equipment, and online status). Challenge friends to a friendly spar for 200 turns: full combat with playback, no ELO or consequences. Losers get a cheeky system mail. Send text mail to friends for 25 gold (the game\'s first gold sink). Inbox, sent, compose with reply support. Block players to remove them from your friends list and hide yourself from their search results. The Guild tab is now a Social hub with Guild, Friends, and Mail sub-screens. An envelope icon in the header shows your unread mail count at a glance.',
  },
  {
    version: '0.28',
    date: '2026-03-06',
    title: 'Daily & Weekly Quests',
    summary:
      'A new quest system gives you a reason to log in every day. Three daily quests and one weekly quest are randomly assigned from 16 templates across combat, exploration, crafting, gathering, PvP, and casino. Targets scale with your level. Complete quests to earn Quest Tokens - a new currency for an upcoming exclusive shop. Finish all three dailies for a bonus payout. Don\'t like a quest? Use your free daily reroll to swap it. Progress toasts pop up in real-time as you fight, craft, gather, and explore. Quest availability respects game progression: PvP quests only appear once you\'ve unlocked the arena, prefix hunts require bestiary experience. All combat victories now count toward guild contracts and quests, including exploration and travel ambushes.',
  },
  {
    version: '0.27',
    date: '2026-03-06',
    title: 'Visual Overhaul',
    summary:
      'The entire UI has been refreshed with a fantasy RPG aesthetic. Almendra calligraphic font for headings and entity names, Silkscreen pixel font for game numbers, and Crimson Text for body text. Warmer torchlit colour palette replaces the old cool greys. Cards now have layered shadows, parchment texture, and optional gold framing with corner ornaments. A subtle noise grain and vignette add atmosphere. Stat bars shimmer and glow. HP bars shift from green to amber to red as health drops. Screen transitions fade and slide in, list items stagger on reveal, and combat victories pulse gold. Uncommon and rarer loot drops now trigger an animated reveal popup. The header sports an ornamental gold border and the bottom nav glows under the active tab. All animations respect prefers-reduced-motion.',
  },
  {
    version: '0.26',
    date: '2026-03-05',
    title: 'Per-Action Scaling & XP Splitting',
    summary:
      'Combat actions now scale independently. Power Strike always uses your melee skill and Fire Bolt always uses magic, regardless of which weapon you hold. Equip a staff and use melee talents? They\'ll hit based on your melee level and strength, not your magic. Combat XP is now split proportionally across the skills you actually use: a fight mixing Power Strike and Fire Bolt awards both melee and magic XP based on how much damage each dealt. 8 new cross-type talent actions let you blend combat styles. Flame Sword deals magic damage with melee scaling, Venomous Strike poisons with a melee hit, and Life Drain heals you while casting. DOT and HOT effects tick between rounds with snapshotted damage. Equipment accuracy is universal and boosts all action types equally.',
  },
  {
    version: '0.25',
    date: '2026-03-05',
    title: 'Conditional Templates & Combat Playback Polish',
    summary:
      'Combat templates now support if/then conditions. Set slots to trigger different actions based on HP, stamina, mana, or active buffs/debuffs. Resource bars during combat playback are now perfectly synced: stamina and mana update exactly when each action fires, not a round late. A visible regen phase between rounds shows bars ticking up so resource costs make sense. Bars start at your actual stamina/mana instead of flashing from full. Potion slots try the other template branch before falling back to Defend when potions run out. The combat log miss dropdown (showing roll, accuracy, dodge threshold) is back. It was broken by a stale field name.',
  },
  {
    version: '0.24',
    date: '2026-03-04',
    title: 'Smarter Durability',
    summary:
      'Equipment durability now degrades per hit instead of per fight. Weapons lose 0.01 durability for each attack you land, and armour loses 0.01 for each hit you take, even blocked ones. A quick skirmish with a field mouse barely scratches your gear, while a drawn-out boss fight leaves a mark.',
  },
  {
    version: '0.23',
    date: '2026-03-02',
    title: 'Combat Rework: Templates, Resources & Skill Trees',
    summary:
      'Combat is no longer auto-attack. Build combat templates: ordered action rotations that your character follows each fight. Stamina and mana fuel your actions; run out and you fall back to Defend. A new Skill Tree lets you spend points earned from levelling to unlock 24 powerful abilities across Melee, Ranged, Magic, and General trees. Resource bars show HP, stamina, and mana on the Explore and Combat screens with values embedded inside the bars. Combat playback now shows action names, resource costs, and interaction results like Countered! and Warded!',
  },
  {
    version: '0.22',
    date: '2026-03-02',
    title: 'Boss Encounters & PvP Rework',
    summary:
      'Boss encounters now use individual HP per participant instead of a shared raid pool. A new threat system determines who the boss targets. Deal more damage, draw more aggro. Boss loot is distributed by contribution score. PvP uses your combat template so fights play out action-by-action. Scout notifications tell you when someone is sizing you up. The bestiary progressively reveals boss attack rotations as you fight them.',
  },
  {
    version: '0.21',
    date: '2026-03-02',
    title: 'Casino & Training Grounds',
    summary:
      'A brand new Casino has opened in every town! Exchange turns for gold and play roulette against other players. Bet on numbers, colours, corners, and more. Watch chips pile up on the board in real-time, chat with fellow gamblers, and celebrate wins with a gold coin shower. The dealer announces results and calls out big winners. A Hot/Cold stats panel shows which numbers are running hot or cold over the last 200 spins. Casino leaderboards track total profit and wagered volume. 10 new casino achievements reward your gambling career. The Training Grounds let you practice against any monster from your bestiary with mob prefix variants, no turn cost, no risk. Both screens include first-visit how-to guides.',
  },
  {
    version: '0.20',
    date: '2026-03-01',
    title: 'Inventory & Backpack System',
    summary:
      'Your inventory is no longer bottomless. A new backpack equipment slot determines your carrying capacity. Craft or find better backpacks to carry more. Items have sell prices and can be sold to vendors in town for gold. A new Stash in every town lets you store items you want to keep safe. Crafting pulls materials from both your backpack and stash, so you can safely store bulk materials without worrying about recipe availability. When loot drops exceed your capacity, a Loot Picker lets you choose which items to claim. Traveling or exploring with a full backpack warns you about pending loot. A "Confirm Before" setting in Settings lets you choose which item rarity triggers a confirmation dialog on drop, salvage, or sell. No more accidentally destroying your epics.',
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
      'Forge upgrade and salvage costs now scale with your crafting skill. Costs drop 20% per level above the recipe requirement, and at 5+ levels above it\'s free. A new Salvage Mode lets you multi-select items and salvage them all in one batch. The Forge sacrifice picker is now collapsed by default for a smoother mobile experience. The Salvage button shows the actual turn cost, and a tutorial popup explains the forge on your first visit.',
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
      'The old "efficiency" system has been renamed to "XP Rate" and is now visible on every screen where you earn XP: Skills, Gathering, Crafting, Exploration, and Combat. Higher-level gathering nodes now award more XP per action. All skills (including combat) use a gradual decay curve instead of the old all-or-nothing cutoff. A one-time tutorial explains the mechanic the first time your rate drops. Error messages now auto-scroll into view so you never miss them.',
  },
  {
    version: '0.15',
    date: '2026-02-25',
    title: 'World Events Overhaul',
    summary:
      'World events are now much more visible. Event badges appear on gathering nodes, encounter sites, and combat logs so you always know what modifiers are active. Spawn rate events affect exploration ambush and encounter site rates. Per-zone event caps keep things balanced.',
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
      'Combat logs now load lazily. Exploration and encounter site responses are much lighter, with logs fetched on demand during playback. HTTP compression reduces API payload sizes. Auto-skip works on travel and exploration ambushes. Double-click protection on the explore button. Death tracking for boss and PvP knockouts.',
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
      'Guilds are here! Create or join a guild, take on weekly bounty contracts, and collaborate on guild projects. Plus a new Jewelcrafting skill. Find gems while gathering and craft rings, necklaces, and charms. The landing page got a full redesign with zone showcases and a monster parade.',
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
      'Nearly 100 achievements to earn across combat, gathering, crafting, and exploration. Encounter sites now have room-based progression. Fight through multiple rooms for a full-clear bonus chest. Mob icons appear everywhere.',
  },
  {
    version: '0.7',
    date: '2026-02-19',
    title: 'Leaderboards & Zone Progression',
    summary:
      'Compete on leaderboards across multiple categories. Zones now track your exploration progress. Unlock tougher mobs as you explore deeper into each area.',
  },
  {
    version: '0.6',
    date: '2026-02-17',
    title: 'PvP Arena & World Bosses',
    summary:
      'Challenge other players in the PvP arena with Elo-based matchmaking. World bosses spawn during events. Rally together to take them down for trophies, loot, and unique recipes.',
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
      'Explore a connected world map and travel between zones, but watch out for ambushes. Combat and exploration play out with animated HP bars and progress tracking. Magic defence and durability systems added.',
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
