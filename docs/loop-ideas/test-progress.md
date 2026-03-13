# Test Gap Coverage Progress

## Completed

### dropRollingService.ts (2026-03-13)
- **File:** `apps/api/src/services/dropRollingService.ts`
- **Test file:** `apps/api/src/services/dropRollingService.test.ts`
- **Status:** 38 tests, all passing
- **Previously untested:** Yes (no test file existed)
- **Coverage areas:**
  - `decimalLikeToNumber` (13 tests): plain numbers, NaN, Infinity, -Infinity, null, undefined, strings, Prisma Decimal-like objects, edge cases
  - `createLootAccumulator` (6 tests): empty state, single add, merge quantities, separate templates, immutability, bulk adds
  - `rollAndGrantDropsTx` (19 tests): empty drops, zero rolls, stackable item granting, rarity propagation, quantity accumulation, weapon/armor durability, non-equipment null durability, quantity clamping, slot tracking with existing stacks, slot reuse for same stackable, overflow for stackable/non-stackable, partial fill + overflow, unknown template name fallback, slotsConsumed calculation with/without availableSlots

### combatHelpers.ts (2026-03-13)
- **File:** `packages/game-engine/src/combat/combatHelpers.ts`
- **Test file:** `packages/game-engine/src/combat/combatHelpers.test.ts`
- **Status:** 33 tests, all passing
- **Previously untested:** Yes (no test file existed)
- **Coverage areas:**
  - `resolveParticipantActions` (8 tests): skip dead participants, action resolution with state mutation, exhaustion info recording, alternateAction storage, multiple participants with dead filtering, template slot normalisation (with/without id field), intendedActionId fallback
  - `resolveSupportiveActions` — heal_self (7 tests): healFlat + healPercent calculation, max HP cap, zero heal at full HP, heal threat generation, dead participant skip, non-supportive action skip, undefined healFlat/healPercent defaults
  - `resolveSupportiveActions` — heal_ally (6 tests): manual target healing, auto-target lowest HP ally, fallback to self when all allies dead, fallback when manual target dead, heal cap at target maxHp, heal threat for healer
  - `resolveSupportiveActions` — mixed (3 tests): only supportive actions processed, null actionDef handling, multiple healers in same round
  - `applyResourceCosts` (9 tests): stamina/mana deduction, exhausted action skips cost, resource cap after regen, null actionDef regen-only, templateRound advancement, dual resource costs, negative stamina from expensive action, multiple participants independently, zero regen

### guildMembershipService.ts (2026-03-13)
- **File:** `apps/api/src/services/guildMembershipService.ts`
- **Test file:** `apps/api/src/services/guildMembershipService.test.ts`
- **Status:** 70 tests, all passing
- **Previously untested:** Yes (no dedicated test file; guildService.test.ts had partial coverage of some functions)
- **Coverage areas:**
  - `joinGuild` (11 tests): player not found, already in guild, below global join level, guild not found, closed recruitment, request_to_join recruitment, guild-specific min level, guild full, happy path join, member role creation, guild XP grant
  - `leaveGuild` (4 tests): not in guild, leader cannot leave, successful leave with log, officer can leave
  - `requestJoinGuild` (12 tests): player not found, already in guild, below global join level, guild not found, open guild rejects request, closed guild rejects request, guild full, guild-specific min level, pending request duplicate, re-request after rejection via upsert, fresh request creation, zero min level with global check
  - `getJoinRequests` (5 tests): officer from different guild, regular member rejected, pending requests with player info, empty results, leader can view
  - `respondToJoinRequest` (8 tests): not in guild, regular member rejected, request not found, accept creates membership, accept when guild full, accept when guild null, applicant already in another guild auto-rejects, reject marks status and logs, reject does not create member
  - `kickMember` (8 tests): self-kick, regular member insufficient role, target not found, target in different guild, target is leader, officer vs officer, leader kicks officer, officer kicks member
  - `promoteMember` (6 tests): not leader, target not found, target in different guild, already officer, target is leader, happy path promote
  - `demoteMember` (6 tests): not leader, target not found, target in different guild, target is member, target is leader, happy path demote
  - `transferLeadership` (5 tests): not leader, target not found, target in different guild, role swap verification, transfer to member
  - `disbandGuild` (4 tests): not leader, not in guild, wrong guild ID, successful deletion

### combatOrchestrationService.ts (2026-03-13)
- **File:** `apps/api/src/services/combatOrchestrationService.ts`
- **Test file:** `apps/api/src/services/combatOrchestrationService.test.ts`
- **Status:** 56 tests, all passing (was 14 tests covering only `splitAndGrantXp`)
- **Previously under-tested:** Yes (348-line source, only 145-line test covering 1 of 5 exported functions)
- **New coverage areas (42 new tests):**
  - `splitAndGrantXp` — new edge cases (4 tests): 0 XP with contributing skill, guildXpBoost of 0 becomes undefined, ranged fallback, resource-only multi-skill proportional split
  - `buildPlayerTemplateCombatant` (8 tests): all fields populated, always-available actions present with empty unlocks, talent actions excluded when not unlocked, talent actions included when unlocked, unknown action IDs ignored, perActionScaling pass-through, perActionScaling omitted when absent, multiple melee/ranged/magic talents simultaneously
  - `applyGuildCombatModifiers` (9 tests): no-op with zero modifiers, 10% damage boost, 5% defense boost on both defence and magicDefence, simultaneous damage+defense boost, fractional rounding, in-place mutation, 100% boost (2x), zero base stats with modifiers, unrelated stat fields unchanged
  - `buildCombatLogResult` (7 tests): complete field mapping, mapTemplateCombatLog delegation, potionsConsumed inclusion/omission, null mob prefix/displayName, rewards object preservation, empty event modifiers
  - `processCombatVictoryRewards` (14 tests): basic victory loot+XP, rollAndGrantLootWithCapacity param passing, negative xpReward clamped to 0, bestiary recording default/true/false, guild XP grant when in guild, no guild XP when no guild, kill_count+kill_family progress tracking, kill_prefix tracking with/without prefix, quest progress aggregation from multiple trackProgress calls, overflow items + pending loot session, guildXpBoost pass-through, damage tracking data forwarded to XP split, 0 xpReward graceful handling

### pvpCombatantBuilder.ts (2026-03-13)
- **File:** `apps/api/src/services/pvpCombatantBuilder.ts`
- **Test file:** `apps/api/src/services/pvpCombatantBuilder.test.ts`
- **Status:** 34 tests, all passing
- **Previously untested:** Yes (no test file existed)
- **Coverage areas:**
  - `getAttackStyle` (9 tests): no weapon equipped returns melee, weapon with no template/no item returns melee, requiredSkill melee/ranged/magic each return correctly, unrecognised requiredSkill (e.g. mining) falls back to melee, null requiredSkill returns melee, undefined requiredSkill returns melee
  - `buildPvpCombatant` — data fetching (3 tests): player attributes fetched and normalized, parallel queries for equipment/template/skillPoints, all four skill levels queried (melee/ranged/evasion/magic)
  - `buildPvpCombatant` — attack style → skill level mapping (3 tests): melee weapon uses melee level, ranged weapon uses ranged level, magic weapon uses magic level
  - `buildPvpCombatant` — useCurrentResources=false / defender ghost (4 tests): maxHp used for both hp args, stamina/mana calculated from skill levels, stamina=maxStamina and mana=maxMana, getHpState/getResourceState NOT called
  - `buildPvpCombatant` — useCurrentResources=true / attacker (3 tests): live HP from getHpState, live stamina/mana from getResourceState, calculateMaxStamina/calculateMaxMana NOT called
  - `buildPvpCombatant` — delegation to buildPlayerTemplateCombatant (3 tests): correct params for defender, correct params for attacker, return value forwarded
  - `buildPvpCombatant` — calculateMaxHp inputs (2 tests): vitality from normalized attributes, equipment health bonus
  - `buildPvpCombatant` — regen calculations (2 tests): skill levels forwarded to calculateStaminaRegenPerRound, magic level forwarded to calculateManaRegenPerRound
  - `buildPvpCombatant` — stat forwarding (2 tests): equipment stats to buildPlayerCombatStats, normalized attributes to buildPlayerCombatStats
  - `buildPvpCombatant` — edge cases (3 tests): no weapon defaults to melee, zero skill levels handled, player not found error propagates

### lootService.ts (2026-03-13)
- **File:** `apps/api/src/services/lootService.ts`
- **Test file:** `apps/api/src/services/lootService.test.ts`
- **Status:** 49 tests, all passing (was 5 tests covering only `rollAndGrantLoot` happy paths)
- **Previously under-tested:** Yes (159-line source with 3 exported functions, only 98-line test covering 1 function with 5 basic cases)
- **New coverage areas (44 new tests):**
  - `rollAndGrantLoot` — new cases (2 tests): Infinity capacity prevents overflow, dropChanceMultiplier forwarded to rollDropRarity
  - `rollAndGrantLootWithCapacity` — capacity and overflow (10 tests): capacityOverride skips getInventoryState, getInventoryState called without override, non-stackable overflow at capacity, stackable overflow when no existing stack, stackable merges into existing stack at full capacity, pending loot session creation, null sessionId when no overflow, slot tracking across multiple items, slotsUsed increment for new stackable, no increment for existing stacks
  - `rollAndGrantLootWithCapacity` — stackable items (3 tests): addStackableItem params, always common rarity, quantity preserved in drop
  - `rollAndGrantLootWithCapacity` — non-stackable equipment (8 tests): weapon item.create data, armor item.create data, per-item creation for quantity > 1, independent rarity rolls, rollBonusStatsForRarity params, null bonusStats → undefined in DB, non-equipment skips rarity/bonus rolls, null durability for non-equipment
  - `rollAndGrantLootWithCapacity` — drop chance mechanics (6 tests): chance > 1 clamped, negative chance clamped to 0, random == chance skips (boundary), random < chance succeeds, zero quantity skip, negative quantity skip
  - `rollAndGrantLootWithCapacity` — multiple entries (3 tests): all entries processed independently, mixed success/failure, partial overflow with pending loot
  - `rollAndGrantLootWithCapacity` — overflow shape (2 tests): equipment overflow includes rarity/bonusStats/durability, stackable overflow has null bonusStats/durability
  - `rollAndGrantLootWithCapacity` — getInventoryState integration (1 test): starts from current usedSlots
  - `enrichLootWithNames` (9 tests): empty input returns empty, existing itemName preserved (no DB query), DB fetch for missing names, template ID deduplication, null for unknown templates, mixed named/unnamed items, quantity/rarity preserved, undefined rarity handled, null vs empty string itemName behavior (documents ?? vs || edge case)

### buffService.ts (2026-03-13)
- **File:** `apps/api/src/services/buffService.ts`
- **Test file:** `apps/api/src/services/buffService.test.ts`
- **Status:** 56 tests, all passing (was 10 tests covering only 5 of 12 exported functions)
- **Previously under-tested:** Yes (182-line source with 12 exports, only 124-line test covering 5 functions)
- **Existing tests preserved (10 tests):** getActiveBuffs (2), getBuffValue (2), hasActiveBuff (2), consumeBuff (2), consumeBuffIfActive (3)
- **New coverage areas (46 new tests):**
  - `getActiveBuffs` — new (1 test): maps multiple buffs preserving order
  - `consumeBuff` — new edge case (1 test): deletes buff when remaining uses goes negative
  - `consumeBuffIfActive` — new edge case (1 test): does not call update or delete when buff not found
  - `getCombatBuffs` (6 tests): all three combat buff values present, defaults missing buffs to 0, all zeros when no buffs, correct query filter, only defence present, only durability shield present
  - `getCombatBuffsWithUses` (5 tests): all three types with values and uses, defaults to 0 when no buffs, partial buffs (only damage), correct query filter with remainingUses, single remaining use edge case
  - `consumeBuffChargesPerMob` (5 tests): consumes all three when all have uses, skips buffs with 0 uses, consumes only damage when others 0, consumes only durability when others 0, mutates uses object in place
  - `applyCombatBuffs` (10 tests): damage boost, defence boost, both simultaneously, no-op when 0, fractional damage flooring, fractional defence flooring, in-place mutation, 100% boost doubles values, zero base stats, small fractional boost on small values
  - `consumeCombatBuffs` (5 tests): all three active, skips damage when 0, skips defence when 0, skips durability when 0, no-op when all 0
  - `consumeBuffStandalone` (3 tests): wraps in $transaction, handles missing buff, deletes on last use
  - `buildCombatBuffBadges` (8 tests): empty array when no buffs, damage badge, defence badge, durability badge, all three badges, correct order, isGlobal/appliedToThisMob flags, exact effectValue pass-through

### zoneDiscoveryService.ts (2026-03-13)
- **File:** `apps/api/src/services/zoneDiscoveryService.ts`
- **Test file:** `apps/api/src/services/zoneDiscoveryService.test.ts`
- **Status:** 46 tests, all passing (was 7 tests covering 3 of 7 exported functions)
- **Previously under-tested:** Yes (214-line source with 7 exports, only 100-line test covering 3 functions)
- **Existing tests preserved (7 tests):** ensureStarterDiscoveries (3), discoverZonesFromTown (1), respawnToHomeTown (3)
- **New coverage areas (39 new tests):**
  - `ensureStarterDiscoveries` — new edge cases (4 tests): multiple starter zones, overlapping connections from multiple starters deduplication, starter zone with no connections, correct playerId pass-through
  - `ensureStarterEncounterAndNodes` (15 tests): no starter town exits early, no connections exits early, no connected wild zone exits early, creates both ore and log resource nodes, creates only ore when log missing, skips nodes player already has (both), skips when player has one of two, skips when no resource nodes in zone, skips encounter site when player already has one, skips encounter when no mob family, skips encounter when Field Mouse not found, creates encounter site with correct name/data, full setup with nodes and encounter, queries Field Mouse with correct zone filter, queries zoneMobFamily with discoveryWeight ordering
  - `discoverZonesFromTown` — new (4 tests): deduplicates self-connection, returns only town when no connections, uses skipDuplicates, handles multiple connections
  - `discoverZone` (2 tests): creates discovery with skipDuplicates, handles duplicate gracefully
  - `getDiscoveredZoneIds` (3 tests): returns Set of IDs, empty Set when none discovered, correct playerId filter
  - `getStarterZoneId` (3 tests): returns starter zone ID, throws when none configured, queries with isStarter filter
  - `respawnToHomeTown` — new (2 tests): clears lastTravelledFromZoneId, uses zone ID from findUniqueOrThrow
  - `getUndiscoveredNeighborZones` (6 tests): filters out discovered zones, empty when all discovered, empty when no connections, returns all when none discovered, queries from correct zone, parallel execution of connection and discovery lookups

### eventSchedulerService.ts (2026-03-13)
- **File:** `apps/api/src/services/eventSchedulerService.ts`
- **Test file:** `apps/api/src/services/eventSchedulerService.test.ts`
- **Status:** 40 tests, all passing (was 5 tests covering only `checkAndSpawnEvents` high-level flow)
- **Previously under-tested:** Yes (354-line source with 7 internal functions, only 116-line test covering 1 exported function with 5 basic cases)
- **Existing tests preserved (5 tests):** throttling, expireStaleEvents/checkAndResolveDueBossRounds calls, respawn cooldown, world event cap, zone event cap
- **New coverage areas (35 new tests):**
  - `checkAndSpawnEvents` — new (1 test): correct cooldown cutoff query with EVENT_RESPAWN_DELAY_MINUTES
  - Expired event messages (5 tests): world-scope message per expired event, zone-scope additional message for zone events, "the world" fallback for null zoneName, no zone message for world-wide events, io parameter forwarding
  - `trySpawnWorldWideEvent` (8 tests): successful spawn with family resolving, world cap enforcement, player zone querying, wild zone filtering (excludes towns), resolveTarget null when no families/resources, no system message when spawnWorldEvent returns null, WORLD_WIDE_EVENT_DURATION_HOURS, {target} placeholder replacement, targetFamily in spawn params
  - `trySpawnZoneEvent` (7 tests): skip when no wild zones, free zone preference, effectType conflict filtering, world+zone system messages on success, no messages when spawnWorldEvent null, zone duration values, fallback to all zones when all have events
  - `trySpawnBoss` (7 tests): successful boss spawn with bossBaseHp, fallback to mob hp when bossBaseHp null, MAX_BOSS_ENCOUNTERS cap, no boss mobs for zone families, spawnWorldEvent null prevents encounter creation, boss short-circuits zone event, mob template query with isBoss filter
  - `resolveTarget` (2 tests): resource targeting with targetResource set, zone targeting without DB lookups
  - IO parameter forwarding (2 tests): io to checkAndResolveDueBossRounds, io to emitSystemMessage for boss spawn
  - Edge cases (4 tests): empty expired events, mixed world/zone expired events, 50/50 coin flip boundary at 0.5, coin flip at 0.49

### chestService.ts (2026-03-13)
- **File:** `apps/api/src/services/chestService.ts`
- **Test file:** `apps/api/src/services/chestService.test.ts`
- **Status:** 41 tests, all passing (was 4 tests covering only basic happy paths)
- **Previously under-tested:** Yes (136-line source with complex branching, only 83-line test covering 4 basic cases)
- **Existing tests replaced and expanded (37 new tests):**
  - Basic flow (3 tests): empty loot from no drop entries, correct chestDropTable query params, loot from drop table entries
  - Chest rarity based on size (3 tests): small→common, medium→uncommon, large→rare
  - Full clear bonus (7 tests): small→medium upgrade, medium→large upgrade, large caps at large, no upgrade when false, no upgrade when undefined, DROP_MULTIPLIER applied to material rolls, upgraded rarity in drop table query
  - Recipe unlock (12 tests): roll failure returns null, no advanced recipe query when roll fails, successful unlock with unknown recipes, playerRecipe creation, skip when all known, null when no advanced recipes, picks from unknown only, correct mob family query, RECIPE_MULTIPLIER with fullClearBonus, soulbound falsy→false conversion, soulbound true preservation, 0% chance for small encounters
  - Material rolls (4 tests): small/medium/large range validation, full clear multiplier with ceiling
  - Loot accumulation (3 tests): addStackableItemTx called, same-template aggregation, common rarity
  - Available slots and overflow (4 tests): availableSlots pass-through, overflow at 0 slots, no slot tracking without availableSlots, overflow item shape
  - Recipe unlock for medium (1 test): medium encounters trigger recipe unlock
  - Full clear + recipe combined (1 test): upgraded size for both rarity and recipe chance
  - Edge cases (3 tests): empty drop table with large rolls, multiple weighted entries, known recipe player filter

### guildTaxService.ts (2026-03-13)
- **File:** `apps/api/src/services/guildTaxService.ts`
- **Test file:** `apps/api/src/services/guildTaxService.test.ts`
- **Status:** 49 tests, all passing (was 6 tests covering only 2 of 8 exported functions)
- **Previously under-tested:** Yes (150-line source with 8 exports, only 99-line test covering `applyGuildTaxTx` and `applyGuildTax`)
- **Existing tests replaced and expanded (43 new tests):**
  - `getPlayerTaxRateTx` (4 tests): no membership returns 0/null, guild tax rate 0 returns 0/null, guild with tax returns rate/guildId, correct query shape with include
  - `getPlayerTaxRate` (2 tests): delegates through $transaction, returns guild tax rate through transaction
  - `calculateInflatedCost` (9 tests): 0% tax passthrough, negative tax passthrough, 10% tax (ceil(100/0.9)=112), 20% tax (ceil(100/0.8)=125), 5% tax fractional, 50% tax, base cost 0, base cost 1 with small tax, large values
  - `calculateEffectiveTurns` (8 tests): 0% tax passthrough, negative tax passthrough, 10% tax (floor(1000*0.9)=900), 20% tax, fractional floor, 0 turns, 100% tax yields 0, large values
  - `taxInfoFromResult` (4 tests): null when guildId is null, null when taxAmount is 0, TaxInfo when both present, large values
  - `spendWithTaxTx` (8 tests): baseCost=0 short-circuit, negative baseCost short-circuit, throw when turn bank not found for baseCost=0, calculateCurrentTurns/calculateTimeToCapMs calls, inflated cost with guild tax, base cost without guild, turnSpend result forwarding, 20% tax inflated cost verification
  - `applyGuildTaxTx` — new (7 tests): treasury at cap skips DB update, tax rounds to 0 skips DB update, guildMember contribution stats update, calculateTreasuryCap called with guild level, exact tax deposit with room, taxRatePercent from membership, correct query shape
  - `applyGuildTax` — new (1 test): returns full tax result when guild has tax

### pvpService.ts (2026-03-13)
- **File:** `apps/api/src/services/pvpService.ts`
- **Test file:** `apps/api/src/services/pvpService.test.ts`
- **Status:** 76 tests, all passing (was 28 tests)
- **Previously under-tested:** Yes (698-line source with 13 exported functions, only 561-line test covering basic paths of 11 functions)
- **New coverage areas (48 new tests):**
  - `getOrCreateRating` — new (1 test): returns existing rating when player already has one
  - `getLadder` — new (4 tests): admin bypasses cooldown checks (no pvpCooldown.findMany call), title resolution from activeTitle, isAdmin flag on opponents, bracket range query verification
  - `scoutOpponent` — new (6 tests): SCOUT_TURN_COST spending after validation, ranged attack style from main hand weapon, magic attack style from main hand weapon, melee default with no main hand, armor class from chest piece, armorClass defaults to none, null zone throws
  - `challenge` — new edge cases (19 tests): attacker not found, attacker below MIN_CHARACTER_LEVEL, on cooldown (non-admin), admin bypasses cooldown, target not found, target below minimum level, target outside rating bracket, revenge match detection with reduced REVENGE_TURN_COST, normal turn cost when not revenge, draw outcome (winnerId=null/isDraw=true), zero ELO changes when attacker is admin, zero ELO changes when defender is admin, admin skips cooldown upsert, knockout state on defeat (enterRecoveringState + trackAchievements), escape outcome (setHp called), bot defender skips durability degradation, human defender gets durability degradation, attacker start HP/stamina/mana in response, buildPvpCombatant useCurrentResources flags, combatMode pvp passed, getAttackStyle called for both, durability info in response, winner is target on defeat, expired cooldown does not block
  - `getHistory` — new (3 tests): queries OR clause for attacker/defender, serializes createdAt to ISO string, returns empty matches
  - `getMatchDetail` — new (3 tests): allows defender to view match, serializes createdAt to ISO string, isRevenge preserved
  - `getNotificationCount` — new (1 test): returns 0 when no unread
  - `getNotifications` (3 tests): returns unread matches with attacker info, empty array when none, correct where clause and ordering
  - `getScoutNotificationCount` — new (1 test): returns 0 when no unread scouts
  - `getScoutNotifications` — new (1 test): empty array when no unread scouts
  - `markScoutNotificationsRead` — new (1 test): empty array provided goes to else branch (marks all unread)

### hpService.ts (2026-03-13)
- **File:** `apps/api/src/services/hpService.ts`
- **Test file:** `apps/api/src/services/hpService.test.ts`
- **Status:** 49 tests, all passing (was 14 tests covering basic happy paths only)
- **Previously under-tested:** Yes (265-line source with 5 exported functions + 1 private, only 173-line test missing guild tax integration, optimistic locking, vitality/equipment scaling, passive regen, and edge cases)
- **Existing tests replaced and expanded (35 new tests):**
  - `getHpState` — new (8 tests): vitality scaling in maxHp, equipment health bonus, regenPerSecond from vitality, passive regen over elapsed time, currentHp capped at maxHp after regen, no passive regen while recovering, combined vitality+equipment maxHp, getVitalityLevel player-not-found propagation
  - `rest` — new (12 tests): fractional turns rejection, partial heal with insufficient turns, getPlayerTaxRateTx call verification, calculateEffectiveTurns delegation, calculateInflatedCost delegation, spendPlayerTurnsTx with inflated cost, applyGuildTaxTx call, turnsSpent from taxResult.preTaxAmount, guild tax reducing effective turns end-to-end, optimistic lock conditions in updateMany, HP_STATE_CHANGED on lock failure, high vitality heal, passive regen before heal computation
  - `recover` — new (6 tests): null recoveryCost defaults to 0, spendPlayerTurnsTx call, optimistic lock conditions in updateMany, RECOVERY_STATE_CHANGED on lock failure, exit HP from vitality-boosted maxHp, exit HP with equipment health bonus
  - `setHp` — new (4 tests): zero HP, large HP values, lastHpRegenAt date forwarding, large negative clamped to 0
  - `enterRecoveringState` — new (4 tests): recovery cost scales with large maxHp, 0 maxHp handling, currentHp always 0, custom date for lastHpRegenAt

### xpService.ts (2026-03-13)
- **File:** `apps/api/src/services/xpService.ts`
- **Test file:** `apps/api/src/services/xpService.test.ts`
- **Status:** 53 tests, all passing (was 6 tests covering only basic happy paths and error cases)
- **Previously under-tested:** Yes (132-line source with guild/shop XP boost, daily window reset, character level-up, BigInt handling, and buff consumption — only 119-line test covering 6 basic cases with no mocking of guildUpgradeService or buffService)
- **Existing tests replaced and expanded (47 new tests):**
  - Error handling (4 tests): skill not found, player not found, playerId/skillType in skill error message, playerId in player error message
  - Basic XP grant (5 tests): all expected fields returned, newTotalXp from currentXp + xpAfterEfficiency, newDailyXpGained accumulation, zero rawXpGain graceful handling, non-combat skillType (mining)
  - Guild XP boost (5 tests): pre-resolved guildXpBoost skips getPlayerGuildModifiers, fetches guild modifiers when undefined, applies boost to raw XP, 0 boost no-op, fetched modifier value integration
  - Shop XP boost (4 tests): fetches xp_boost buff value, applies shop boost to raw XP, consumeBuff called when shopXpBoost > 0, consumeBuff NOT called when 0
  - Combined boosts (3 tests): guild + shop boosts summed, both zero no-op, floor on fractional result
  - Daily window reset (4 tests): resets dailyXpGained on expired window, sets lastXpResetAt in update, does NOT set lastXpResetAt within window, accumulates dailyXpGained within window
  - Skill level-up (4 tests): no level-up returns 0 skillPoints, single level-up returns POINTS_PER_LEVEL, multiple level-ups return proportional points, playerSkill.update gets new level
  - Character level-up (7 tests): characterXpGain from xpAfterEfficiency, adds to existing characterXp, characterLevelBefore from player record, characterLeveledUp true/false, attribute points on level-up, attribute points preserved when no level-up
  - Database updates (6 tests): correct where clause, xp as BigInt, dailyXpGained stored, player characterXp as BigInt, player characterLevel/attributePoints update, parallel skill+player fetch
  - BigInt handling (2 tests): skill.xp BigInt-to-number, player.characterXp BigInt-to-number
  - Transaction (1 test): runs within prisma.$transaction
  - Edge cases (5 tests): high dailyXpGained near cap (0 efficiency), large raw XP gain, 0 characterXpGain at cap, character level never decreases, Math.max(0, levelUps) clamping
  - Guild modifier resolution (2 tests): 0 guildXpBoost uses nullish coalescing (not fetched), undefined triggers fetch
  - Boost resolution timing (1 test): guild+shop boosts resolved before transaction

### questShopService.ts (2026-03-13)
- **File:** `apps/api/src/services/questShopService.ts`
- **Test file:** `apps/api/src/services/questShopService.test.ts`
- **Status:** 59 tests, all passing (was 13 tests covering only 2 of 11 functions/effects)
- **Previously under-tested:** Yes (445-line source with 11 distinct effect handlers + 2 exported functions, only 316-line test covering getShopItems basics, purchaseItem validation basics, and 3 of 10 effect handlers)
- **Existing tests replaced and expanded (46 new tests):**
  - `getShopItems` — new (8 tests): insufficient tokens marks canPurchase false, weekly limit reached marks false, lifetime limit reached marks false, null questState defaults to 0 tokens, empty items list, multiple items with mixed purchaseability, old weekly purchases counted separately from current week, non-buff items skip stacking check
  - `purchaseItem` validation — new (4 tests): item not found, disabled item, null questState, skips weekly check when weeklyLimit null, skips buff check when buffType null
  - `purchaseItem` — attribute_reset_scroll new (2 tests): player not found error, zero-point attributes no-op refund
  - `purchaseItem` — talent_reset_scroll (1 test): upsert with empty allocations
  - `purchaseItem` — teleport_scroll new (2 tests): missing targetZoneId, zone not found
  - `purchaseItem` — hearthstone (3 tests): happy path teleport to home town, no home town error, player not found error
  - `purchaseItem` — bestiary_tome (5 tests): creates bestiary + all prefix entries for new mob, skips overwrite for sufficient kills, updates below-threshold entries, missing targetMobTemplateId error, mob not found error
  - `purchaseItem` — recipe_scroll (5 tests): learns random eligible recipe, no eligible recipes error, filters above skill level, missing skill as level 0, randomIntInclusive index verification
  - `purchaseItem` — guild_contract_reroll (10 tests): happy path reroll, missing targetContractId, not leader/officer, contract not found, wrong guild, non-active contract, all definitions in use, level bracket target value, timing preservation, guild log creation
  - `purchaseItem` — prestige titles new (2 tests): title_token_hoarder achievement, achievement notification emission
  - `purchaseItem` — unknown item key (2 tests): returns type unknown, falls back to buff for unknown key with buff fields
  - `purchaseItem` — token deduction (2 tests): purchase always recorded, correct newBalance returned

### friendMailService.ts (2026-03-13)
- **File:** `apps/api/src/services/friendMailService.ts`
- **Test file:** `apps/api/src/services/friendMailService.test.ts`
- **Status:** 50 tests, all passing (was 15 tests covering basic happy paths and error cases)
- **Previously under-tested:** Yes (290-line source with 7 exported functions + 1 private helper, only 290-line test covering basic paths with no inbox/sent pruning, no truncation, no reverse block direction, no sender-side delete, no pagination edge cases)
- **Existing tests preserved (15 tests):** sendMail happy path, SELF_MAIL, NOT_FRIENDS, sender-blocked, INSUFFICIENT_GOLD, sendSystemMail happy path, getUnreadCount, readMail mark-as-read, readMail sender-reads, readMail NOT_FOUND, deleteMail soft-delete recipient, deleteMail hard-delete, deleteMail NOT_FOUND, getInbox paginated, getSentMail paginated
- **New coverage areas (35 new tests):**
  - `sendMail` — new (13 tests): reverse block direction (recipient blocks sender) with both isBlocked calls verified, subject truncation to MAX_SUBJECT_LENGTH, body truncation to MAX_BODY_LENGTH, no truncation for short content, inbox pruning when over MAX_INBOX_SIZE (findMany oldest + soft-delete), inbox not pruned at exact limit, sent mail pruning when over MAX_SENT_SIZE, sent mail not pruned at exact limit, both inbox+sent pruned simultaneously, empty findMany skips updateMany, $transaction wrapping, createdAt Date→ISO string conversion, friendship OR clause for both directions
  - `sendSystemMail` — new (4 tests): subject+body truncation, no friendship/block checks, no gold deduction/$transaction, createdAt ISO conversion
  - `getInbox` — new (5 tests): default page/pageSize, page 2 offset, page 3 offset, empty results, toMailEntry mapping (senderName instead of sender object, ISO date)
  - `getSentMail` — new (4 tests): default page/pageSize, page 2 offset, empty results, senderId filter verification
  - `readMail` — new (3 tests): already-read mail skips update, OR clause structure verification, createdAt ISO conversion
  - `deleteMail` — new (4 tests): sender-side soft-delete, sender deletes after recipient (hard delete), OR clause structure, recipient soft-delete priority
  - `getUnreadCount` — new (2 tests): returns 0, custom playerId in where clause

### bossEncounterService.ts (2026-03-13)
- **File:** `apps/api/src/services/bossEncounterService.ts`
- **Test file:** `apps/api/src/services/bossEncounterService.test.ts`
- **Status:** 86 tests, all passing (was 22 tests covering 6 of 7 exported functions, but missing the most critical one)
- **Previously under-tested:** Yes (762-line source with the core `resolveBossRound` function (370 lines, the most complex function in the file) completely untested, plus missing mapper edge cases and getBossHistory edge cases)
- **Existing tests preserved (22 tests):** createBossEncounter (2), signUpForBossRound (7), getBossEncounterStatus (3), checkAndResolveDueBossRounds (2), getActiveBossEncounters (3), getBossHistory (5)
- **New coverage areas (64 new tests):**
  - `resolveBossRound` — null returns (5 tests): encounter not found, defeated status, expired status, no signups, optimistic lock failure
  - `resolveBossRound` — HP scaling (6 tests): tier-based scaling, proportional HP preservation, multiple participant scaling, tier clamping at 0-4, null zone defaults to tier 1, zero maxHp edge case
  - `resolveBossRound` — engine invocation (4 tests): correct boss state and participant building, threat table carry-forward, fallback boss template for unknown mob names, non-array bossEffects defaults to empty
  - `resolveBossRound` — persistence (6 tests): optimistic lock with roundNumber, per-participant result increments, knocked_out status on death, bossActiveEffectsAfter serialization, round summary appending, summary field calculation
  - `resolveBossRound` — boss rotation reveal (2 tests): $queryRaw for alive players, skip when all dead
  - `resolveBossRound` — in-progress round (2 tests): zone system message with HP%, return value shape
  - `resolveBossRound` — auto-signup (5 tests): carried-forward resources, skip dead players, skip on defeat, silent failure on insufficient turns, skip when autoSignUp=false
  - `resolveBossRound` — raid wipe (6 tests): flee processing, setHp on escape, enterRecoveringState on knockout, reset to waiting status, world+zone system messages, null zone handling
  - `resolveBossRound` — boss defeated (10 tests): defeated status + killedBy, loot distribution with correct zoneTier, world event completion, defeat messages with killer name, unknown killer fallback, rewardsByPlayer saving, cumulative damage for killedBy, contributor stat aggregation, null zone skips zone message
  - `resolveBossRound` — resource building (1 test): carried-forward stamina/mana/templateRound from signup
  - `resolveBossRound` — attack counting (3 tests): increment on damage, increment on miss (non-defend), no increment for defend action
  - `getBossHistory` — new edge cases (4 tests): Unknown zone fallback, null mob level defaults to 1, default player stats when no participation, skip killedBy lookup when no killedBy IDs
  - `toBossEncounterData` mapper (9 tests): Date→ISO string, null nextRoundAt, non-array bossEffects, array bossEffects, array roundSummaries, non-array roundSummaries, object rewardsByPlayer, non-object rewardsByPlayer, array rewardsByPlayer

### leaderboardService.ts (2026-03-13)
- **File:** `apps/api/src/services/leaderboardService.ts`
- **Test file:** `apps/api/src/services/leaderboardService.test.ts`
- **Status:** 70 tests, all passing (was 13 tests covering basic getCategories, getLeaderboard, and refreshAllLeaderboards)
- **Previously under-tested:** Yes (493-line source with 6 internal refresh functions + 2 public API functions + 2 helpers, only 281-line test covering 3 of 8 logical areas)
- **Existing tests preserved (13 tests):** getCategories (3), getLeaderboard basic (7), refreshAllLeaderboards basic (3)
- **New coverage areas (57 new tests):**
  - `getCategories` — new (5 tests): Guilds and Casino groups present, all four PvP category slugs, Progression slug list, Casino slug list, every category has slug+label
  - `getLeaderboard` — new (12 tests): INVALID_CATEGORY code/statusCode, aroundMe start clamped to 0 near top, aroundMe ignored without playerId (no zrevrank call), aroundMe ignored when player not ranked, multiple entries from interleaved WITHSCORES, isAdmin coercion via !! (undefined→false), isAdmin=true in entries, title/titleTier passthrough in entries, title/titleTier in myRank, default meta for myRank hget null, hmget skipped when no entries, all valid slugs accepted, correct rank offset with aroundMe window shift
  - `refreshPvp` — new (7 tests): all four PvP category keys written, correct per-category scores (rating/wins/bestRating/winStreak), isAdmin from role=admin in meta, title resolution via ACHIEVEMENTS_BY_ID (combat_kills_500→The Warrior tier 2), empty title for null activeTitle, empty title for unknown achievement ID, zadd/hset skipped for empty ratings
  - `refreshProgression` — new (4 tests): character_level and character_xp keys written, characterLevel as score, BigInt characterXp converted to Number, admin role in progression meta
  - `refreshSkills` — new (4 tests): total_skill_level aggregation across 3 skills for same player, per-player separate totals, empty skill types skip zadd, skill_melee written but skill_ranged not when no ranged data
  - `refreshCombat` — new (4 tests): boss_damage leaderboard written from bossParticipant, boss_damage aggregated across multiple participations, P2021 missing table error handling (caught by refreshAllLeaderboards), non-P2021 error re-thrown
  - `refreshGuilds` — new (5 tests): guild_level/guild_renown/guild_members all written, username formatted as [TAG] Name, correct scores per category, isBot=false and isAdmin=false for guilds, guild level as characterLevel in meta
  - `refreshCasino` — new (8 tests): early return when no casino rows, casino_profit and casino_wagered keys written, profit = totalPayout - totalWagered, negative profit when losing, totalWagered as wagered score, Unknown/1/false fallback for missing player, multiple casino players, isAdmin for admin player, title resolution for casino players
  - `writeToZset` behavior (2 tests): del called even for empty rows, zadd/hset not called for empty data
  - Failure isolation (2 tests): all 6 categories fail but no throw, single pvp failure allows others to write

### achievementService.ts (2026-03-13)
- **File:** `apps/api/src/services/achievementService.ts`
- **Test file:** `apps/api/src/services/achievementService.test.ts`
- **Status:** 59 tests, all passing (was 13 tests covering 4 of 6 exported functions)
- **Previously under-tested:** Yes (269-line source with 6 exports, only 180-line test covering 4 functions with basic happy/error paths, missing `getUnclaimedCount` and `emitAchievementNotifications` entirely, plus shallow coverage of edge cases)
- **Existing tests preserved (13 tests):** checkAchievements (4), getPlayerAchievements (1), claimReward (3), setActiveTitle (3)
- **New coverage areas (46 new tests):**
  - `checkAchievements` — new (8 tests): skips resolveStats when no statKeys, non-existent familyId returns empty, unmapped family name returns empty, multiple thresholds unlock multiple achievements, exact threshold boundary, just-below-threshold no unlock, multiple stat keys from different categories, family kills used for family achievement progress
  - `getPlayerAchievements` — new (9 tests): secret achievement hides title/description when not unlocked, secret achievement shows real values when unlocked, family-based progress through familyKillsByKey, progress capped at threshold via Math.min, unclaimedCount only counts unlocked with rewards, titleReward hidden when not unlocked, titleReward shown when unlocked, unmapped family names skipped, unlockedAt as ISO string, undefined unlockedAt for not-unlocked, progress 0 for missing stat
  - `claimReward` — new (7 tests): NOT_FOUND for unknown achievement ID, NOT_FOUND code/status verification, NOT_UNLOCKED code/status verification, ALREADY_CLAIMED code/status verification, attribute_points reward via player.update increment, turns reward via turnBank.update increment, item reward with template found, item creation skipped when template not found, empty rewards array handled, rewardClaimed=true in update
  - `setActiveTitle` — new (5 tests): NO_TITLE_REWARD for achievement without titleReward, NO_TITLE_REWARD for unknown achievement, no playerAchievement query when clearing (null), NOT_UNLOCKED code/status verification, correct data in player.update
  - `getUnclaimedCount` (6 tests): returns 0 when empty, counts only achievements with rewards, skips unknown IDs, multiple unclaimed counted, rewardClaimed=false filter verified, empty rewards array skipped
  - `emitAchievementNotifications` (6 tests): no-op for empty array, activity log per achievement, socket event per achievement with io available, socket emit skipped when io null, sequential emit for multiple achievements, category included in socket event

### casinoService.ts (2026-03-13)
- **File:** `apps/api/src/services/casinoService.ts`
- **Test file:** `apps/api/src/services/casinoService.test.ts`
- **Status:** 59 tests, all passing (was 15 tests covering only basic happy paths of 4 of 5 exported functions)
- **Previously under-tested:** Yes (381-line source with 5 exported functions + 4 internal functions, only 249-line test covering basic paths with no resolveRound winner logic, no socket emissions, no achievement checks, no getRouletteStats, no concurrent lock handling)
- **Existing tests replaced and expanded (44 new tests):**
  - `exchangeTurnsForGold` — new (3 tests): GOLD_EXCHANGE_RATE in player.update params, INVALID_AMOUNT error code, runs within $transaction
  - `getCurrentRound` — new (5 tests): result phase from RESULT_KEY with bets, startedAt ISO formatting, public bets from DB for active round, casino:phase emission when io available and phase changed, casino:phase emission skipped when phase unchanged (deduplication via Redis)
  - `resolveRound` via getCurrentRound — new (14 tests): Redis lock acquisition, round result/resolvedAt DB update, winning bets payout + player gold increment, payout aggregation for same player with multiple wins, casino:result socket event with winning bets, no socket emission when io null, peakGoldHeld achievement check for winners, achievement notification emission on unlock, no achievement emission when empty, losers skip achievement check entirely, $executeRaw for peakGoldHeld upsert, $executeRaw skipped when player not found, winner ID deduplication for achievement checks, ROUND_KEY deletion + RESULT_KEY set after resolution
  - `resolveRound` — concurrent resolution (2 tests): polls for result when lock not acquired (another process resolving), returns 0 when polling times out after 10 attempts
  - `placeBet` — new (7 tests): INVALID_BET error code, player not found (null) throws INSUFFICIENT_GOLD, INSUFFICIENT_GOLD error code, BETTING_CLOSED error code, casino:bet socket emission with player data, no emission when io null, goldRemaining calculation, gold decrement verification
  - `getRouletteHistory` — new (2 tests): ROULETTE_HISTORY_LENGTH query param, Date→ISO conversion
  - `getRouletteStats` (7 tests): all 37 numbers (0-36) with zero counts, occurrence counting, ROULETTE_STATS_DEPTH query param, result-only select, all-same-number edge case, Map iteration order, single result
  - `getOrCreateRound` via placeBet/getCurrentRound (3 tests): round reuse within duration, RESULT_KEY branch during display window, new round creation via DB with Redis TTL

### combatLogMapper.ts (2026-03-13)
- **File:** `apps/api/src/services/combatLogMapper.ts`
- **Test file:** `apps/api/src/services/combatLogMapper.test.ts`
- **Status:** 29 tests, all passing
- **Previously untested:** Yes (no test file existed)
- **Coverage areas:**
  - Empty/pass-through (4 tests): empty array, entries with no combatant actions, undefined actions, empty string actions (falsy)
  - Actor is combatantA (2 tests): uses A's action/resources, preserves original fields via spread
  - Actor is combatantB (2 tests): uses B's action/resources, handles undefined A resources
  - Unknown action ID (2 tests): returns undefined for actionName/staminaCost/manaCost, still maps staminaAfter/manaAfter
  - wasExhausted field (3 tests): passes through true, preserves false (not nullish), undefined when missing
  - interactionResult field (3 tests): passes through string, undefined for null (via ??), undefined when missing
  - Action with mana cost (1 test): maps manaCost from action definition
  - Single-side action (2 tests): only combatantBAction present triggers mapping, only combatantAAction present
  - Actor mismatch (1 test): actor is A but only B action set returns undefined actionId without calling getActionDefinition
  - Non-standard actor (2 tests): non-combatantA actor treated as B (uses B action/resources), undefined actor uses B
  - Multiple entries (2 tests): independent processing per entry, mixed pass-through and mapped entries
  - Resource values (2 tests): undefined stamina/mana when not in entry, zero values mapped correctly
  - Generic type preservation (1 test): all extra properties preserved through spread
  - Edge: undefined cost (1 test): action definition with undefined cost returns undefined staminaCost/manaCost
  - Full integration (1 test): complete round with all fields mapped correctly from A's perspective

### statFormat.ts (2026-03-13)
- **File:** `apps/web/src/lib/statFormat.ts`
- **Test file:** `apps/web/src/lib/statFormat.test.ts`
- **Status:** 65 tests, all passing
- **Previously untested:** Yes (no test file existed)
- **Coverage areas:**
  - `PERCENT_STATS` (2 tests): contains critChance/critDamage, excludes non-percent stats
  - `prettyStatName` (8 tests): 4 special-case mappings (magicDefence, magicPower, critChance, critDamage), generic camelCase splitting, first-letter capitalization, single character, empty string
  - `formatStatValue` (8 tests): critChance/critDamage percentage formatting, rounding, zero percent, non-percent plain string, zero/negative/fractional non-percent values
  - `formatSignedStatValue` (7 tests): positive/negative/zero with + / - / no prefix, percent stat with sign, absolute value used for formatting, zero percent no sign
  - `signedClass` (5 tests): positive returns positiveClass, zero returns positiveClass, negative returns rpg-red class, large negative, custom positiveClass preserved
  - `numStat` (13 tests): valid finite number, zero, negative, float, NaN→null, Infinity→null, -Infinity→null, string→null, null→null, undefined→null, boolean→null, object→null, array→null
  - `statEntries` (12 tests): null/undefined/empty→[], filters zero/non-number/NaN/Infinity/-Infinity, includes negative non-zero, STAT_ORDER sorting, unknown stats after known, unknown alphabetical sort, full STAT_ORDER order, mixed known+unknown, float preservation
  - `prettyWeightClass` (5 tests): heavy/medium/light→capitalized with "Armor", null→null, undefined→null

## Remaining Untested Files
### Service files (apps/api)
- `activityLogService.ts` (trivial — single DB create wrapper)
- `roundResolutionScheduler.ts`

### Game engine files (packages/game-engine)
- `utils/math.ts` (clamp, randomUnit)
