**Before working on a feature, read the business rules doc AND the relevant plan docs listed below.**

- **Business Rules (ALWAYS read):** `docs/business-rules.md` — state machines, cross-system constraints, cascading effects

| Feature Area | Plan Docs (design intent) | Key Source Files |
|---|---|---|
| **Combat** | `combat-rework-design`, `combat-rework-plan`, `combat-rework-frontend`, `enhanced-combat-log-design` | `routes/combat/`, `services/combatOrchestrationService.ts`, `game-engine/src/combat/` |
| **Combat Templates** | `template-combat-wiring-design`, `template-combat-wiring`, `conditional-combat-templates-design`, `conditional-combat-templates-plan`, `template-editor-ux-design` | `routes/templates.ts`, `services/combatTemplateService.ts` |
| **Exploration** | `exploration-rework-design`, `zone-exploration-progression-design`, `zone-exploration-improvements-design` | `routes/exploration/`, `services/zoneExplorationService.ts`, `game-engine/src/exploration/` |
| **Encounter Sites** | `encounter-site-ux-design`, `encounter-site-ux`, `full-clear-atomic` | `routes/combat/sites.ts`, `routes/combat/start.ts` |
| **HP & Resources** | `hp-system-design`, `hp-system-implementation`, `hp-visibility-design` | `services/hpService.ts`, `services/resourceService.ts`, `game-engine/src/hp/` |
| **Zones & Travel** | `zone-travel-discovery-design`, `zone-travel-discovery-plan`, `zone-art-backgrounds-design` | `routes/zones.ts`, `services/zoneDiscoveryService.ts` |
| **Crafting & Forge** | `crafting-crit-system`, `rare-crafting-design`, `jewellery-crafting-design`, `mass-salvage-quick-forge-design`, `forge-salvage-turn-cost-rework` | `routes/crafting/`, `game-engine/src/crafting/` |
| **Items & Inventory** | `item-rarity-system`, `crit-stats-slot-pools`, `inventory-backpack-design`, `inventory-backpack-plan` | `services/inventoryService.ts`, `services/lootService.ts`, `game-engine/src/items/` |
| **Equipment** | `attribute-armour-crafting-design`, `equipment-ux-design`, `equipment-ux-implementation` | `services/equipmentService.ts`, `services/durabilityService.ts` |
| **PvP Arena** | `pvp-arena-design`, `pvp-arena-implementation`, `pvp-rework-design`, `pvp-rework-plan`, `combat-pvp-fixes` | `routes/pvp.ts`, `services/pvpService.ts`, `services/eloService.ts` |
| **Boss Encounters** | `boss-encounters-design`, `boss-encounters-plan`, `world-boss-improvements`, `boss-rewards-system` | `routes/boss.ts`, `services/bossEncounterService.ts`, `services/bossLootService.ts` |
| **World Events** | `world-events-design`, `world-events-improvements` | `routes/worldEvents.ts`, `services/worldEventService.ts`, `services/eventSchedulerService.ts` |
| **Guilds** | `guild-system-design`, `guild-system-plan`, `guild-phase3-plan`, `guild-join-requests`, `guild-tax-transparency` | `routes/guild.ts`, `services/guild*.ts` (8 service files) |
| **Achievements** | `achievements-design`, `achievements-implementation`, `achievement-ux-design` | `routes/achievements.ts`, `services/achievementService.ts`, `shared/constants/achievementDefinitions.ts` |
| **Leaderboard** | `leaderboard-system-design`, `leaderboard-implementation-plan` | `routes/leaderboard.ts`, `services/leaderboardService.ts` |
| **Skills & XP** | `new-skills-foraging-alchemy-woodcutting`, `skills-efficiency-balance-design`, `magic-defence-design` | `services/xpService.ts`, `services/skillPointService.ts`, `game-engine/src/skills/` |
| **Mob System** | `mob-variety-prefix-system`, `mob-spell-system-design`, `bestiary-prefix-redesign` | `game-engine/src/combat/mobPrefixes.ts`, `shared/constants/mobPrefixes.ts` |
| **Casino** | `casino-atmosphere-design`, `casino-atmosphere-plan` | `routes/casino.ts`, `services/casinoService.ts`, `socket/` |
| **Training** | `town-activities-design`, `town-activities-plan` | `routes/training.ts`, `services/trainingService.ts` |
| **Tutorial** | `tutorial-and-launch-design`, `tutorial-and-launch-plan` | `components/TutorialBanner.tsx`, `components/TutorialDialog.tsx`, `lib/tutorial.ts` |
| **Admin Panel** | `admin-panel-design`, `admin-panel-plan` | `routes/admin.ts`, `middleware/admin.ts` |
| **Auth & Landing** | `auth-pages-design`, `landing-page-design`, `landing-page-plan` | `routes/auth.ts`, `app/login/`, `app/register/` |
| **UI/UX** | `screen-specific-backgrounds-design`, `hp-bar-actions-design`, `in-game-changelog`, `preferences-design` | `components/screens/`, `components/common/` |
| **Quests (planned)** | `quest-system-design`, `quest-system-plan` | Not yet implemented |

Design/spec docs are in `docs/superpowers/specs/` and plan/implementation docs are in `docs/superpowers/plans/`, both with `2026-MM-DD-` prefix. Design docs describe intent; implementation/plan docs describe execution steps.

**Note:** Plan docs capture design-time intent and may not reflect current implementation. Always verify against actual source code. `docs/business-rules.md` reflects current behavior.
