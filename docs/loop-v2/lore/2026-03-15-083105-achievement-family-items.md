# Item Descriptions: Achievement Family Items (Sample)

## Content

**Ratcatcher's Gloves**
Stitched from the pelts of every rat variant in the Pocketrealm, these gloves fit like a second skin and strike like you know exactly where the weak points are. Bram Holloway considers their existence proof that someone finally took the rat problem seriously.

**Venomweave Boots**
Spider silk woven by someone who studied every arachnid the Pocketrealm has to offer and survived to make footwear from the experience. The silk anticipates your movement, which Vesper says is a property of the material and not evidence that it remembers.

**Tuskhide Pauldrons**
Boar hide layered and hardened into shoulder plates dense enough to stop a charging tusk, because you have now been charged by every tusk there is. Kessa reinforced them with iron studs and said nothing, which from her is the highest compliment.

**Wolf Pelt Cloak**
A cloak cut from the pelts of every wolf variant from forest to plains, worn like a trophy by someone the pack would recognise as an equal. It moves in the wind the way a live wolf does, which is unsettling until you remember how you earned it.

**Bandit Lord's Blade**
A longsword of suspicious provenance, awarded for mastering every bandit variant in the Pocketrealm. The 5% critical chance is not enchantment; it is the muscle memory of someone who has fought enough humans to know where a blade needs to go.

## Integration Notes

- Add as `flavorText` on the `ItemTemplate` model, keyed by the `achievement_*` item IDs.
- **These are bestiary mastery rewards, not drops or crafted items.** Each is awarded for fully completing a mob family's bestiary (encountering every variant and prefix). The descriptions treat them as trophies earned through exhaustive knowledge rather than a single lucky encounter.
- **Tier 5, unsellable:** All five items are tier 5 with sellPrice 0, meaning they are the highest-quality gear that cannot be traded. The flavor reflects this: these items exist because of what you know, not what you found.
- **Cross-references:**
  - Ratcatcher's Gloves references Bram Holloway (N-01) and the running rat problem joke (first established in N-01's greeting lines, continued through N-05's rat tail arithmetic, and the vermin bestiary M-01). The gloves are the punchline to a joke that spans four lore entries.
  - Venomweave Boots references Vesper Tain (N-04) and her clinical discomfort with things she cannot fully explain. The "silk remembers" detail connects to the Brood Mother's web-memory from M-02 and the spider silk material from I-04.
  - Tuskhide Pauldrons references Kessa Ironweld (N-02) and her signature communication style: silence as approval. The "every tusk there is" line connects to the boar family's escalation (Wild Boar to Great Boar, M-03).
  - Wolf Pelt Cloak connects to both wolf bestiary entries (M-04 Deep Forest, M-14 Whispering Plains) with "every wolf variant from forest to plains," acknowledging the split-population lore. The "moves like a live wolf" detail echoes the Alpha Wolf's description from M-04.
  - Bandit Lord's Blade references both bandit families (M-05 Deep Forest, M-15 Whispering Plains) through "every bandit variant." The critical chance as muscle memory (not magic) grounds the weapon's power in human expertise, consistent with bandits being the only fully human mob family.
- **Items not covered:** The tracker specifies these five as a sample. The remaining 14 achievement family items (Ironbark Shield, Spectral Lantern, Pixie Dust Ring, Echolocation Helm, Goblin King's Crown, Crystal Core Charm, Chitin Legguards, Featherstep Boots, Death Knight's Gauntlets, Mire Walker's Belt, Hexweave Cowl, Primordial Shard Necklace, Naga Queen's Ring, Fleshknit Vest) can receive flavor text in a future pass.
- **Design pattern:** Each description follows the same structure: what the item is made from (connecting to the mob family's materials), a detail that reflects exhaustive knowledge of the family, and an NPC reaction that grounds the achievement in the world. This pattern can be replicated for the remaining 14 items.
