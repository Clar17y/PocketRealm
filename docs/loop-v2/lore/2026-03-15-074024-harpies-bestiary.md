# Mob Flavor Text: Harpies (Whispering Plains)

## Content

### Family Overview

The harpies own the sky above the Whispering Plains, and they consider everything beneath it a buffet. They are the only airborne predator family in the Pocketrealm: part woman, part raptor, and entirely territorial, with a social hierarchy based on volume, wingspan, and the willingness to dive-bomb anything that enters their hunting ground. The "whispering" in the Whispering Plains is not the wind. It is the sound of harpy wings at altitude, carried across the grass in a constant, murmuring wash that the wind takes credit for.

---

### Harpy
*Appearance:* Human from the waist up (roughly), with sharp features, wild hair, and arms that extend into broad, feathered wings spanning twice her height. From the waist down: taloned legs built for perching, gripping, and raking. Her eyes are golden, her expression is hungry, and her posture on the sandstone perch she calls home says "I was here first" in every language simultaneously.
*Behavior:* Common harpies roost on the lower sandstone ridges and hunt in the tall grass, diving on prey from above with a speed that the grass conceals until the last possible moment. They are opportunistic: if you look weak, they attack. If you look strong, they wait for you to fight something else and then attack. The concept of a fair fight is not in their vocabulary, which is extensive and mostly profanity.
*Lore:* Harpies have lived on the plains for as long as anyone can remember, which given the lifespan of people who explore the plains, may not be that long. Fen Darrow has heard reports of harpies stealing supplies from Thornwall's supply caravans, which Lira Caravel confirms with an expression that suggests the word "stealing" is an understatement.
*Combat Feel:* High evasion (10), moderate everything else. The harpy's aerial advantage translates to missed swings and wasted stamina. Ranged attacks and magic perform better than melee, because the harpy is above you and your sword is not a ladder.

### Harpy Scout
*Appearance:* Smaller and leaner than the common harpy, with narrower wings built for speed rather than power. She wears no decoration (common harpies wear scavenged trinkets; scouts consider this unprofessional) and her plumage is a mottled grey-brown that blends into the sandstone when she perches.
*Behavior:* Harpy scouts are the flock's eyes: fast, silent, and infuriatingly difficult to track. They circle at extreme altitude, mapping prey movements, and relay information to the hunting parties below through a series of calls that sound like distant screaming (and, to be fair, might actually be screaming). In combat, they dive, strike, and climb before you can turn around. Hitting one feels like trying to swat a bird with a book. The metaphor is depressingly literal.
*Lore:* Rowan Delk can identify a harpy scout overhead by the shadow pattern alone and has been known to change his gathering route based on their position. He considers this common sense. Others consider it paranoia. The distinction, on the Whispering Plains, is academic.
*Combat Feel:* The highest evasion in the harpy family (12) and the lowest HP (24). Pure hit-and-run. If your accuracy is not high enough to connect reliably, the fight becomes an extended exercise in frustration as she chips away at your health from angles you did not know existed.

### Harpy Windcaller
*Appearance:* Larger than her sisters, with plumage that shifts between grey and pale blue depending on the light. Her wings are streaked with patterns that ripple when she moves, and the air around her is never still. She does not flap so much as command, and the wind obeys with an enthusiasm that suggests it was waiting to be asked.
*Behavior:* Windcallers are the harpy family's casters, channelling the plains' constant wind into focused magical attacks. Gust on round 3 sends a blade of compressed air that hits like a physical blow. Wind Shear on round 5 is worse: a razor-edged current that cuts through armour as if it were not there. Between casts, she maintains altitude and lets the wind do the work of keeping you disoriented.
*Lore:* Vesper Tain has studied the windcaller phenomenon and concluded that harpies do not learn magic in any conventional sense. The wind on the Whispering Plains is inherently magical (it carries sounds from miles away, bends around obstacles with suspicious precision, and occasionally pushes people toward things they should not approach), and certain harpies have simply learned to speak its language. Vesper finds this "elegant." She also finds it from a safe distance.
*Combat Feel:* Magic damage, decent evasion (9), and a two-spell rotation that creates consistent pressure. Gust on round 3 is manageable. Wind Shear on round 5 is not. Physical defence is irrelevant against wind magic; only magic defence helps, and the windcaller's own magicDefence (16) means retaliating with spells is contested. The optimal approach is sustained physical burst, accepting the magic hits while closing the fight before a second Wind Shear cycle.

### Harpy Matriarch
*Appearance:* The largest harpy on the plains, perched atop the tallest sandstone spire like a raptor on a throne. Her wingspan could shade a small building. Her plumage is deep grey streaked with silver, her talons are long enough to serve as weapons and are used as such, and her eyes carry the cold, calculating intelligence of something that has been the apex predator for longer than Thornwall has existed. A crown of wind circles her head, visible as a faint distortion in the air that never, ever settles.
*Behavior:* The Harpy Matriarch does not hunt. She presides. Her flock hunts for her, and she fights only when something is foolish enough to approach her spire, which she defends with the focused violence of a queen protecting her court. Screech on round 2 (a sonic blast that drops your accuracy by 2 for two rounds, echoing the Bat Swarm Lord's tactic but from above), Talon Fury on round 4 (a diving assault of raking claws that deals heavy physical damage), and Tempest on round 7 (a concentrated storm of wind and sound that hits like the sky falling in). The Matriarch fights from above, strikes from above, and retreats to above. The ground is where her prey lives. She does not visit.
*Lore:* The Matriarch has held the tallest spire for at least a generation. Thornwall's patrols give it a wide berth, and Gavrik Stoneshoulder includes it on the map with the note "do not approach from below." The Harpy Talon Bow (I-05) is crafted from talons shed by matriarch-class harpies, which means somebody approached from below and survived. The bow is expensive because few people manage this twice.
*Combat Feel:* The harpy family's boss. Screech (round 2) cripples accuracy when you need it most (harpies are already evasion-heavy). Talon Fury (round 4) delivers the physical spike while you are still debuffed. Tempest (round 7) is the magic finisher, a tier 4 damage check. The fight demands high accuracy (to counter Screech), magic defence (to survive Tempest), and enough sustained damage to bring down 70 HP before round 7. The Matriarch is the sky made hostile.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as all bestiary entries.
- **Family overview** reframes the Whispering Plains' name: the "whispering" is harpy wings, not wind. This recontextualises Z-07's arrival text and ambient descriptions.
- **Harpy** references Fen Darrow (N-11) and Lira Caravel (N-09) on supply caravan raids.
- **Harpy Scout** references Rowan Delk (N-06) reading shadow patterns.
- **Harpy Windcaller** references Vesper Tain (N-04) on wind magic being a language rather than a spell.
- **Harpy Matriarch** references Gavrik Stoneshoulder (N-08) mapping the spire, and the Harpy Talon Bow (I-05).
- Harpy family site nouns (Roost, Aerie, Eyrie) map naturally: common harpies in roosts, scouts in aeries, the Matriarch in her eyrie atop the spire.
- **Design theme:** Harpies are the aerial evasion family, occupying a design space between bats (pure evasion) and fae (magic + evasion). Their unique quality is verticality: every description emphasises that they are above you, and the combat implications flow from that.
