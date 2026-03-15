# Mob Flavor Text: Wolves (Deep Forest)

## Content

### Family Overview

The wolves of the Deep Forest are not the rangy, half-starved scavengers of campfire stories. They are organized, patient, and unsettlingly intelligent. They hunt in formations, communicate through low-frequency howls that carry for miles, and demonstrate a grasp of flanking tactics that would embarrass most bandit patrols. The old guard at Millbrook's gate says he has heard them howling in unison on moonless nights, and unison means coordination, and coordination means something is giving orders.

---

### Young Wolf
*Appearance:* Lean and grey-furred, with oversized paws it has not yet grown into. Its eyes are bright amber, watchful and curious in the way that suggests it is learning rather than merely looking.
*Behavior:* Young wolves travel in pairs along the forest fringe, shadowing prey at a careful distance. They test boundaries constantly: darting forward, retreating, circling. They are not attacking so much as practicing, which makes them less dangerous but no less persistent. You will see them before you see anything else in the Deep Forest. That is by design.
*Lore:* The pack sends its youngest to the forest's edge as scouts. They observe, report, and occasionally pick off something small enough to manage alone. Millbrook's woodcutters have learned to read their presence as a boundary marker: where the young wolves circle, the rest of the pack is nearby.
*Combat Feel:* Fast and accurate, with decent evasion. They fight like something that expects reinforcements, which means finishing them quickly is better than fighting well.

### Forest Wolf
*Appearance:* Fully grown, dark-furred, and built for endurance. Its coat is thick enough to turn a glancing blow, and its jaws are designed for one thing with depressing efficiency.
*Behavior:* Forest wolves are the backbone of the pack: reliable, disciplined, and patient enough to trail prey for hours before committing to an attack. They prefer to strike from the side while your attention is elsewhere. They will withdraw if wounded, but not far, and not for long.
*Lore:* Experienced adventurers say the forest wolf is the most honest fight in the Deep Forest. It does not ambush, it does not use magic, and it does not hide behind armour. It simply runs at you with its teeth, and the question is whether you are faster. Usually, the wolf is faster. That is the honest part.
*Combat Feel:* A well-rounded threat. Good accuracy, solid defence, and enough damage to punish anyone who expected the Deep Forest to be gentle. The step up from Forest Edge creatures is real and immediate.

### Dire Wolf
*Appearance:* Enormous. Shoulder height of a man's waist, with a grizzled black-and-silver coat crossed by old scars. Its eyes are pale grey and carry the flat, assessing calm of something that has already decided how this ends.
*Behavior:* Dire wolves hunt in coordinated silence, which is worse than howling because at least howling tells you where they are. They strike in pairs or trios, one pinning your attention while the others close from the flanks. When they commit, they commit fully, and their jaws can shatter bone.
*Lore:* The dire wolves answer only to the Alpha. They are its lieutenants, its enforcers, and the reason that nothing else stakes a claim to the deep territories without permission. Travelers who have survived an encounter describe the experience as "educational," in the same tone people use to describe being struck by lightning.
*Combat Feel:* The first serious gear check in the Deep Forest. High accuracy, high defence, and damage that can end fights unexpectedly. Evasion drops slightly from their smaller cousins (mass has trade-offs), but everything else goes up. Respect the dire wolf, or become a cautionary tale.

### Alpha Wolf (Boss)
*Appearance:* The largest wolf in the Deep Forest, and probably the largest wolf in the Pocketrealm. Its coat is pure black, its eyes burn gold, and it moves with the deliberate gravity of something that has never needed to hurry. Scars mark its muzzle and flanks from a hundred dominance fights, all of which ended the same way.
*Behavior:* The Alpha Wolf rules from the heart of the Deep Forest, surrounded by its pack. It opens fights with a Howl that resonates through the trees and visibly strengthens every wolf in earshot (and there are always wolves in earshot). On round 5, it Lunges with a burst of speed that belies its size, closing distance in a single, devastating bound. It does not posture. It does not bluff. When the Alpha moves, it is because the decision has already been made.
*Lore:* Maren Ashwick at The Crooked Antler tells anyone who will listen that the Alpha Wolf is older than the Deep Forest itself, that it was here before the trees grew tall and will be here after they fall. This is, almost certainly, an exaggeration. But nobody has proven her wrong yet, and the wolf's territory has not shifted in living memory. The trophy from its fang (Alpha Wolf Fang) is one of the most coveted materials in Millbrook, and the adventurers who carry one do not need to explain where they got it.
*Combat Feel:* A true boss encounter. 650 base HP, punishing damage, and a two-phase threat: Howl on round 3 buffs its attack for three rounds, and Lunge on round 5 delivers a spike of burst damage. The window between rounds 3 and 5 is where most attempts succeed or fail. Bring potions. Bring your best gear. Leave your overconfidence at the gate.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as M-01, M-02, M-03.
- **Family overview** references Maren's rumour line from N-03 ("howling in unison... something's organized them"), turning her gossip into confirmed bestiary lore.
- **Young Wolf** lore explains why wolves appear at exploration tier 1 (scouts) while the pack is deeper.
- **Dire Wolf** lore confirms "coordinated silence" from the Deep Forest zone tier 3 flavor (Z-03).
- **Alpha Wolf** references Maren Ashwick by name (N-03), The Crooked Antler (Z-01), Alpha Wolf Fang trophy (boss trophy material from items.ts), and the gate (Z-01). It also connects to the Boss Hunter achievement lore (A-02: "the Alpha Wolf in its den").
- Wolf family site nouns (Pack, Den, Territory) are woven naturally: young wolves travel in packs, the Alpha rules from its den, dire wolves enforce territory.
- The progressive stat escalation (evasion-focused scouts to defence-focused heavies to the all-rounder Alpha) is explained narratively through pack roles.
