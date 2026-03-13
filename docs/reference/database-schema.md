Prisma schema at `packages/database/prisma/schema.prisma` (~1022 lines, 50 models, 61 migrations).

**Model groups:**
- **Auth:** Player, RefreshToken
- **Turns:** TurnBank (lazy regen)
- **Progression:** PlayerSkill, SkillPointAllocation, PlayerStats
- **Items:** ItemTemplate, Item (with rarity, bonus stats, durability)
- **Equipment:** PlayerEquipment (11 slots)
- **Zones:** Zone, ZoneConnection, PlayerZoneDiscovery, PlayerZoneExploration
- **Combat:** MobTemplate, MobFamily, MobFamilyMember, ZoneMobFamily, DropTable
- **Combat Templates:** CombatTemplate, CombatTemplateSlot
- **Bestiary:** PlayerBestiary, PlayerBestiaryPrefix
- **Gathering:** ResourceNode, PlayerResourceNode
- **Crafting:** CraftingRecipe, PlayerRecipe, ChestDropTable
- **Exploration:** EncounterSite, ActivityLog
- **Chat:** ChatMessage
- **PvP:** PvpRating, PvpMatch, PvpCooldown, PvpScoutLog
- **Boss:** BossEncounter, BossParticipant, PersistedMob, PlayerBossRotation
- **World Events:** WorldEvent
- **Achievements:** PlayerAchievement
- **Guilds:** Guild, GuildMember, GuildUpgrade, GuildProject, GuildProjectContribution, GuildContract, GuildLog, GuildJoinRequest
- **Casino:** RouletteRound, RouletteBet

**Equipment Slots (11):** head, neck, chest, gloves, belt, legs, boots, main_hand, off_hand, ring, charm
