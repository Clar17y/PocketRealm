# Talent Synergy Loadouts

**Category:** feature
**Priority:** high
**Scope:** medium

## Description
Introduce "Synergy Loadouts" — when a player allocates talent points into specific cross-tree node combinations (e.g., `melee_berserker_rage` + `general_last_stand`, or `magic_frost_nova` + `ranged_crippling_shot`), they unlock a named Synergy that grants a small unique bonus neither tree provides alone (like "Cornered Beast: +8% damage when below 30% HP" or "Frozen Volley: slows apply 5% extra damage taken"). Synergies are discovered organically as players build out their trees, displayed as hidden achievements on the talent screen that reveal themselves once prerequisites are met. This rewards creative multi-tree investment over min-maxing a single tree, gives players a reason to experiment with respec, and creates emergent "build identity" without adding new UI complexity — synergies slot into the existing `passiveBonus` system and `SkillPointAllocation.allocations` JSON, needing only a shared `SYNERGY_DEFINITIONS` constant and a derivation pass in `getSkillPoints()`.
