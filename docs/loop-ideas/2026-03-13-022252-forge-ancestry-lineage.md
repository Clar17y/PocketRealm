# Forge Ancestry & Item Lineage

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
Track the full genealogy of forged items: every time a player successfully upgrades an item in the forge, record the sacrificed item's identity (name, rarity, bonus stats) as an "ancestor" on the upgraded item's metadata. Items that survive multiple forge upgrades accumulate a visible lineage — e.g., "This Epic Dragonbone Axe was forged from a Rare Dragonbone Axe, which consumed an Uncommon Iron Sword and a Rare Steel Mace." High-lineage items (3+ ancestors) earn a cosmetic title prefix like "Storied" or "Ancestral" and grant a small hidden luck bonus to their next forge attempt, rewarding players who invest in a single weapon's journey rather than gambling on fresh crafts. The implementation is lightweight: extend the item's `bonusStats` JSON (or add a sibling `lineage` JSON column) to store an array of `{ templateName, rarity, sacrificedAt }` entries, populated in the existing forge upgrade success path. The frontend can render the lineage as a tooltip or expandable history panel, turning each item into a personal narrative artifact.
