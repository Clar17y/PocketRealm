# Expedition Veteran Instincts

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
After a guild expedition completes (success or wipe), each participating member earns persistent "Instinct" progress tied to the expedition's theme and tier. Instincts are passive micro-bonuses that only activate inside future expeditions of the same theme (e.g., "Undercrypt Instinct: +3% threat generation" for tanks, "+5% healing received" for members who healed heavily, "+4% damage vs room bosses" for top DPS contributors). The bonus type is derived from the player's actual behavior during the expedition -- the `totalDamage`, `totalHealing`, and `threatValue` fields already tracked on `GuildExpeditionMember` determine which instinct archetype the player earned. Repeated runs of the same theme stack the instinct (up to 3-5 tiers), so guilds that struggle on a particular theme gradually earn a built-in safety net through persistence rather than just gear upgrades. This creates a "we wiped but we got stronger" feeling that turns failed expeditions from pure frustration into tangible progress, and gives guilds a strategic reason to re-run familiar themes rather than always chasing the newest tier.
