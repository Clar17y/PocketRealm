### Turn Economy
- 1 turn/second regeneration
- 64,800 bank cap (18 hours)
- 86,400 starting turns for new players
- Lazy calculation: compute turns on request, not via cron
- Redis stores `last_regen_at` timestamp per player

### Combat Resolution
- Server-authoritative, instant resolution (max 100 rounds)
- D&D-style: d20 + modifiers vs defense
- Pure functions in `packages/game-engine` for testability
- Returns full combat log for client playback animation
- Mob prefix system for variant difficulty
- Combat templates for saved encounter strategies
- Boss encounters with multi-player signup and round-based resolution

### Exploration
- Per-turn probability model: `1 - (1 - p)^n`
- Player chooses turn investment via slider (10-10,000 turns)
- Room-based encounter sites with tier scaling
- Outcomes: ambush encounters, encounter sites (small/medium/large), resource nodes, treasure chests, zone exits

### Crafting & Items
- Crit system: base chance + skill level + luck stat
- Item rarity progression: common > uncommon > rare > epic > legendary
- Forge upgrade/reroll with sacrificial items
- Salvage for partial material refund (batch supported)
- Equipment durability with repair costs and max durability decay
- Inventory capacity limits with stash storage
- Item selling with bulk sell support

### HP & Resources
- Base HP + vitality scaling (5 HP per vitality)
- Passive regen: 0.4 HP/second
- Rest: spend turns for HP recovery
- Knockout/recovery state with turn cost to exit
- Stamina and mana as secondary resources

### Zone System
- Directed graph of zone connections
- Wild and town zones (crafting only in towns)
- Travel costs turns; breadcrumb free return
- Zone discovery and zone exploration progress tracking

### Auth
- Custom JWT (access + refresh tokens)
- Access token: 15 min expiry (configurable via `ACCESS_TOKEN_TTL_MINUTES`)
- Refresh token: 30 days sliding expiry (configurable via `REFRESH_TOKEN_TTL_DAYS`), rotated on refresh and stored in DB
- No external auth provider dependency

### Guild System
- Guild creation, membership, join requests
- Role hierarchy: leader, officer, member
- Guild upgrades, specializations, projects, contracts
- Tax system, activity logging

### PvP Arena
- ELO-based matchmaking and rating
- Scout opponents before challenging
- Match history and notifications

### World Events & Bosses
- Timed world events with zone modifiers
- Boss encounters with multi-player signup
- Round-based boss resolution with contribution tracking

### Casino
- Roulette with Socket.IO real-time rounds
- Token exchange system
