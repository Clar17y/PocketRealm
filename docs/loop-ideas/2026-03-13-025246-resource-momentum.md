# Resource Momentum: Combat Chain Bonuses

**Category:** feature
**Priority:** high
**Scope:** medium

## Description
Introduce a "Momentum" system that tracks how efficiently a player uses stamina and mana across consecutive combats without resting. When a player finishes a fight with resources to spare (ending above 50% stamina or mana), the surplus carries forward as a stacking Momentum buff: +2% damage per stack (up to 5 stacks / +10%), resetting to zero if the player rests or gets knocked out. This creates a strategic tension at the core gameplay loop -- aggressive players burning resources on powerful abilities win fights faster but lose their Momentum chain, while disciplined players who manage costs with lighter attacks and efficient templates are rewarded with an escalating damage bonus that makes subsequent encounters progressively easier. The implementation hooks into the existing post-combat resource write in `setAllResources`, computing the stack from a Redis key (`momentum:{playerId}`) that increments or resets based on end-of-combat resource percentages, and feeds into the damage calculator as a flat multiplier alongside existing buffs. This gives stamina/mana management a strategic dimension that extends beyond individual fights, making the combat template system more meaningful since players now have a reason to build resource-efficient templates alongside burst-damage ones.
