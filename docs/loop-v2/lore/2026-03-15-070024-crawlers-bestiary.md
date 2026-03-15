# Mob Flavor Text: Crawlers (Deep Mines)

## Content

### Family Overview

The crawlers are the Deep Mines' original tenants, predating the goblins, the golems, and the mining operation that disturbed them all. They are arthropods of improbable size, evolved (or shaped, or simply grown) in the lightless tunnels beneath the earth, and they navigate the mine by vibration, scent, and a segmented logic that resembles intelligence just enough to be unsettling. The Crawlerways that thread through the deepest levels were not carved by tools. They were bored by mandibles, polished by chitin, and maintained by generations of things that consider solid rock a minor inconvenience.

---

### Rock Crawler
*Appearance:* A multi-legged arthropod roughly the size of a large dog, with a segmented body armoured in dark, overlapping plates and mandibles that click together in a constant, rhythmic testing of the air. Its legs end in hooked claws designed for gripping stone, and its eyes (if they are eyes) are a cluster of dark, featureless bumps above the jaw.
*Behavior:* Rock crawlers patrol the connecting passages between mine shafts, scuttling along walls and ceilings with a speed that is deeply unpleasant to witness in torchlight. They are territorial and aggressive, charging anything that enters their tunnel with the direct, unsubtle approach of a creature that has never needed to be clever. The mandibles can shear through leather and dent iron, which the Crawler Fang Blade was designed to exploit and the wearer was designed to survive.
*Lore:* Rowan Delk encountered his first rock crawler twenty years ago and describes the experience with uncharacteristic animation: "Came through the wall. Did not come through a hole in the wall. Came through the wall. Made the hole on the way." The mines have been crawler territory for longer than they have been mines. Holloway's crew worked around them. The goblins work despite them. Nobody works with them.
*Combat Feel:* Moderate defence (14), decent accuracy, low evasion. A straightforward melee brawler that hits harder than its level suggests. The chitin plates provide natural armour, but the joints between them are exploitable with precision weapons. Not the hardest fight in the mines, but often the most startling.

### Cave Lurker
*Appearance:* Smaller and sleeker than the rock crawler, with a flattened body that can compress into crevices that look far too narrow to contain it. Its colouration matches the surrounding stone almost exactly, and its movements are slow, deliberate, and very nearly invisible until the moment they are not.
*Behavior:* Cave lurkers are ambush predators. They wedge themselves into gaps in the tunnel walls and wait, motionless, until something warm passes within striking distance. The attack is fast: a burst of movement, a snap of mandibles, and an immediate retreat back into the crevice. Fighting one means fighting something that is actively trying to return to a place you cannot follow.
*Lore:* Goblin miners have developed a system for detecting cave lurkers: they tap the walls with a pick and listen for the sound to come back wrong. If the echo is hollow where it should not be, something is in the wall. This technique works approximately seventy percent of the time. The other thirty percent is why goblin mining has a turnover problem.
*Combat Feel:* Higher accuracy and evasion than the rock crawler, lower HP and defence. The lurker trades durability for burst damage and survivability. Fights are quick and positional: if you connect solidly, it folds. If you do not, it will keep darting in and out of reach. Patience is punished; aggression is rewarded.

### Burrower
*Appearance:* A thick, powerful arthropod nearly twice the size of a rock crawler, with a reinforced head shield and mandibles wide enough to excavate fresh tunnel in real time. Its body is scarred by the stone it grinds through, and its hide is coated in a layer of mineral dust that makes it look like a section of tunnel that decided to become a problem.
*Behavior:* Burrowers create the Crawlerways. They are the miners of the crawler family, boring through solid rock with a dedication that would impress Rowan Delk if it were not directed at collapsing the tunnels he needs. Burrow on round 3 is exactly what it sounds like: the creature plunges into the floor, raising its evasion by 4 for two rounds as it becomes impossible to target. Ambush on round 5 is the payoff: it erupts from the stone beneath you with the full force of its mass and mandibles.
*Lore:* Burrowers are the reason the Deep Mines' lower levels are structurally unreliable. Every tunnel they create weakens the surrounding stone, and every fight that drives one underground weakens it further. Gavrik Stoneshoulder has a standing recommendation that adventurers avoid fighting burrowers near load-bearing walls. The recommendation is sensible. It is also, in the tunnels where burrowers live, almost impossible to follow.
*Combat Feel:* The crawler family's mid-boss and the first enemy with a genuine disappearing act. Burrow (round 3) makes it nearly untargetable for two rounds, then Ambush (round 5) delivers a spike of damage from an angle you cannot predict. The strategy is to front-load damage before round 3 or survive the ambush phase and finish it after it resurfaces. Magic ignores the evasion buff somewhat, which makes it the cleaner answer.

### Tunnel Wyrm
*Appearance:* The word "crawler" undersells it considerably. The Tunnel Wyrm is a segmented, armoured worm the length of a mine shaft, coiled through the deepest levels in passages it carved decades ago and has since outgrown. Its head is a blunt, armoured ram studded with grinding plates, and its body undulates through the stone with a sound like distant thunder that Thornwall's guards can feel through the floor on quiet nights.
*Behavior:* The Tunnel Wyrm fights in three escalating phases. Tremor on round 3 shakes the surrounding stone, dealing damage and disrupting footing. Acid Spit on round 5 launches a corrosive volley that ignores armour through chemical rather than physical means. Swallow on round 8 is the Tunnel Wyrm's final answer: it opens its grinding maw and attempts to consume the target whole. Nobody who has been swallowed describes the experience. The ones who avoided it describe the sound.
*Lore:* The Tunnel Wyrm is the oldest living creature in the Deep Mines, and possibly the reason the mines were abandoned in the first place. Holloway Mining Co.'s final work log (which Bram Holloway keeps in a locked drawer and does not discuss) contains a single entry for its last day of operation: "Something in Shaft 7. Pulling out." Whether the Tunnel Wyrm was the "something" is unconfirmed. The size of the tunnels in Shaft 7 is suggestive.
*Combat Feel:* The crawler family's boss. 80 HP, defence of 20, and a three-phase rotation that escalates from uncomfortable (Tremor, round 3) through dangerous (Acid Spit, round 5) to catastrophic (Swallow, round 8). Acid Spit's chemical damage bypasses physical defence, which means even tank builds feel the pressure. Swallow on round 8 is the hard timer. This fight rewards sustained, consistent damage over burst; the Wyrm has too much HP to kill in three rounds, so you need to survive long enough to kill it in seven.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as all bestiary entries.
- **Family overview** positions crawlers as the mines' original inhabitants, predating everything else. The Crawlerways (Z-06) are explained as their creation.
- **Rock Crawler** references Rowan Delk (N-06) and the Crawler Fang Blade (I-05).
- **Cave Lurker** references goblin mining techniques and their turnover problem, connecting to the goblin bestiary (M-08).
- **Burrower** references Gavrik Stoneshoulder (N-08) and structural instability, connecting to the Deep Mines zone lore (Z-06).
- **Tunnel Wyrm** references Bram Holloway (N-01) and the Holloway Mining Co. lore seed (Z-04, Z-06), revealing that Bram keeps the final work log. This is the strongest confirmation yet that the Holloway connection is real and personal. The last log entry ("Something in Shaft 7. Pulling out.") advances the abandoned mine mystery without resolving it.
- Crawler family site nouns (Tunnel, Nest, Deep Burrow) map naturally: rock crawlers in tunnels, lurkers nesting in walls, the Wyrm in its deep burrow.
- **Design theme:** Crawlers sit between the evasion families (bats) and the defence families (golems/treants). Rock Crawler and Cave Lurker show both stats, while the Burrower has a unique evasion gimmick (temporary, via Burrow). The Tunnel Wyrm leans into defence and raw power.
