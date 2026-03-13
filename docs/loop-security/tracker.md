# Security Fixes Tracker

Status: `TODO` | `IN_PROGRESS` | `DONE` | `FALSE_POSITIVE` | `SKIPPED`

## Critical Priority

| # | Status | Finding | Source File | Branch |
|---|--------|---------|-------------|--------|
| 1 | DONE | Hardcoded JWT secret fallback | `2026-03-13-023041-auth-system.md` | `security/fix-01-jwt-fallback` |
| 2 | DONE | Pending loot double-claim — item duplication | `2026-03-13-021034-inventory-equipment.md` | `security/fix-02-loot-double-claim` |
| 3 | TODO | No zone presence validation (exploration + combat) | `2026-03-13-024036-exploration-combat-start.md` | |
| 4 | TODO | POST /turns/spend publicly exposed | `2026-03-13-032031-gathering-turns-resources.md` | |
| 5 | TODO | No global rate limiting | `2026-03-13-042037-cross-cutting-infrastructure.md` | |
| 6 | TODO | Admin role not re-verified from DB | `2026-03-13-023041-auth-system.md` | |

## Medium Priority

| # | Status | Finding | Source File | Branch |
|---|--------|---------|-------------|--------|
| 7 | TODO | Teleport scroll bypasses travel restrictions | `2026-03-13-035034-quests-shop.md` | |
| 8 | TODO | Boss HP scaling corruption — write before optimistic lock | `2026-03-13-022037-boss-encounters.md` | |
| 9 | TODO | Gathering uses client-provided zone ID | `2026-03-13-032031-gathering-turns-resources.md` | |
| 10 | TODO | Refresh token reuse via activity window bypass | `2026-03-13-023041-auth-system.md` | |
| 11 | TODO | Guild creation: turn spend outside transaction | `2026-03-13-020038-guild-system.md` | |
| 12 | TODO | Skill point allocation not atomic — double-spend | `2026-03-13-033045-player-attributes-skillpoints-achievements.md` | |
| 13 | TODO | Achievement claim race — double rewards | `2026-03-13-033045-player-attributes-skillpoints-achievements.md` | |
| 14 | TODO | XP buff fetched outside transaction — double boost | `2026-03-13-043032-shared-services-xp-durability-events.md` | |
| 15 | TODO | Attribute points absolute write — silent loss | `2026-03-13-043032-shared-services-xp-durability-events.md` | |
| 16 | TODO | Expedition force-round bypasses timing | `2026-03-13-034049-expedition-system.md` | |
| 17 | TODO | Shop purchase token race — duplicate items | `2026-03-13-034049-expedition-system.md` | |
| 18 | TODO | Travel refund includes tax inflation | `2026-03-13-025034-zones-hp-rest.md` | |
| 19 | TODO | No login rate limiting | `2026-03-13-023041-auth-system.md` | |
| 20 | TODO | Unlimited bets per roulette round | `2026-03-13-031041-casino-chat-socket.md` | |
| 21 | TODO | Zone chat switch has no validation | `2026-03-13-031041-casino-chat-socket.md` | |
| 22 | TODO | Chat/mail not sanitized — XSS risk | `2026-03-13-031041-casino-chat-socket.md` | |
| 23 | TODO | Craft quantity has no upper bound | `2026-03-13-015113-crafting-system.md` | |
| 24 | TODO | Boss signup gives full HP regardless | `2026-03-13-022037-boss-encounters.md` | |
| 25 | TODO | Efficiency reset doubles XP capacity | `2026-03-13-035034-quests-shop.md` | |
| 26 | TODO | Guild log readable by any player | `2026-03-13-020038-guild-system.md` | |
| 27 | TODO | Leaderboard exposes player UUIDs + isAdmin publicly | `2026-03-13-044029-leaderboard-bestiary.md` | |

## Low Priority

| # | Status | Finding | Source File | Branch |
|---|--------|---------|-------------|--------|
| 28 | TODO | Item creation outside transaction in craft route | `2026-03-13-015113-crafting-system.md` | |
| 29 | TODO | Travel turn spend not atomic with zone update | `2026-03-13-025034-zones-hp-rest.md` | |
| 30 | TODO | Breadcrumb return bypasses connection validation | `2026-03-13-025034-zones-hp-rest.md` | |
| 31 | TODO | Travel ambushes missing guild combat modifiers | `2026-03-13-025034-zones-hp-rest.md` | |
| 32 | TODO | Admin ops target only admin's own account | `2026-03-13-030020-admin-panel.md` | |
| 33 | TODO | No audit logging for admin actions | `2026-03-13-030020-admin-panel.md` | |
| 34 | TODO | Bot creation creates permanent player records | `2026-03-13-030020-admin-panel.md` | |
| 35 | TODO | Achievement turn reward bypasses bank cap | `2026-03-13-033045-player-attributes-skillpoints-achievements.md` | |
| 36 | TODO | Room carry HP can override current HP | `2026-03-13-024036-exploration-combat-start.md` | |
| 37 | TODO | Encounter site decay check outside transaction | `2026-03-13-024036-exploration-combat-start.md` | |
| 38 | TODO | prismaAny bypasses type safety globally | `2026-03-13-042037-cross-cutting-infrastructure.md` | |
| 39 | TODO | Template action validation doesn't check definition registry | `2026-03-13-040053-templates-training-friends-events.md` | |
| 40 | TODO | Quest progress not atomic — stale reads | `2026-03-13-035034-quests-shop.md` | |
| 41 | TODO | Daily bonus TOCTOU — double claim | `2026-03-13-035034-quests-shop.md` | |
| 42 | TODO | World event spawn no duplicate prevention | `2026-03-13-043032-shared-services-xp-durability-events.md` | |
| 43 | TODO | No request ID tracking | `2026-03-13-042037-cross-cutting-infrastructure.md` | |
