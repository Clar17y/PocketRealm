Prisma schema at `packages/database/prisma/schema.prisma` (1358 lines, 75 models, 97 migration directories).

To refresh these counts:

```powershell
(Get-Content packages/database/prisma/schema.prisma | Measure-Object -Line).Lines
(Select-String -Path packages/database/prisma/schema.prisma -Pattern '^model ' | Measure-Object).Count
(Get-ChildItem packages/database/prisma/migrations -Directory | Measure-Object).Count
```

**Model groups:**
- **Auth:** Account, Player, RefreshToken, EmailVerificationToken, PasswordResetToken
- **Premium:** PremiumPurchase
- **Seasons:** Season, SeasonArchive, HallOfFameEntry, SeasonRewardTier
- **Turns:** TurnBank (lazy regen)
- **Progression:** PlayerSkill, SkillPointAllocation, PlayerStats
- **Buffs:** PlayerBuff
- **Items:** ItemTemplate, Item (with rarity, bonus stats, durability)
- **Equipment:** PlayerEquipment (11 slots)
- **Zones:** Zone, ZoneConnection, PlayerZoneDiscovery, PlayerZoneExploration
- **Combat:** MobTemplate, MobFamily, MobFamilyMember, ZoneMobFamily, DropTable
- **Combat Templates:** CombatTemplate, CombatTemplateSlot
- **Bestiary:** PlayerBestiary, PlayerBestiaryPrefix, PlayerExpeditionBestiary
- **Gathering:** ResourceNode, PlayerResourceNode
- **Crafting:** CraftingRecipe, PlayerRecipe, ChestDropTable
- **Exploration:** EncounterSite, ActivityLog
- **Chat:** ChatMessage, ChatActivity, PlayerNpcActivityReaction
- **PvP:** PvpRating, PvpMatch, PvpCooldown, PvpScoutLog
- **Boss:** BossEncounter, BossParticipant, PersistedMob, PlayerBossRotation
- **World Events:** WorldEvent
- **Achievements:** PlayerAchievement
- **Crowns & Leaderboards:** PlayerCrown
- **Guilds:** Guild, GuildMember, GuildUpgrade, GuildProject, GuildProjectContribution, GuildContract, GuildLog, GuildJoinRequest
- **Guild Expeditions:** GuildExpedition, GuildExpeditionMember, ExpeditionCooldown
- **Friends & Mail:** Friendship, PlayerBlock, FriendMail
- **Notifications:** PushSubscription
- **Diagnostics:** ApiLatencySnapshot
- **Casino:** RouletteRound, RouletteBet
- **Quests:** PlayerQuest, PlayerQuestState
- **Shop:** ShopItem, PlayerShopPurchase

**Equipment Slots (11):** head, neck, chest, gloves, belt, legs, boots, main_hand, off_hand, ring, charm
