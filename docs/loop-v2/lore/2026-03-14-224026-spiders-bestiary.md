# Mob Flavor Text: Spiders (Forest Edge)

## Content

### Family Overview

The spiders of the Forest Edge are the reason most adventurers learn to look up. They spin their webs between the lower canopy and the undergrowth, patient as debt collectors and roughly as welcome. Silk harvested from their nests supplies half of Millbrook's textile trade, which means the town has a complicated relationship with creatures it would otherwise prefer to set on fire.

---

### Forest Spider
*Appearance:* About the size of a spread hand, with mottled brown and green markings that blend perfectly into bark and leaf litter. Eight gleaming eyes track movement with unsettling precision.
*Behavior:* Forest spiders are ambush hunters. They sit motionless on tree trunks or low branches, waiting for something warm to wander past. Their bite is no worse than a wasp sting, but they tend to aim for the neck, which is universally unpleasant.
*Lore:* Common enough that Millbrook children grow up learning to shake out their boots every morning. The ones who forget only forget once.
*Combat Feel:* Quick and evasive, but fragile. A clean hit ends the fight. The trick is landing one before it skitters behind you.

### Web Spinner
*Appearance:* Slightly larger than the common forest spider, with a pale, bulbous abdomen and spinnerets that glisten with fresh silk. Its legs are longer, built for weaving rather than speed.
*Behavior:* Web spinners are architects, not hunters. They construct elaborate funnel webs between trees and wait for prey to stumble in. They rarely chase; they do not need to. The forest has plenty of things that do not look where they are going.
*Lore:* Millbrook's weavers pay decent coin for intact web spinner silk. The catch is that "intact" means cutting it from the web while the spinner watches, which it does not appreciate.
*Combat Feel:* Tougher than it looks, with higher defence from the layers of silk wrapped around its body. Slow to attack but hard to put down quickly.

### Venomous Spider
*Appearance:* Sleek, dark-bodied, with a crimson hourglass marking on its abdomen that nature clearly intended as a warning. Its fangs are disproportionately large, folded flat against its head until they are not.
*Behavior:* Unlike its ambush-hunting cousins, the venomous spider actively stalks prey. It moves in quick, darting bursts, closing distance before delivering a single, precise bite. Then it waits. The venom does the rest.
*Lore:* Herbalists along the Forest Edge have tried for years to develop a reliable antivenom. The current best practice is "do not get bitten," which, while technically accurate, has proven difficult to implement at scale.
*Combat Feel:* Fast and accurate, with a nasty Venom Bite on round 4 that deals extra damage. Higher evasion makes it hard to pin down. Fights tend to be quick in one direction or the other.

### Brood Mother
*Appearance:* The size of a large dog, covered in coarse black bristles. Her abdomen pulses faintly, heavy with eggs. Dozens of smaller spiders cling to her back and legs, riding along like a horrible, living cloak.
*Behavior:* Brood Mothers are territorial matriarchs who anchor themselves at the center of a nest and let nothing approach without a fight. They open with a glob of sticky webbing (Web Spit) to slow prey, then close in. If pressed, they release a cloud of concentrated venom (Poison Spray) that punishes anyone still standing nearby.
*Lore:* A single Brood Mother can produce hundreds of offspring in a season. Left unchecked, a nest can swallow whole stretches of forest path within weeks. Millbrook posts bounties on confirmed Brood Mother sightings, and those bounties are never unclaimed for long. The pay is good. The nightmares are free.
*Combat Feel:* The spider family's boss encounter. High HP and defence for her level, with Web Spit on round 3 to soften you up and Poison Spray on round 6 as a punishing finisher. Adventurers who cannot end the fight before round 6 tend to wish they had brought antivenom. Or a bigger sword.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as the Vermin entry (M-01).
- The family overview references silk trade with Millbrook, connecting to Spider Silk (a T1 mob drop, to be described in I-04) and the weavers/textile economy.
- Venomous Spider lore references herbalists, consistent with the Forest Sage resource description (I-02) and the earlier vermin bestiary's herbalist mentions.
- Brood Mother's bounty system ties into the quest/bounty board described in the Millbrook zone lore (Z-01, the cork notice board in the Town Square).
- Progressive bestiary reveal (appearance > behavior > lore) applies here as with M-01.
- Spider family site nouns from families.ts: Web (small), Nest (medium), Lair (large). The lore uses "nest" and "web" naturally to reinforce these encounter site labels.
