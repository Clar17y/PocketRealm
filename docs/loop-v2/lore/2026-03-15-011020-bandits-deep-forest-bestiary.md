# Mob Flavor Text: Bandits (Deep Forest)

## Content

### Family Overview

The bandits of the Deep Forest are not desperate vagrants living hand to mouth. They are organized, well-supplied, and frustratingly professional. They control the stretches of the Old Road where the banks rise steep on either side, and they extract tolls from anyone foolish enough to travel without a drawn weapon. The fact that they are human makes them worse than the wolves in some respects: wolves do not lie about their intentions, and wolves do not hold grudges.

---

### Woodland Bandit
*Appearance:* Dressed in mismatched leathers dyed forest green and brown, with a cloth wrap covering the lower face. Armed with a short sword that has seen better days but is maintained well enough to kill with. They look like someone who made a series of poor decisions and decided to commit to the last one.
*Behavior:* Woodland bandits operate in loose pairs along the forest fringe, watching the paths for travellers and reporting back to the camp. They fight competently but without flair, relying on numbers and terrain rather than individual skill. If outmatched, they retreat. If cornered, they get desperate, which is not an improvement.
*Lore:* Most woodland bandits are former labourers, failed merchants, or ex-soldiers who found that the Deep Forest offered better pay than honest work and fewer questions than the militia. Millbrook's guard captain keeps a list of known members. The list grows longer every season.
*Combat Feel:* Balanced and straightforward. Decent in every stat without excelling in any. They fight like people, which means they fight smart enough to be annoying but not smart enough to win against someone who has killed a Giant Rat and lived to tell about it.

### Bandit Scout
*Appearance:* Lighter gear than the woodland bandit, built for speed: soft boots, a hooded cloak that blends into the undergrowth, and a short bow slung across the back. Thin, quick, and difficult to pin down.
*Behavior:* Scouts are the eyes of the operation. They move through the Deep Forest alone, tracking targets, mapping patrol routes, and vanishing the instant they are spotted. In combat, they favour hit-and-run tactics: loose an arrow, relocate, repeat. Chasing one is usually a mistake, because the chase tends to end at a place the scout chose in advance.
*Lore:* The best bandit scouts were poachers before they were criminals (a distinction that Millbrook's legal system draws more finely than most). They know the Deep Forest's game trails better than the wolves do, which is how both groups manage to share territory without constant bloodshed.
*Combat Feel:* High accuracy and evasion, low HP and defence. Glass cannons that punish slow fighters. The trick is landing a hit; once you do, they fold quickly. Getting that first hit is the hard part.

### Bandit Enforcer
*Appearance:* Broad, armoured in boar leather reinforced with iron studs, and carrying a weapon that is less "sword" and more "sharpened piece of infrastructure." Scarred knuckles. Patient eyes. The kind of person whose job description includes the phrase "and whatever else needs doing."
*Behavior:* Enforcers hold territory. They stand at chokepoints along the Old Road, they guard the camp perimeter, and they make sure the smaller bandits stay in line. They do not chase. They do not need to. If you are in their space, they will make sure you leave, and they are not particular about which direction.
*Lore:* Enforcers are career bandits, the ones who stayed long enough to earn rank and scars in roughly equal measure. They answer directly to the Captain and serve as the backbone of the operation. Kessa Ironweld once remarked that she respected their armour work, if nothing else about them. She did not say it loudly enough for them to hear.
*Combat Feel:* High HP and defence, respectable damage, low evasion. The bandit equivalent of the boars: they stand their ground and dare you to move them. Fights are attrition battles that favour prepared adventurers with good gear.

### Bandit Captain
*Appearance:* Better armed and better dressed than anyone in a forest camp has a right to be. Wears a scarred iron breastplate over dark leathers, carries a longsword with a wrapped hilt, and moves with the easy confidence of someone who has won more fights than they have lost. A jagged scar runs from jaw to temple, earned and never discussed.
*Behavior:* The Captain runs the Deep Forest bandit operation from a fortified camp deep in tier 4 territory. In combat, they open with Rally (round 2), a barked command that visibly stiffens the resolve of any bandit within earshot and raises their attack for three rounds. On round 5, they close personally with Power Strike, a committed overhead blow designed to end the fight in one swing. The Captain does not fight often. When they do, it is because the situation demands their attention, and their attention is not something you want.
*Lore:* Nobody knows the Captain's real name. Maren Ashwick claims they drank at The Crooked Antler once, years ago, and paid their tab in full before disappearing into the forest. Whether this is true or simply the kind of story Maren enjoys telling is anyone's guess. What is known: the Captain commands loyalty, enforces discipline, and has turned a loose collection of thieves into something uncomfortably close to a private army.
*Combat Feel:* The bandit family's boss encounter. Rally on round 2 creates urgency (you need to deal damage before the buff multiplies their threat), and Power Strike on round 5 is a punishing spike. The Captain is well-rounded, with high stats across the board and enough HP to survive your opening salvo. This is a fight against someone who fights for a living. Plan accordingly.

## Integration Notes

- Store as `bestiaryFlavorText` on the `MobTemplate` model, same pattern as previous bestiary entries.
- **Family overview** references the Old Road (Z-03: "bandits favour the stretches where the road narrows between steep banks"), establishing the bandits as the human threat of the Deep Forest.
- **Woodland Bandit** references Millbrook's guard captain (a future NPC hook, N-11 Town Guard).
- **Bandit Scout** draws parallels with wolves for shared territory, connecting to M-04 (wolves bestiary).
- **Bandit Enforcer** references Kessa Ironweld (N-02), building inter-NPC texture. Also references boar leather, connecting to T1 mob drops (I-04).
- **Bandit Captain** references Maren Ashwick and The Crooked Antler (N-03, Z-01), continuing the pattern of the tavern as the world's rumour hub. Rally and Power Strike are mechanically explained in narrative terms.
- Bandit family site nouns (Patrol, Camp, Stronghold) map naturally: scouts and woodland bandits run patrols, enforcers guard camps, the Captain commands from the stronghold.
- **Tone distinction from beasts:** Bandits are human, so the writing leans into motivation, organisation, and moral ambiguity. They are not evil; they are practical. This makes them more unsettling than the wolves, which the family overview states directly.
