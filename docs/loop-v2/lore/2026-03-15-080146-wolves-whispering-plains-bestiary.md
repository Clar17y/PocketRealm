# Mob Flavor Text: Wolves (Whispering Plains)

## Content

### Family Overview

The wolves of the Whispering Plains are the same species as their Deep Forest cousins. They are not, however, the same animal. Where the forest pack hunts through ambush and flanking, using tree cover and coordinated silence, the plains wolves are pursuit predators: built for open ground, long chases, and the simple arithmetic of endurance. A plains wolf can run at a steady lope for hours. Their prey cannot. The tall grass hides them until they choose to be seen, and by then the distance between you and them is already shorter than you would like.

The two populations split generations ago, when some wolves followed the game out of the trees and into the grasslands. The forest made its wolves clever. The plains made its wolves relentless. Rowan Delk, who has walked both territories more than any person alive, says the forest wolves will retreat if you prove difficult. The plains wolves will not. They will slow down. They will not leave.

---

### Plains Wolf
*Appearance:* Longer-legged and leaner than its forest counterpart, with a tawny coat that disappears into the waist-high grass like a stone sinking into water. Its ribcage is deep and narrow, built for sustained running, and its eyes are the same amber as the dry grass it hunts through.
*Behavior:* Plains wolves operate in loose packs that spread across the grass in a wide crescent, driving prey toward the centre. They do not hurry. They do not need to. The crescent tightens at their pace, not yours, and the grass provides no landmarks to navigate by. By the time you realise you are being herded, the question of whether you can outrun a wolf has already been answered, and the answer is no.
*Lore:* Thornwall's supply caravans lose more goods to plains wolves than to bandits, though the bandits receive more of the blame because blaming wolves lacks a satisfying narrative of villainy. Lira Caravel's inventory lists simply read "shrinkage (canine)" and she does not elaborate.
*Combat Feel:* Moderate across the board, with accuracy (14) and evasion (6) reflecting a mobile but not evasive fighting style. Lower HP than forest wolves (35 vs. 40) but similar damage output. The plains wolf is the Whispering Plains' introductory fight: a warning that the open ground does not mean open safety.

### Coyote
*Appearance:* Smaller than a plains wolf, with a narrow muzzle, overlarge ears, and a dusty grey coat that blends into the sandstone ridges. It moves with a twitchy, low-slung gait that makes it look nervous. It is not nervous. It is calculating.
*Behavior:* Coyotes run the dry riverbeds and ravines between the sandstone ridges, hunting alone or in loose pairs. They are scavengers first and predators second, preferring to let something else do the killing and arrive for the aftermath. In combat, they dart and dodge with an evasion (8) that exceeds the plains wolf's, compensating for lower HP (28) and defence with the simple strategy of not being where your weapon is.
*Lore:* Rowan Delk has an ambivalent respect for coyotes. They are the only plains predator that will eat absolutely anything, including the Windbloom herbs he gathers, which he considers a personal offense. They are also the only predator he has seen steal from a harpy's kill, which he considers either brave or evidence that coyotes cannot count (the harpy was still there).
*Combat Feel:* The glass cannon of the wolf family. Highest evasion (8) and accuracy (15) among the trash-tier wolves, but the lowest HP and defence. Missing repeatedly is frustrating. Landing a hit ends the fight quickly. Accuracy gear matters more here than raw damage.

### Warg
*Appearance:* The warg is not, technically, a wolf. It is something that wolves became when the plains selected for size, aggression, and an utter disregard for anything resembling caution. It stands at shoulder height with a grown human, its fur is coarse and dark, and its head is too large for its body in a way that suggests the skull grew faster than everything else and the jaw muscles simply kept up. Its eyes are a dull, pragmatic yellow that contains no curiosity whatsoever.
*Behavior:* Wargs hunt in disciplined pairs (the same formation the dire wolves use, adapted for open ground), but they are faster, heavier, and considerably less patient. Pounce on round 3 is exactly what it sounds like: a full-body lunge from the tall grass that covers an absurd distance and connects with enough force to knock a fully armoured adventurer sideways. Between pounces, the warg circles at close range, using its bulk to control space.
*Lore:* The warg is the Whispering Plains' answer to the Deep Forest's dire wolf: the heavy, the enforcer, the reason other predators give certain stretches of grass a wide berth. Gavrik Stoneshoulder's guild contracts for the plains list wargs separately from wolves, at a higher rate, because guild members who accepted the base wolf rate and met a warg instead sent letters that Gavrik would prefer not to receive again.
*Combat Feel:* A significant step up. HP 55, defence 16, accuracy 17, and Pounce (round 3, 9 damage) creates the plains' first real spike threat. The warg hits harder than anything in the previous wolf tiers and has the durability to survive sustained engagement. It is the gear check for the Whispering Plains' deeper exploration tiers.

### Pack Alpha (Boss)
*Appearance:* The Pack Alpha is a warg that kept growing. Its coat is a grizzled iron-grey that the wind tears at without moving, its scars are numerous and old enough to have faded to white against the dark fur, and it stands on the highest sandstone ridge in its territory like it was built there. The pack surrounds it at a respectful distance. The distance is not respect. It is self-preservation.
*Behavior:* The Pack Alpha fights from open ground, which means it fights honestly, which means it fights with overwhelming force. Howl on round 2 is a deep, resonant call that carries across the entire plains and buffs its own attack by 4 for three rounds. Savage Bite on round 4 lands during the buff window, delivering 12 damage with boosted accuracy. Frenzy on round 7 is the Pack Alpha deciding that the fight has gone on too long: a 16-damage burst that serves as both finisher and statement of intent. Unlike the Deep Forest's Alpha Wolf, which fights with the cold discipline of a ruler, the Pack Alpha fights with the direct, sustained aggression of something that has never needed walls, trees, or cover.
*Lore:* The Pack Alpha's territory is the largest single predator claim on the Whispering Plains, overlapping with both the bandit routes and the harpy thermals. Neither the bandits nor the harpies contest it. Captain Fen Darrow's patrol maps mark the Pack Alpha's range with the note "confirmed active," which is military shorthand for "go around." The Warg Hide (I-12) from its lieutenants is prized for armour crafting. The Pack Alpha itself drops nothing so pedestrian. What it drops is the knowledge that you survived.
*Combat Feel:* The Whispering Plains boss. HP 80, defence 20, accuracy 19, and a three-spell rotation that creates escalating pressure. Howl (round 2) sets up Savage Bite (round 4) for a devastating one-two during the buff window. Frenzy (round 7) punishes slow fights. The Alpha Wolf in the Deep Forest tests your gear. The Pack Alpha on the plains tests your strategy: the open ground means no terrain advantages, no retreat, and no pretending you did not know what you were walking into.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as all bestiary entries.
- **Family overview** establishes the evolutionary split between forest and plains wolves: same species, different environments, different hunting strategies. This reframes the wolf family as the only mob family that appears in two zones with distinct behavioral identities.
- **Differentiation from M-04:** Forest wolves are ambush predators (clever, coordinated silence, tree cover). Plains wolves are pursuit predators (relentless, endurance, open grass). The contrast is deliberate: players who mastered one set of tactics must adapt to the other.
- **Cross-references:**
  - Rowan Delk (N-06) anchors the family overview (comparing both populations) and the coyote entry (Windbloom theft, harpy-kill scavenging). He is the natural NPC for plains wildlife lore, given his gathering routes cross both zones.
  - Lira Caravel (N-09) referenced in the plains wolf entry with "shrinkage (canine)" inventory notation, connecting wolf predation to Thornwall's supply chain.
  - Gavrik Stoneshoulder (N-08) referenced in the warg entry through guild contract pricing, advancing his role as the practical administrator who prices danger by the complaint letter.
  - Captain Fen Darrow (N-11) referenced in the Pack Alpha entry through military patrol maps, connecting Millbrook's guard to the wider plains threat landscape.
  - Warg Hide (I-12) referenced as the Pack Alpha's lieutenants' drop, linking this bestiary to the T3 mob drops entry.
  - Harpies (M-13) referenced in the coyote's scavenging behavior and the Pack Alpha's territory overlap, establishing ecological relationships between the plains' three predator families.
- **Wolf family site nouns** (Pack, Den, Territory) map naturally: plains wolves in packs, wargs defending dens in the ravines, the Pack Alpha's territory claim on the ridges.
- **Design theme:** The plains wolves occupy the physical predator niche (strength, endurance, direct aggression) while harpies occupy the aerial evasion niche and bandits occupy the human-intelligence niche. Together, the three families create a zone where every tactical approach (tanking, dodging, outthinking) is challenged by at least one family.
- **Coyote as outlier:** The coyote is the only wolf-family member classified as a scavenger rather than a hunter, and the only one with a humorous rather than threatening personality. It serves as tonal relief in a bestiary entry that is otherwise about being chased across open ground by things that do not tire.
