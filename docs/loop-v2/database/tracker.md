# Database Audit Tracker

Automated audit of all API service files for N+1 queries, missing indexes, payload bloat, cache issues, and migration risks.

**Loop:** `*/10 * * * *` — one service per run, reports saved to this folder.

## Progress

Legend: `[ ]` pending | `[~]` in progress | `[x]` audited (link to report)

### Combat & PvP
- [x] combatOrchestrationService — [report](2026-03-14-140000-combatOrchestrationService.md)
- [x] combatStatsService — [report](2026-03-14-141000-combatStatsService.md)
- [x] combatTemplateService — [report](2026-03-14-142000-combatTemplateService.md)
- [x] combatLogMapper — [report](2026-03-14-143000-combatLogMapper.md) *(no DB calls)*
- [x] pvpService — [report](2026-03-14-144000-pvpService.md)
- [x] pvpCombatantBuilder — [report](2026-03-14-145000-pvpCombatantBuilder.md)
- [x] sparService — [report](2026-03-14-150000-sparService.md)
- [x] eloService — [report](2026-03-14-151000-eloService.md) *(no DB calls)*
- [x] hpService — [report](2026-03-14-152000-hpService.md)
- [x] buffService — [report](2026-03-14-153000-buffService.md)

### Equipment & Inventory
- [x] inventoryService — [report](2026-03-14-154000-inventoryService.md)
- [x] equipmentService — [report](2026-03-14-155000-equipmentService.md)
- [x] durabilityService — [report](2026-03-14-160000-durabilityService.md)
- [x] repairService — [report](2026-03-14-161000-repairService.md)
- [x] stashService — [report](2026-03-15-100000-stashService.md)
- [x] sellService — [report](2026-03-15-101000-sellService.md)
- [x] lootService — [report](2026-03-15-102000-lootService.md)
- [x] cacheLootService — [report](2026-03-15-103000-cacheLootService.md)
- [x] pendingLootService — [report](2026-03-15-104000-pendingLootService.md)
- [x] dropRollingService — [report](2026-03-15-105000-dropRollingService.md)
- [x] chestService — [report](2026-03-15-110000-chestService.md)

### Skills & Progression
- [x] xpService — [report](2026-03-15-111000-xpService.md)
- [x] skillPointService — [report](2026-03-15-112000-skillPointService.md)
- [x] trainingService — [report](2026-03-15-113000-trainingService.md)
- [x] progressService — [report](2026-03-15-114000-progressService.md)
- [x] achievementService — [report](2026-03-15-120000-achievementService.md)
- [x] statsService — [report](2026-03-15-121000-statsService.md)
- [x] attributesService — [report](2026-03-15-122000-attributesService.md)
- [x] leaderboardService — [report](2026-03-15-123000-leaderboardService.md)

### Guilds
- [x] guildService — [report](2026-03-15-130000-guildService.md)
- [x] guildMembershipService — [report](2026-03-15-131000-guildMembershipService.md)
- [x] guildContractService — [report](2026-03-15-132000-guildContractService.md)
- [x] guildProjectService — [report](2026-03-15-133000-guildProjectService.md)
- [x] guildSpecializationService — [report](2026-03-15-134000-guildSpecializationService.md)
- [x] guildTaxService — [report](2026-03-15-140000-guildTaxService.md)
- [x] guildUpgradeService — [report](2026-03-15-141000-guildUpgradeService.md)

### Expeditions & Bosses
- [x] expeditionService — [report](2026-03-15-142000-expeditionService.md)
- [x] expeditionLootService — [report](2026-03-15-143000-expeditionLootService.md)
- [x] expeditionLockoutService — [report](2026-03-15-144000-expeditionLockoutService.md)
- [x] expeditionBestiaryService — [report](2026-03-15-144100-expeditionBestiaryService.md)
- [x] expeditionShopService — [report](2026-03-15-144200-expeditionShopService.md)
- [x] bossEncounterService — [report](2026-03-15-145000-bossEncounterService.md)
- [x] bossBestiaryService — [report](2026-03-15-145100-bossBestiaryService.md)
- [x] bossLootService — [report](2026-03-15-145200-bossLootService.md)

### Zones & Exploration
- [x] zoneExplorationService — [report](2026-03-15-150000-zoneExplorationService.md)
- [x] zoneDiscoveryService — [report](2026-03-15-150100-zoneDiscoveryService.md)
- [x] persistedMobService — [report](2026-03-15-150200-persistedMobService.md)

### Consumables & Potions
- [x] consumableService — [report](2026-03-15-151000-consumableService.md)
- [x] potionService — [report](2026-03-15-151100-potionService.md)

### Social
- [x] friendService — [report](2026-03-15-152000-friendService.md)
- [x] friendMailService — [report](2026-03-15-152100-friendMailService.md)
- [x] blockService — [report](2026-03-15-152200-blockService.md)
- [x] chatService — [report](2026-03-15-152300-chatService.md)

### Economy & Casino
- [x] casinoService — [report](2026-03-15-153000-casinoService.md)
- [x] resourceService — [report](2026-03-15-153100-resourceService.md)
- [x] questService — [report](2026-03-15-153200-questService.md)
- [x] questShopService — [report](2026-03-15-153300-questShopService.md)

### System & Scheduling
- [x] turnBankService — [report](2026-03-15-153400-turnBankService.md)
- [x] eventSchedulerService — [report](2026-03-15-153500-eventSchedulerService.md)
- [x] roundResolutionScheduler — [report](2026-03-15-153600-roundResolutionScheduler.md)
- [x] systemMessageService — [report](2026-03-15-153700-systemMessageService.md)
- [x] activityLogService — [report](2026-03-15-153800-activityLogService.md)
- [x] worldEventService — [report](2026-03-15-153900-worldEventService.md)

## Summary

| Category | Total | Audited | Findings |
|---|---|---|---|
| Combat & PvP | 10 | 10 | 17 N+1, 7 missing idx, 14 bloat, 12 cache, 6 migration |
| Equipment & Inventory | 11 | 11 | 14 N+1, 11 missing idx, 14 bloat, 9 cache, 2 migration |
| Skills & Progression | 8 | 8 | 4 N+1, 1 missing idx, 15 bloat, 8 cache, 3 migration |
| Guilds | 7 | 7 | 2 N+1, 6 missing idx, 18 bloat, 2 cache, 1 migration |
| Expeditions & Bosses | 8 | 8 | 14 N+1, 7 missing idx, 13 bloat, 5 cache, 1 migration |
| Zones & Exploration | 3 | 3 | 0 N+1, 2 missing idx, 2 bloat, 1 cache, 1 migration |
| Consumables & Potions | 2 | 2 | 1 N+1, 1 missing idx, 2 bloat, 0 cache, 0 migration |
| Social | 4 | 4 | 0 N+1, 0 missing idx, 1 bloat, 0 cache, 0 migration |
| Economy & Casino | 4 | 4 | 3 N+1, 0 missing idx, 3 bloat, 0 cache, 0 migration |
| System & Scheduling | 6 | 6 | 0 N+1, 0 missing idx, 2 bloat, 0 cache, 0 migration |
| **Total** | **63** | **63** | — |
