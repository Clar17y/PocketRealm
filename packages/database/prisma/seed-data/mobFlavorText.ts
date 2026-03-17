/**
 * Mob flavour text seed data
 * Sourced from docs/loop-v2/lore/*-bestiary.md
 */

export const MOB_FLAVOR_TEXT: Record<string, { appearance: string; behavior: string; lore: string }> = {
  // ── Vermin ──────────────────────────────────────────────────────────────────
  'Forest Rat': {
    appearance: 'A brown rat the size of a housecat, with matted fur and eyes like wet pebbles.',
    behavior: 'Skittish but territorial. Forest rats travel in loose clusters along the woodland floor, bolting at loud noises only to circle back the moment you turn around. They are less afraid of you than they should be.',
    lore: 'Millbrook\'s farmers consider them a seasonal nuisance, like bad weather with whiskers. Every year someone proposes a formal bounty. Every year the rats outlast the budget.',
  },
  'Field Mouse': {
    appearance: 'Tiny, pale, and unreasonably quick. You will hear it before you see it, and you will see it after it has already bitten you.',
    behavior: 'Field mice dart between patches of tall grass, striking at ankles with the confidence of something that has never looked in a mirror. They attack in quick flurries, then vanish.',
    lore: 'Herbalists near the Forest Edge blame field mice for half their missing stock. The mice have offered no comment.',
  },
  'Giant Rat': {
    appearance: 'Dog-sized, scarred, and visibly annoyed about everything. Its yellow teeth are longer than your copper dagger\'s blade.',
    behavior: 'Unlike its smaller cousins, the Giant Rat does not run. It has decided that this patch of forest belongs to it, and it will communicate this through violence.',
    lore: 'Scholars suspect something in the forest\'s soil accelerates their growth. Farmers suspect the scholars should spend less time theorizing and more time holding a pitchfork.',
  },
  'Rat King': {
    appearance: 'A writhing mass of oversized rats, tails knotted together in a greasy tangle. Several heads. One horrible purpose.',
    behavior: 'The Rat King does not hunt so much as consume. It rolls through its territory in a frenzy, lashing out at anything warm-blooded. When threatened, it enters a berserk state (Frenzy) that makes the whole mass strike faster and harder.',
    lore: 'Old Millbrook legend says a Rat King forms when vermin numbers grow unchecked for too long and the forest\'s ambient magic binds them together. Whether this is nature\'s design or nature\'s mistake, nobody can say.',
  },
  'Cave Rat': {
    appearance: 'Pale-furred and larger than its forest cousins, with oversized ears and milky, light-sensitive eyes.',
    behavior: 'Cave rats nest in the upper passages near the Cave Entrance, hunting insects and fungus. They are bolder in the dark and will swarm anything carrying a light source, apparently mistaking torches for very aggressive fireflies.',
    lore: 'Miners who once worked these caves learned quickly to check their packs each morning. Cave rats are not picky eaters, and they view leather straps as a delicacy.',
  },
  'Cavern Beetle': {
    appearance: 'A glossy black beetle the size of a dinner plate, with mandibles that could snip through a belt buckle. Its carapace reflects torchlight in oily rainbows.',
    behavior: 'Cavern beetles are scavengers first and fighters second, but they will defend their feeding grounds with surprising stubbornness. Their thick shells make them tedious to kill rather than dangerous.',
    lore: 'The beetles feed on mineral deposits in the cave walls, which hardens their carapace over time. Older specimens have been found with shells tough enough to dull iron. Millbrook\'s blacksmiths find this more interesting than the beetles would prefer.',
  },

  // ── Spiders ──────────────────────────────────────────────────────────────────
  'Forest Spider': {
    appearance: 'About the size of a spread hand, with mottled brown and green markings that blend perfectly into bark and leaf litter. Eight gleaming eyes track movement with unsettling precision.',
    behavior: 'Forest spiders are ambush hunters. They sit motionless on tree trunks or low branches, waiting for something warm to wander past. Their bite is no worse than a wasp sting, but they tend to aim for the neck, which is universally unpleasant.',
    lore: 'Common enough that Millbrook children grow up learning to shake out their boots every morning. The ones who forget only forget once.',
  },
  'Web Spinner': {
    appearance: 'Slightly larger than the common forest spider, with a pale, bulbous abdomen and spinnerets that glisten with fresh silk. Its legs are longer, built for weaving rather than speed.',
    behavior: 'Web spinners are architects, not hunters. They construct elaborate funnel webs between trees and wait for prey to stumble in. They rarely chase; they do not need to. The forest has plenty of things that do not look where they are going.',
    lore: 'Millbrook\'s weavers pay decent coin for intact web spinner silk. The catch is that "intact" means cutting it from the web while the spinner watches, which it does not appreciate.',
  },
  'Venomous Spider': {
    appearance: 'Sleek, dark-bodied, with a crimson hourglass marking on its abdomen that nature clearly intended as a warning. Its fangs are disproportionately large, folded flat against its head until they are not.',
    behavior: 'Unlike its ambush-hunting cousins, the venomous spider actively stalks prey. It moves in quick, darting bursts, closing distance before delivering a single, precise bite. Then it waits. The venom does the rest.',
    lore: 'Herbalists along the Forest Edge have tried for years to develop a reliable antivenom. The current best practice is "do not get bitten," which, while technically accurate, has proven difficult to implement at scale.',
  },
  'Brood Mother': {
    appearance: 'The size of a large dog, covered in coarse black bristles. Her abdomen pulses faintly, heavy with eggs. Dozens of smaller spiders cling to her back and legs, riding along like a horrible, living cloak.',
    behavior: 'Brood Mothers are territorial matriarchs who anchor themselves at the center of a nest and let nothing approach without a fight. They open with a glob of sticky webbing (Web Spit) to slow prey, then close in. If pressed, they release a cloud of concentrated venom (Poison Spray) that punishes anyone still standing nearby.',
    lore: 'A single Brood Mother can produce hundreds of offspring in a season. Left unchecked, a nest can swallow whole stretches of forest path within weeks. Millbrook posts bounties on confirmed Brood Mother sightings, and those bounties are never unclaimed for long. The pay is good. The nightmares are free.',
  },

  // ── Boars ────────────────────────────────────────────────────────────────────
  'Wild Boar': {
    appearance: 'A stocky, bristle-backed pig the size of a large dog, caked in dried mud that serves as a kind of natural armour. Small, furious eyes peer out from beneath a heavy brow.',
    behavior: 'Wild boars forage in loose herds through the Forest Edge undergrowth, rooting for tubers and grubs. They are not aggressive by default, but their definition of "provoked" is generous. Stepping on a twig near their wallow counts. Making eye contact counts. Existing within earshot on a bad day counts.',
    lore: 'Farmers near Millbrook have an uneasy truce with the local boar population. The boars stay in the forest; the farmers stay behind their fences. When the truce breaks down (roughly twice a season), the results are measured in property damage and bruised pride.',
  },
  'Tusked Boar': {
    appearance: 'Larger and meaner than the common wild boar, with a pair of curving yellowed tusks that jut from its lower jaw like a pair of badly installed fence posts. Scars criss-cross its hide from a lifetime of dominance fights.',
    behavior: 'Tusked boars are solitary bulls that have claimed their own stretch of forest. They patrol their territory with the single-minded intensity of a creature whose entire personality is "this is mine." They will charge anything that enters their space, including trees, rocks, and on one memorable occasion, a particularly sturdy signpost.',
    lore: 'The tusks are prized by Millbrook\'s weaponsmiths for their density and the natural curve that makes them ideal mace heads. Acquiring them is the hard part. A tusked boar does not part with its tusks willingly, and "willingly" is the only way it parts with anything.',
  },
  'Great Boar': {
    appearance: 'Massive. Shoulder height of a grown adult, with tusks the length of short swords and a hide so thick with mud and scar tissue that it resembles bark more than skin. The ground trembles faintly when it walks, which is the forest\'s way of telling you to leave.',
    behavior: 'The Great Boar rules the deepest reaches of the Forest Edge through sheer physical dominance. It does not forage so much as clear-cut, ploughing through undergrowth and saplings alike. When it charges (Charge, round 4), it covers ground with terrifying speed for something its size, lowering its head and driving forward like a battering ram with opinions.',
    lore: 'Millbrook\'s gate was reinforced three times in its history. All three times followed an encounter with a Great Boar. The current engineering consensus is that the gate will hold against a charge. The current engineering consensus has not been tested recently, and nobody is volunteering.',
  },

  // ── Wolves (Deep Forest) ─────────────────────────────────────────────────────
  'Young Wolf': {
    appearance: 'Lean and grey-furred, with oversized paws it has not yet grown into. Its eyes are bright amber, watchful and curious in the way that suggests it is learning rather than merely looking.',
    behavior: 'Young wolves travel in pairs along the forest fringe, shadowing prey at a careful distance. They test boundaries constantly: darting forward, retreating, circling. They are not attacking so much as practicing, which makes them less dangerous but no less persistent. You will see them before you see anything else in the Deep Forest. That is by design.',
    lore: 'The pack sends its youngest to the forest\'s edge as scouts. They observe, report, and occasionally pick off something small enough to manage alone. Millbrook\'s woodcutters have learned to read their presence as a boundary marker: where the young wolves circle, the rest of the pack is nearby.',
  },
  'Forest Wolf': {
    appearance: 'Fully grown, dark-furred, and built for endurance. Its coat is thick enough to turn a glancing blow, and its jaws are designed for one thing with depressing efficiency.',
    behavior: 'Forest wolves are the backbone of the pack: reliable, disciplined, and patient enough to trail prey for hours before committing to an attack. They prefer to strike from the side while your attention is elsewhere. They will withdraw if wounded, but not far, and not for long.',
    lore: 'Experienced adventurers say the forest wolf is the most honest fight in the Deep Forest. It does not ambush, it does not use magic, and it does not hide behind armour. It simply runs at you with its teeth, and the question is whether you are faster. Usually, the wolf is faster. That is the honest part.',
  },
  'Dire Wolf': {
    appearance: 'Enormous. Shoulder height of a man\'s waist, with a grizzled black-and-silver coat crossed by old scars. Its eyes are pale grey and carry the flat, assessing calm of something that has already decided how this ends.',
    behavior: 'Dire wolves hunt in coordinated silence, which is worse than howling because at least howling tells you where they are. They strike in pairs or trios, one pinning your attention while the others close from the flanks. When they commit, they commit fully, and their jaws can shatter bone.',
    lore: 'The dire wolves answer only to the Alpha. They are its lieutenants, its enforcers, and the reason that nothing else stakes a claim to the deep territories without permission. Travelers who have survived an encounter describe the experience as "educational," in the same tone people use to describe being struck by lightning.',
  },
  'Alpha Wolf': {
    appearance: 'The largest wolf in the Deep Forest, and probably the largest wolf in the Pocketrealm. Its coat is pure black, its eyes burn gold, and it moves with the deliberate gravity of something that has never needed to hurry. Scars mark its muzzle and flanks from a hundred dominance fights, all of which ended the same way.',
    behavior: 'The Alpha Wolf rules from the heart of the Deep Forest, surrounded by its pack. It opens fights with a Howl that resonates through the trees and visibly strengthens every wolf in earshot (and there are always wolves in earshot). On round 5, it Lunges with a burst of speed that belies its size, closing distance in a single, devastating bound. It does not posture. It does not bluff. When the Alpha moves, it is because the decision has already been made.',
    lore: 'Maren Ashwick at The Crooked Antler tells anyone who will listen that the Alpha Wolf is older than the Deep Forest itself, that it was here before the trees grew tall and will be here after they fall. This is, almost certainly, an exaggeration. But nobody has proven her wrong yet, and the wolf\'s territory has not shifted in living memory.',
  },

  // ── Bandits (Deep Forest) ────────────────────────────────────────────────────
  'Woodland Bandit': {
    appearance: 'Dressed in mismatched leathers dyed forest green and brown, with a cloth wrap covering the lower face. Armed with a short sword that has seen better days but is maintained well enough to kill with. They look like someone who made a series of poor decisions and decided to commit to the last one.',
    behavior: 'Woodland bandits operate in loose pairs along the forest fringe, watching the paths for travellers and reporting back to the camp. They fight competently but without flair, relying on numbers and terrain rather than individual skill. If outmatched, they retreat. If cornered, they get desperate, which is not an improvement.',
    lore: 'Most woodland bandits are former labourers, failed merchants, or ex-soldiers who found that the Deep Forest offered better pay than honest work and fewer questions than the militia. Millbrook\'s guard captain keeps a list of known members. The list grows longer every season.',
  },
  'Bandit Scout': {
    appearance: 'Lighter gear than the woodland bandit, built for speed: soft boots, a hooded cloak that blends into the undergrowth, and a short bow slung across the back. Thin, quick, and difficult to pin down.',
    behavior: 'Scouts are the eyes of the operation. They move through the Deep Forest alone, tracking targets, mapping patrol routes, and vanishing the instant they are spotted. In combat, they favour hit-and-run tactics: loose an arrow, relocate, repeat. Chasing one is usually a mistake, because the chase tends to end at a place the scout chose in advance.',
    lore: 'The best bandit scouts were poachers before they were criminals (a distinction that Millbrook\'s legal system draws more finely than most). They know the Deep Forest\'s game trails better than the wolves do, which is how both groups manage to share territory without constant bloodshed.',
  },
  'Bandit Enforcer': {
    appearance: 'Broad, armoured in boar leather reinforced with iron studs, and carrying a weapon that is less "sword" and more "sharpened piece of infrastructure." Scarred knuckles. Patient eyes. The kind of person whose job description includes the phrase "and whatever else needs doing."',
    behavior: 'Enforcers hold territory. They stand at chokepoints along the Old Road, they guard the camp perimeter, and they make sure the smaller bandits stay in line. They do not chase. They do not need to. If you are in their space, they will make sure you leave, and they are not particular about which direction.',
    lore: 'Enforcers are career bandits, the ones who stayed long enough to earn rank and scars in roughly equal measure. They answer directly to the Captain and serve as the backbone of the operation. Kessa Ironweld once remarked that she respected their armour work, if nothing else about them. She did not say it loudly enough for them to hear.',
  },
  'Bandit Captain': {
    appearance: 'Better armed and better dressed than anyone in a forest camp has a right to be. Wears a scarred iron breastplate over dark leathers, carries a longsword with a wrapped hilt, and moves with the easy confidence of someone who has won more fights than they have lost. A jagged scar runs from jaw to temple, earned and never discussed.',
    behavior: 'The Captain runs the Deep Forest bandit operation from a fortified camp deep in tier 4 territory. In combat, they open with Rally (round 2), a barked command that visibly stiffens the resolve of any bandit within earshot and raises their attack for three rounds. On round 5, they close personally with Power Strike, a committed overhead blow designed to end the fight in one swing.',
    lore: 'Nobody knows the Captain\'s real name. Maren Ashwick claims they drank at The Crooked Antler once, years ago, and paid their tab in full before disappearing into the forest. Whether this is true or simply the kind of story Maren enjoys telling is anyone\'s guess.',
  },

  // ── Treants (Deep Forest) ────────────────────────────────────────────────────
  'Twig Blight': {
    appearance: 'A knee-high tangle of dead branches, dry leaves, and pale rootlets that scuttles across the forest floor with a sound like someone crumpling parchment. It has no face, no eyes, and no obvious front end, which makes it somehow worse.',
    behavior: 'Twig blights are the forest\'s immune response in miniature. They form from deadwood animated by ambient magic, clustering near disturbed soil and fresh stumps. They attack anything that smells of sap or sawdust, which includes woodcutters, herbalists, and anyone who has recently walked through the Maple Stands.',
    lore: 'Vesper Tain has examined twig blight specimens and concluded that they are not alive in any conventional sense. They are, in her words, "an allergic reaction made of sticks." Woodcutters have a less clinical term for them that cannot be printed.',
  },
  'Bark Golem': {
    appearance: 'A humanoid mass of compressed bark, roughly the size and shape of a stocky man, standing motionless between the trees. Its surface is ridged and textured like old oak, and its eyes (if they are eyes) are two knots of dark resin that glint dully in torchlight. You have already walked past three of them today. You only noticed this one because it moved.',
    behavior: 'Bark golems stand perfectly still for hours, days, or weeks, indistinguishable from stumps or fallen trunks. They activate when something living comes within arm\'s reach, unfolding with a sound like a tree splitting in a storm. They do not pursue far from their posts, but within their range, they hit with the concentrated force of a falling limb.',
    lore: 'The Deep Forest creates bark golems the way a body creates scar tissue: automatically, at points of damage. Where trees have been felled, golems form. The more the woodcutters cut, the more golems appear. The forest is keeping score.',
  },
  'Dark Treant': {
    appearance: 'A full-grown tree, upright and walking on its roots with the careful, deliberate gait of something that has only recently learned how legs work. Its bark is blackened as if by fire, its branches are bare and clawed, and its trunk is split by a vertical fissure that might be a mouth. When it moves, the ground shakes.',
    behavior: 'Dark treants patrol the deeper stretches of the forest where the canopy blocks all sunlight. They are territorial and hostile, attacking anything that enters their range with sweeping root strikes and, on round 4, a devastating Root Slam that drives underground tendrils up through the soil beneath your feet.',
    lore: 'Dark treants are found in both the Deep Forest and the Ancient Grove, and scholars debate whether they are the same species in different habitats or distinct creatures shaped by different magic. The Deep Forest variety is smaller, angrier, and blackened by whatever tainted the inner forest decades ago. Nobody remembers what that was. The treants do, and they are not sharing.',
  },
  'Elder Treant': {
    appearance: 'Immense. A walking oak of impossible age, its trunk gnarled and scarred by centuries of weather and conflict. Moss hangs from its branches like a beard, and its root-feet leave furrows in the earth. The sound it makes when it moves is less "creaking" and more "the forest clearing its throat."',
    behavior: 'Elder treants are the Deep Forest\'s apex defenders, occupying tier 4 territory with the serene immovability of something that has outlasted everything that ever tried to threaten it. They open with Vine Whip on round 3 (fast, lashing strikes from extended branches) and build to Nature\'s Wrath on round 6: a full-body convulsion that sends a shockwave of wooden shrapnel and magical force in all directions.',
    lore: 'The elder treants predate the Deep Forest in its current form. They were here when the Old Road was new, and they watched the last settlers abandon the northern settlements without comment. Kessa Ironweld once said that elder treant heartwood would make the finest weapon handles in the Pocketrealm. She also said that trying to harvest it would be "profoundly stupid," which is the closest she comes to admitting fear.',
  },

  // ── Spirits (Ancient Grove) ──────────────────────────────────────────────────
  'Forest Sprite': {
    appearance: 'A flickering, child-sized figure of pale golden light, vaguely humanoid, with features that shift and blur like a reflection in disturbed water. It leaves no footprints. It casts no shadow. It smells, faintly, of wildflowers and warm stone.',
    behavior: 'Forest sprites drift through the outer grove in loose clusters, following the Spirit Paths with the unhurried pace of something that has nowhere specific to be and all of eternity to get there. They are not aggressive by nature, but they are curious, and their curiosity expresses itself as Sparkle (round 3): a burst of concentrated light that is beautiful, involuntary, and surprisingly painful.',
    lore: 'Vesper Tain theorises that forest sprites are fragments of the grove\'s ambient magic, condensed by the elderwood canopy into semi-autonomous forms. They are, in her words, "the forest dreaming with its eyes open." Whether they are conscious in any meaningful sense is a question that philosophers could debate for centuries.',
  },
  'Wisp': {
    appearance: 'A small, intensely bright orb of blue-white light, no larger than a fist, that bobs and weaves through the air with the erratic grace of a candle flame in a draft. Looking directly at it for too long leaves afterimages that persist for minutes.',
    behavior: 'Wisps are the grove\'s navigational hazards. They follow the Spirit Paths but frequently detour, drifting toward anything warm-blooded with a magnetism that feels deliberate. They do not attack with spells; they simply radiate magic damage through proximity, as if their existence is inherently incompatible with your comfort.',
    lore: 'The old legends say wisps are the souls of lost travellers, trapped forever in the grove\'s magic. Maren Ashwick tells this version at The Crooked Antler because it makes for a good story. The truth, as far as anyone can determine, is less romantic: wisps are condensed nodes of ambient energy that have developed a rudimentary attraction to body heat.',
  },
  'Dryad': {
    appearance: 'A tall, slender figure of living wood and woven vine, with features carved from pale bark and eyes of deep amber that hold a warmth the rest of her does not. Leaves grow from her shoulders and crown like a mantle, shifting colour with her mood: green for calm, gold for wary, red for the last thing you will see.',
    behavior: 'Dryads are the grove\'s gardeners and its guardians, tending the elderwoods and the Starbloom with a patience that turns instantly to violence when their charges are threatened. Heal Self on round 3 mends wounds with a speed that suggests her body is closer to plant than person. Thorn Burst on round 5 is less subtle: a detonation of razor-edged thorns that shred everything within reach.',
    lore: 'Dryads are bound to specific trees in the grove, and the health of one reflects the health of the other. Cutting down a dryad\'s tree kills the dryad. Killing the dryad kills the tree. This is why Rowan Delk, who will cut down almost anything, refuses to fell elderwood in certain clearings. He will not explain which ones. He does not need to.',
  },
  'Ancient Spirit': {
    appearance: 'A towering column of golden light in a vaguely human shape, twice the height of a person and rippling with power that makes the air itself hum. Its features are indistinct but its presence is absolute: the temperature drops, the elderwoods lean inward, and the Starbloom at its feet blazes like fallen stars. It does not walk. It arrives.',
    behavior: 'The Ancient Spirit is the oldest and most powerful entity in the grove, dwelling at the heart of the Sanctum. It opens with Spirit Shield on round 2 (a barrier of condensed light that raises its defence by 4 for three rounds), transitions to Soul Drain on round 4 (a targeted extraction of vitality), and culminates in Wrath on round 7 (a concentrated release of accumulated grove magic).',
    lore: 'The Ancient Spirit is the grove\'s will given form. Not its ruler (the grove has no ruler; it is its own authority) but its voice, its memory, and its final answer to anyone who has pushed past the sprites, the wisps, the dryads, and the treants and still refuses to leave. The Spirit Essence trophy dropped by its defeat is one of the rarest materials in the Pocketrealm.',
  },

  // ── Fae (Ancient Grove) ──────────────────────────────────────────────────────
  'Pixie Swarm': {
    appearance: 'A whirling cloud of tiny, luminous figures, each no larger than a dragonfly, trailing sparks of colour in their wake. Individually, they are almost charming: delicate wings, miniature features, expressions of intense concentration. Collectively, they are a headache in the most literal sense possible.',
    behavior: 'Pixie swarms descend from the canopy in glittering waves, surrounding targets in a disorienting spiral of light and sound. Confusion on round 2 is not an attack so much as a side effect of having several dozen tiny creatures screaming at you simultaneously in a language that operates on frequencies your brain was not designed to process.',
    lore: 'Pixies are the fae\'s children, or their pets, or their art projects. Nobody is sure, and asking a pixie results in an answer that takes forty minutes, involves three tangents, and concludes with the pixie forgetting the question. They are harmless individually. They are never individual.',
  },
  'Thorn Fairy': {
    appearance: 'Larger than a pixie, roughly the size of a cat, with iridescent wings like stained glass and a body that looks deceptively delicate until you notice the thorns. They grow from its arms, its spine, and the edges of its wings in sharp, dark clusters that catch the grove\'s golden light like wet needles.',
    behavior: 'Thorn fairies occupy the middle canopy, perching on branches and watching the forest floor with the detached interest of something that considers you a mild inconvenience. When provoked (which requires less than you would think), they fire Thorn Shot on round 3: a volley of barbed projectiles launched with the casual precision of someone who has been doing this for centuries.',
    lore: 'Thorn fairies are the grove\'s gardeners in the same way that a cactus is a garden: technically accurate and deeply unwelcoming. They tend the Starbloom patches and the elderwood saplings, and they treat any non-fae presence near their charges as a personal affront.',
  },
  'Fae Knight': {
    appearance: 'Human-sized, armoured in plates of living bark inlaid with crystal, carrying a sword that shimmers with enchantment and wearing an expression of aristocratic contempt that suggests it has been practising in front of a mirror. Its wings are large, angular, and held folded behind its back like a cloak.',
    behavior: 'Fae knights are the Canopy Court\'s border guard, patrolling the approaches to the Fae Queen\'s domain with the crisp discipline of soldiers serving a monarch they genuinely respect. Enchanted Blade on round 2 buffs their attack by 3 for three rounds. Fae Strike on round 5 is a committed overhead blow channelling the enchantment into a single, devastating hit.',
    lore: 'Fae knights were not born; they were appointed. Each one was once an ordinary fae that the Queen selected, elevated, and armoured through a ritual that nobody outside the Court has witnessed. The process changes them: they become taller, stronger, and significantly less whimsical, which in fae terms means they only throw things at you if you deserve it.',
  },
  'Fae Queen': {
    appearance: 'Regal and terrifying in equal measure. Tall, slender, and composed of light and living wood, with a crown of crystal branches that refracts the grove\'s ambient glow into a halo of shifting colours. Her wings span the width of a clearing, translucent and patterned like stained glass windows depicting scenes that change depending on who is looking.',
    behavior: 'The Fae Queen holds the Canopy Court and does not descend to the forest floor. Royal Guard on round 2 raises her defence by 4 for three rounds. Charm on round 4 reduces your attack by 4 for two rounds. Fae Wrath on round 6 is what happens when the Queen\'s patience expires: magic damage delivered with a serenity that makes the violence feel administrative rather than personal.',
    lore: 'The Fae Queen has ruled the Canopy Court for longer than Millbrook has existed, and she will rule it after Millbrook is a memory. She maintains alliances with the treants, tolerances with the spirits, and an ongoing territorial disagreement with the dryads that Vesper Tain has described as "the most polite war in the Pocketrealm\'s history."',
  },

  // ── Bats (Cave Entrance) ─────────────────────────────────────────────────────
  'Cave Bat': {
    appearance: 'About the size of a crow, with leathery wings stretched taut over delicate bones and a face that evolution designed for echolocation and nothing else. Its fur is dark grey, its eyes are vestigial pinpricks, and its mouth is a pink, shrieking circle of needle teeth.',
    behavior: 'Cave bats hang in clusters from the upper passages, dropping into flight when something warm enters their airspace. They attack in swooping arcs, darting in to bite and wheeling away before you can respond. Individually, they are a nuisance. In numbers, they are a legitimate problem, and they are never alone.',
    lore: 'The guano they leave behind is, according to Vesper Tain, "one of the most underappreciated alchemical substrates in the Pocketrealm." According to everyone who has to walk through it, it is something else entirely.',
  },
  'Dire Bat': {
    appearance: 'Twice the size of a common cave bat, with a wingspan that fills a tunnel from wall to wall. Its fur is jet black, its ears are enormous and constantly swivelling, and its claws are long enough to leave marks in stone. It does not look like something that should be able to fly. It flies anyway, with unsettling grace.',
    behavior: 'Dire bats are solitary hunters that sweep through the open galleries in slow, silent arcs, using echolocation to map prey from distances that would make a surface predator jealous. They strike from above, raking with claws before climbing back out of reach. They do not screech before attacking. The silence is the warning.',
    lore: 'The bat wing membrane used in crossbow construction comes primarily from dire bats, whose wings are larger, more elastic, and structurally superior to their smaller cousins\'. Harvesting them requires killing the bat first, which requires hitting the bat first, which is the part that makes the crossbows expensive.',
  },
  'Vampire Bat': {
    appearance: 'Sleek, dark-furred, and wrong. Its eyes glow a faint, dull red in torchlight, and its fangs are longer than a bat has any right to possess. The membrane of its wings has a translucent quality, and if you look closely (which you should not), you can see the veins pulsing beneath the skin.',
    behavior: 'Vampire bats do not hunt for food in the conventional sense. They hunt to sustain something that food alone cannot. Life Drain on round 3 is not just an attack; it is a transfer, pulling vitality from its target and converting it directly into healing. A vampire bat that is allowed to drain will outlast fighters with twice its stats.',
    lore: 'Vesper Tain has studied vampire bat physiology extensively and concluded that Life Drain is not magic, exactly. It is something older: a biological process that the Pocketrealm\'s ambient energy has accelerated into something that works faster than nature intended. She finds this "profoundly interesting." Her neighbours find it profoundly disturbing that she keeps samples.',
  },
  'Bat Swarm Lord': {
    appearance: 'Not a single bat but hundreds, moving as one body. A churning, screeching cloud of dark wings and red eyes that fills the upper half of whatever cavern it occupies. At its centre, barely visible, something larger holds the swarm together: a dire bat of unusual size whose echolocation pulses coordinate the colony like a heartbeat.',
    behavior: 'The Bat Swarm Lord opens with Screech on round 2, a concentrated sonic pulse that rattles your skull and reduces your accuracy for two rounds. On round 5, it releases the Swarm: the colony descends in a coordinated dive that hits like a wall of leather and teeth.',
    lore: 'The largest bat colony in the Cave Entrance roosts in a chamber so deep that torchlight cannot reach the ceiling. The Swarm Lord has claimed this space for decades, growing its colony through a combination of territorial aggression and the simple mathematics of having more bats than anything else has reasons to argue.',
  },

  // ── Goblins (Cave Entrance) ──────────────────────────────────────────────────
  'Goblin': {
    appearance: 'Small, green-skinned, and wiry, with pointed ears, yellow eyes, and a permanent expression of low-level hostility. Dressed in scraps of leather and stolen cloth, carrying a crude blade that was probably a kitchen knife in a previous life.',
    behavior: 'The common goblin operates on two principles: take what is not guarded, and run from what fights back. They patrol the upper warrens in small groups, picking through abandoned mining supplies and arguing over ownership in voices that echo through the tunnels like angry cats in a barrel.',
    lore: 'Nobody is entirely sure where the goblins came from. They were not here when Holloway Mining Co. was operational, and they were firmly established by the time anyone thought to check. The prevailing theory in Millbrook is that they came up from deeper underground. The goblins\' own origin stories mostly involve a disagreement about a turnip.',
  },
  'Goblin Archer': {
    appearance: 'Slightly thinner than the common goblin, perched on ledges and behind rock formations with a shortbow that is held together by optimism and twine. Wears a ragged hood that it clearly believes makes it invisible.',
    behavior: 'Goblin archers take elevated positions and loose arrows with surprising accuracy, then relocate before you can close the distance. Their bows are terrible. Their aim is not. This is an irritating combination, especially in narrow tunnels where "relocate" means "three steps to the left."',
    lore: 'The goblins learned archery from watching bandit scouts, which means their technique is stolen, improvised, and exactly as effective as it needs to be. Kessa Ironweld once examined a goblin shortbow and declared it "an insult to the concept of tensile strength." It still puts arrows where they are aimed.',
  },
  'Goblin Warrior': {
    appearance: 'Stockier than its kin, armoured in scavenged iron plates bolted onto a leather harness that does not fit and was never meant to. Carries a notched sword and a battered shield, both clearly looted and maintained with aggressive indifference.',
    behavior: 'Goblin warriors are the warrens\' enforcers. They hold chokepoints, guard supply caches, and keep the lesser goblins from deserting. They fight with a disciplined stubbornness that belies their scruffy appearance, blocking attacks and retaliating with measured, heavy strokes.',
    lore: 'Warrior goblins earn their position through a combination of combat skill and the ability to shout louder than everyone else. The shouting is considered the more important qualification.',
  },
  'Goblin Shaman': {
    appearance: 'Draped in a patchwork robe made from stolen cloth and cave moss, hung with trinkets that rattle with every step: bone fragments, crude gemstones, and what appears to be a very old turnip on a string. Its eyes glow faintly green, lit by the same hexwork that powers the staves it carries.',
    behavior: 'The Goblin Shaman opens with Hex on round 2 (a whispered curse that drops your accuracy), follows with Fire Bolt on round 4 (a ball of green flame), and caps with Dark Ritual on round 6 (a channelled blast of accumulated hex energy). Between casts, it retreats behind its warriors and looks smug.',
    lore: 'Goblin magic is not elegant. It is loud, messy, and powered by whatever ambient energy the shaman can siphon from the cave system\'s mineral deposits. Vesper Tain has studied goblin hexwork and concluded that it operates on principles that should not function but do, which she finds "either revolutionary or deeply offensive to established theory."',
  },

  // ── Goblins (Deep Mines) ─────────────────────────────────────────────────────
  'Goblin Miner': {
    appearance: 'Broader and more muscular than the cave goblins, with calloused hands, dust-caked skin, and a pickaxe that doubles as a weapon with zero modifications required. Wears a dented iron helmet stolen from the Holloway Mining Co. supply cache, three sizes too large, held in place by a chin strap made of goblin rag.',
    behavior: 'Goblin miners work the abandoned shafts with a manic industriousness that would be admirable if they were not also violently hostile to anyone who interrupts them. They swing their picks with the practiced rhythm of creatures who spend all day hitting rock and can hit you just as easily. They do not stop working when they fight; they just redirect.',
    lore: 'The Deep Mines goblin population exploded after they discovered the iron deposits that Holloway\'s crew left behind. They have been mining ever since, extracting ore with methods that Rowan Delk has described as "enthusiastic, unsafe, and surprisingly productive." What they do with the ore is unclear, though the Goblin Chieftain\'s throne suggests at least some of it goes to interior decorating.',
  },
  'Goblin Sapper': {
    appearance: 'Wiry and quick, with a leather bandolier of crudely-made explosive devices strapped across its chest. Its eyebrows are perpetually singed, and it wears an expression of barely-contained enthusiasm that is alarming in someone carrying that much unstable material.',
    behavior: 'Goblin sappers are the mines\' demolition specialists, equally capable of collapsing a rival goblin tunnel or using a Bomb (round 3) to make a point in combat. They prefer to maintain distance, hurling their devices before closing in. The distance is entirely for their own safety. Yours is incidental.',
    lore: 'Sappers are responsible for roughly half the structural damage in the Deep Mines, and approximately a quarter of the goblin casualties. The other sappers consider this an acceptable trade-off. The goblins who have to share a tunnel with them have a different opinion, which they express quietly and at a safe distance.',
  },
  'Goblin Foreman': {
    appearance: 'Stockier than the rank-and-file miners, with the kind of bulk that comes from years of swinging a pick and eating more than everyone else. Carries a heavy whip coiled at the hip and wears an iron badge of rank that it clearly forged itself, given the spelling.',
    behavior: 'Goblin foremen oversee the mining operations through a combination of shouting and the implied threat of Whip Crack (round 4), a buff that raises its attack and reminds everyone nearby what the whip is for. They do not mine themselves; they supervise, which in goblin culture means standing close enough to blame someone if anything goes wrong.',
    lore: 'The foreman position is the peak of Deep Mines goblin ambition for most goblins. The politics involved in reaching it are vicious, poorly documented, and occasionally explosive. The politics involved in keeping it are worse.',
  },
  'Goblin Chieftain': {
    appearance: 'Significantly larger than any other goblin, armoured in iron that was actually fitted to its body (a first in goblin history), carrying a greataxe that most goblins could not lift. A crown of bent iron nails sits askew on its head, and it wears this with complete sincerity.',
    behavior: 'The Goblin Chieftain rules the Deep Mines through a four-stage combat sequence: War Cry (round 2) buffs its attack, Cleave (round 4) delivers heavy damage during the window, Execute (round 7) finishes what Cleave started. Between abilities, it hits hard and does not stop. The Chieftain is not strategic. It is thorough.',
    lore: 'The Goblin Chieftain sits on a throne of welded mining tools and extracted ore in the deepest shaft of the Deep Mines. Whether this represents genuine civilisational achievement or just a very stubborn goblin with good raw materials is a question that Aldric Voss has filed under "pending further investigation."',
  },

  // ── Golems (Deep Mines) ──────────────────────────────────────────────────────
  'Clay Golem': {
    appearance: 'A squat, roughly humanoid figure of packed clay and cave sediment, standing motionless in alcoves along the mine shafts. Its features are unfinished, as if something started sculpting a person and lost interest halfway through. Glowing mineral flecks dot its surface like dull, unblinking eyes.',
    behavior: 'Clay golems are the most basic expression of the mines\' defensive response. They stand dormant until something living comes within arm\'s reach, then lurch to life with a grinding sound like wet pottery in a kiln. They swing slowly, heavily, and without variation. They do not learn. They do not need to.',
    lore: 'Rowan Delk says clay golems form in any mine that runs long enough without being worked. The clay accumulates ambient magic the way a sponge accumulates water, and eventually the sponge stands up. He does not find this alarming. He finds it inconvenient, which for Rowan is the same thing.',
  },
  'Stone Golem': {
    appearance: 'Larger and more defined than the clay golem, assembled from fitted blocks of mine stone that interlock without mortar. Its movements produce a grinding, tectonic sound, and its fists are solid granite that leave dents in whatever they connect with, including the floor.',
    behavior: 'Stone golems form from the structural stone of the mine itself, positioning themselves near ore deposits and reacting to any attempt at extraction with the measured hostility of a bouncer who takes his job personally. They are territorial and slow, but their defence makes them difficult to move.',
    lore: 'The stone golems in the Deep Mines have formed from the same support walls that Holloway Mining Co. installed decades ago. Kessa Ironweld finds this ironic: the infrastructure built to keep the mine open is now the thing keeping miners out. She has proposed several solutions, all of which involve hitting the golems with something heavy.',
  },
  'Iron Golem': {
    appearance: 'A massive, dark figure forged from the mine\'s own iron deposits, its body a lattice of ore veins and compacted stone that moves with a weight that makes the floor tremble. Its surface has the dull sheen of unworked iron, and its fists trail rust-coloured dust with every swing.',
    behavior: 'Iron golems patrol the deepest deposits in the mine. Ground Pound on round 4 drives both fists into the floor, sending a shockwave through the stone that hits everything standing on it. The golem does not aim Ground Pound. It does not need to. The floor is always there.',
    lore: 'The iron golems are, in a sense, made of the same material as the Iron Longsword in your hand. Gavrik Stoneshoulder finds this philosophically interesting. Kessa Ironweld finds it professionally offensive. The ore was supposed to be in a forge, not walking around hitting people with itself.',
  },
  'Crystal Golem': {
    appearance: 'A towering construct of crystal-veined stone, its body refracting light into prismatic bursts with every movement. The crystals embedded in its form pulse with a rhythmic glow, and its silhouette in torchlight looks less like a golem and more like a moving cathedral window.',
    behavior: 'The Crystal Golem fights in three phases: Crystal Barrage on round 3 (a volley of sharpened crystal shards), Harden on round 5 (a defensive surge that raises its already formidable defence by 5 for three rounds), and Shatter on round 8 (a full-body detonation of stored crystal energy).',
    lore: 'The Crystal Golem formed where the Deep Mines intersect with the Crystal Caverns below, drawing on mineral deposits from both systems. It is the most complex golem in the mines and the only one that Vesper Tain has expressed scientific interest in studying. She has not expressed interest in being present when someone fights it.',
  },

  // ── Crawlers (Deep Mines) ────────────────────────────────────────────────────
  'Rock Crawler': {
    appearance: 'A multi-legged arthropod roughly the size of a large dog, with a segmented body armoured in dark, overlapping plates and mandibles that click together in a constant, rhythmic testing of the air. Its legs end in hooked claws designed for gripping stone.',
    behavior: 'Rock crawlers patrol the connecting passages between mine shafts, scuttling along walls and ceilings with a speed that is deeply unpleasant to witness in torchlight. They are territorial and aggressive, charging anything that enters their tunnel with the direct, unsubtle approach of a creature that has never needed to be clever.',
    lore: 'Rowan Delk encountered his first rock crawler twenty years ago and describes the experience with uncharacteristic animation: "Came through the wall. Did not come through a hole in the wall. Came through the wall. Made the hole on the way." The mines have been crawler territory for longer than they have been mines.',
  },
  'Cave Lurker': {
    appearance: 'Smaller and sleeker than the rock crawler, with a flattened body that can compress into crevices that look far too narrow to contain it. Its colouration matches the surrounding stone almost exactly, and its movements are slow, deliberate, and very nearly invisible until the moment they are not.',
    behavior: 'Cave lurkers are ambush predators. They wedge themselves into gaps in the tunnel walls and wait, motionless, until something warm passes within striking distance. The attack is fast: a burst of movement, a snap of mandibles, and an immediate retreat back into the crevice.',
    lore: 'Goblin miners have developed a system for detecting cave lurkers: they tap the walls with a pick and listen for the sound to come back wrong. If the echo is hollow where it should not be, something is in the wall. This technique works approximately seventy percent of the time. The other thirty percent is why goblin mining has a turnover problem.',
  },
  'Burrower': {
    appearance: 'A thick, powerful arthropod nearly twice the size of a rock crawler, with a reinforced head shield and mandibles wide enough to excavate fresh tunnel in real time. Its body is scarred by the stone it grinds through, and its hide is coated in a layer of mineral dust that makes it look like a section of tunnel that decided to become a problem.',
    behavior: 'Burrowers create the Crawlerways. Burrow on round 3 plunges the creature into the floor, raising its evasion by 4 for two rounds as it becomes impossible to target. Ambush on round 5 is the payoff: it erupts from the stone beneath you with the full force of its mass and mandibles.',
    lore: 'Burrowers are the reason the Deep Mines\' lower levels are structurally unreliable. Every tunnel they create weakens the surrounding stone. Gavrik Stoneshoulder has a standing recommendation that adventurers avoid fighting burrowers near load-bearing walls. The recommendation is sensible. It is also, in the tunnels where burrowers live, almost impossible to follow.',
  },
  'Tunnel Wyrm': {
    appearance: 'The word "crawler" undersells it considerably. The Tunnel Wyrm is a segmented, armoured worm the length of a mine shaft, coiled through the deepest levels in passages it carved decades ago and has since outgrown. Its head is a blunt, armoured ram studded with grinding plates.',
    behavior: 'The Tunnel Wyrm fights in three escalating phases. Tremor on round 3 shakes the surrounding stone. Acid Spit on round 5 launches a corrosive volley that ignores armour through chemical rather than physical means. Swallow on round 8 is its final answer: it opens its grinding maw and attempts to consume the target whole.',
    lore: 'The Tunnel Wyrm is the oldest living creature in the Deep Mines, and possibly the reason the mines were abandoned in the first place. Holloway Mining Co.\'s final work log contains a single entry for its last day of operation: "Something in Shaft 7. Pulling out." Whether the Tunnel Wyrm was the "something" is unconfirmed. The size of the tunnels in Shaft 7 is suggestive.',
  },

  // ── Wolves (Whispering Plains) ───────────────────────────────────────────────
  'Plains Wolf': {
    appearance: 'Longer-legged and leaner than its forest counterpart, with a tawny coat that disappears into the waist-high grass like a stone sinking into water. Its ribcage is deep and narrow, built for sustained running, and its eyes are the same amber as the dry grass it hunts through.',
    behavior: 'Plains wolves operate in loose packs that spread across the grass in a wide crescent, driving prey toward the centre. They do not hurry. The crescent tightens at their pace, not yours, and the grass provides no landmarks to navigate by. By the time you realise you are being herded, the question of whether you can outrun a wolf has already been answered.',
    lore: 'Thornwall\'s supply caravans lose more goods to plains wolves than to bandits, though the bandits receive more of the blame because blaming wolves lacks a satisfying narrative of villainy. Lira Caravel\'s inventory lists simply read "shrinkage (canine)" and she does not elaborate.',
  },
  'Coyote': {
    appearance: 'Smaller than a plains wolf, with a narrow muzzle, overlarge ears, and a dusty grey coat that blends into the sandstone ridges. It moves with a twitchy, low-slung gait that makes it look nervous. It is not nervous. It is calculating.',
    behavior: 'Coyotes run the dry riverbeds and ravines between the sandstone ridges, hunting alone or in loose pairs. In combat, they dart and dodge with high evasion, compensating for lower HP and defence with the simple strategy of not being where your weapon is.',
    lore: 'Rowan Delk has an ambivalent respect for coyotes. They are the only plains predator that will eat absolutely anything, including the Windbloom herbs he gathers, which he considers a personal offense. They are also the only predator he has seen steal from a harpy\'s kill, which he considers either brave or evidence that coyotes cannot count (the harpy was still there).',
  },
  'Warg': {
    appearance: 'The warg is not, technically, a wolf. It is something that wolves became when the plains selected for size, aggression, and an utter disregard for anything resembling caution. It stands at shoulder height with a grown human, its fur is coarse and dark, and its head is too large for its body in a way that suggests the skull grew faster than everything else.',
    behavior: 'Wargs hunt in disciplined pairs, but they are faster, heavier, and considerably less patient than dire wolves. Pounce on round 3 is exactly what it sounds like: a full-body lunge from the tall grass that covers an absurd distance and connects with enough force to knock a fully armoured adventurer sideways.',
    lore: 'The warg is the Whispering Plains\' answer to the Deep Forest\'s dire wolf. Gavrik Stoneshoulder\'s guild contracts for the plains list wargs separately from wolves, at a higher rate, because guild members who accepted the base wolf rate and met a warg instead sent letters that Gavrik would prefer not to receive again.',
  },
  'Pack Alpha': {
    appearance: 'The Pack Alpha is a warg that kept growing. Its coat is a grizzled iron-grey that the wind tears at without moving, its scars are numerous and old enough to have faded to white against the dark fur, and it stands on the highest sandstone ridge in its territory like it was built there.',
    behavior: 'The Pack Alpha fights from open ground, with Howl on round 2 buffing its attack for three rounds. Savage Bite on round 4 lands during the buff window. Frenzy on round 7 is the finisher: the Pack Alpha deciding that the fight has gone on too long.',
    lore: 'The Pack Alpha\'s territory is the largest single predator claim on the Whispering Plains, overlapping with both the bandit routes and the harpy thermals. Neither the bandits nor the harpies contest it. Captain Fen Darrow\'s patrol maps mark the Pack Alpha\'s range with the note "confirmed active," which is military shorthand for "go around."',
  },

  // ── Bandits (Whispering Plains) ──────────────────────────────────────────────
  'Highway Bandit': {
    appearance: 'Dressed in dusty leather and sun-bleached cloth, with a scarf pulled over the nose and a short blade at the hip. Leaner and more weathered than their forest counterparts, shaped by wind, heat, and the long stretches of nothing between targets.',
    behavior: 'Highway bandits patrol the trade routes in pairs, watching for caravans and lone travellers from the ridgeline. They step out of the grass with weapons drawn and an offer: your goods or your health. Most people choose their goods. The ones who choose their health discover that highway bandits fight with flat, efficient competence.',
    lore: 'Lira Caravel\'s supply manifests include a line item for "route attrition" that she adjusts quarterly based on bandit activity. The number has been climbing. She does not complain about this publicly, because complaining implies she has not already priced it in, and Lira always prices it in.',
  },
  'Bandit Archer': {
    appearance: 'Lighter gear than the highway bandit, built for mobility and range: a short recurve bow, a quiver of black-fletched arrows, and soft-soled boots that make no sound on sandstone. Positioned on the ridges above the trade routes, where the elevation turns accuracy into inevitability.',
    behavior: 'Bandit archers hold the high ground. They fire from sandstone ridges and ravine lips, relocating between volleys with the unhurried confidence of someone who knows you have to climb twenty feet of loose rock before you can reach them. In close quarters they are fragile. Getting to close quarters is the problem.',
    lore: 'The Whispering Plains\' constant wind makes archery a specialist skill. The bandit archers have learned to read the grass for wind direction, timing their shots to the lulls between gusts. Rowan Delk, who reads the same wind for gathering routes, says the archers\' technique is "excellent, if you can ignore what they are pointing it at."',
  },
  'Bandit Lieutenant': {
    appearance: 'Better equipped than the rank and file: reinforced leather armour, a proper longsword, and a shield strapped to the left arm. A map case hangs from the belt, because the Lieutenant\'s job is as much planning as fighting. The expression is calm, watchful, and entirely unimpressed by you.',
    behavior: 'The Bandit Lieutenant commands the fortified ravine camps, organizing patrols and managing logistics. Dirty Trick on round 3 is exactly what it says: a thrown fistful of sand, a kicked rock, a low blow — whatever it takes to drop your accuracy for two rounds while the Lieutenant presses the advantage.',
    lore: 'Gavrik Stoneshoulder\'s guild contracts reference the Lieutenant by rank rather than name, because there are several of them and they rotate camps on a schedule that suggests someone with military training set it up. Captain Fen Darrow has a theory about which former regiment supplied the plains bandits\' officer corps. He has not shared it.',
  },
  'Bandit Warlord': {
    appearance: 'The Bandit Warlord does not look like a bandit. He looks like a general who lost his army and built a new one from whatever was available. Full plate armour, scavenged and repaired but maintained to campaign standard. A two-handed war hammer, because swords are for duels and the Warlord has no interest in duels.',
    behavior: 'The Bandit Warlord commands from the largest entrenched position on the plains. Battle Cry on round 2 buffs his attack for three rounds. Shield Bash on round 4 delivers damage and disrupts momentum. Devastating Blow on round 6 is the finisher: delivered with the full weight of a man who has been fighting since before Thornwall had walls.',
    lore: 'The Warlord is the reason the plains bandits are an army rather than a rabble. He appeared on the plains three years ago with a core of disciplined fighters and absorbed every scattered bandit group between Thornwall and the eastern routes into a single operation. The Mysterious Stranger said only: "He is building something. Whether he finishes it depends on people like you."',
  },

  // ── Harpies (Whispering Plains) ──────────────────────────────────────────────
  'Harpy': {
    appearance: 'Human from the waist up (roughly), with sharp features, wild hair, and arms that extend into broad, feathered wings spanning twice her height. From the waist down: taloned legs built for perching, gripping, and raking. Her eyes are golden, her expression is hungry.',
    behavior: 'Common harpies roost on the lower sandstone ridges and hunt in the tall grass, diving on prey from above with a speed that the grass conceals until the last possible moment. They are opportunistic: if you look weak, they attack. If you look strong, they wait for you to fight something else and then attack.',
    lore: 'Harpies have lived on the plains for as long as anyone can remember. Fen Darrow has heard reports of harpies stealing supplies from Thornwall\'s supply caravans, which Lira Caravel confirms with an expression that suggests the word "stealing" is an understatement.',
  },
  'Harpy Scout': {
    appearance: 'Smaller and leaner than the common harpy, with narrower wings built for speed rather than power. Wears no decoration (common harpies wear scavenged trinkets; scouts consider this unprofessional) and her plumage is a mottled grey-brown that blends into the sandstone when she perches.',
    behavior: 'Harpy scouts are the flock\'s eyes: fast, silent, and infuriatingly difficult to track. They circle at extreme altitude, mapping prey movements, and relay information through calls that sound like distant screaming. In combat, they dive, strike, and climb before you can turn around.',
    lore: 'Rowan Delk can identify a harpy scout overhead by the shadow pattern alone and has been known to change his gathering route based on their position. He considers this common sense. Others consider it paranoia. The distinction, on the Whispering Plains, is academic.',
  },
  'Harpy Windcaller': {
    appearance: 'Larger than her sisters, with plumage that shifts between grey and pale blue depending on the light. Her wings are streaked with patterns that ripple when she moves, and the air around her is never still. She does not flap so much as command, and the wind obeys.',
    behavior: 'Windcallers are the harpy family\'s casters, channelling the plains\' constant wind into focused magical attacks. Gust on round 3 sends a blade of compressed air. Wind Shear on round 5 is worse: a razor-edged current that cuts through armour as if it were not there.',
    lore: 'Vesper Tain has studied the windcaller phenomenon and concluded that harpies do not learn magic in any conventional sense. The wind on the Whispering Plains is inherently magical, and certain harpies have simply learned to speak its language. Vesper finds this "elegant." She also finds it from a safe distance.',
  },
  'Harpy Matriarch': {
    appearance: 'The largest harpy on the plains, perched atop the tallest sandstone spire like a raptor on a throne. Her wingspan could shade a small building. Her plumage is deep grey streaked with silver, and her eyes carry the cold, calculating intelligence of something that has been the apex predator for longer than Thornwall has existed.',
    behavior: 'The Harpy Matriarch does not hunt. She presides. Screech on round 2 drops your accuracy for two rounds. Talon Fury on round 4 delivers heavy physical damage during the debuff. Tempest on round 7 is a concentrated storm of wind and sound that hits like the sky falling in.',
    lore: 'The Matriarch has held the tallest spire for at least a generation. Thornwall\'s patrols give it a wide berth, and Gavrik Stoneshoulder includes it on the map with the note "do not approach from below." The Harpy Talon Bow is crafted from talons shed by matriarch-class harpies, which means somebody approached from below and survived.',
  },

  // ── Undead (Haunted Marsh) ───────────────────────────────────────────────────
  'Skeleton': {
    appearance: 'Yellowed bone held together by sinew that should have rotted centuries ago and a faint, greenish luminescence that clings to the joints. The skull is usually missing the jaw, which does not stop it from trying to bite. Its weapons are corroded relics of whatever it held when it died.',
    behavior: 'Skeletons rise from the mud of the Bonefields with the unhurried patience of something that has all the time in the world and no concept of urgency. They walk in straight lines toward anything living, swinging whatever they are holding. There is no strategy, no coordination, and no retreat.',
    lore: 'The bones surface through the marsh\'s mud in cycles, like geological deposits that happen to be armed. Gavrik Stoneshoulder\'s guild contracts for the Bonefields include a standard caveat: "Count will vary. Terrain provides." He means that the number of skeletons in any given stretch depends on what the mud feels like giving up that day.',
  },
  'Zombie': {
    appearance: 'A waterlogged corpse in various stages of decomposition, swollen and discoloured by the marsh\'s brackish immersion. It moves with a lurching, mechanical gait, the motion of muscles that have forgotten the sequence but whose body refuses to acknowledge the error. The smell arrives before the zombie does, which is the only warning you get.',
    behavior: 'Zombies are slower than skeletons but considerably more durable, absorbing damage with the indifference of something that does not process pain and has no attachment to the integrity of its own limbs. They swing with their fists, their jaws, or whatever part of themselves connects first.',
    lore: 'The marsh\'s zombies are the most recent dead: adventurers, travellers, and (Captain Fen Darrow suspects, though he does not say it publicly) missing members of Thornwall\'s eastern patrols. The armour scraps and guild insignia occasionally visible on the fresher specimens are politely not discussed.',
  },
  'Wraith': {
    appearance: 'A translucent figure of pale light and darker absence, drifting through the marsh mist as if the mist were its element and the world were the intrusion. It has the outline of a person but the details have dissolved. The temperature drops when a wraith approaches. The mist thickens.',
    behavior: 'Wraiths do not walk. They drift, materialising from the mist without warning. Life Drain on round 3 deals magic damage and heals the wraith for the same amount. Fear on round 5 drops your attack for two rounds, flooding your mind with the cold certainty of your own eventual end.',
    lore: 'Wraiths are what remains when the marsh\'s preservation fails to keep the body but succeeds in keeping the will. They are the angriest dead, the ones who died badly enough that the manner of their death became their entire personality. Vesper Tain classifies them as "concentrated necromantic residue."',
  },
  'Death Knight': {
    appearance: 'The Death Knight is not a skeleton with armour. It is an armoured presence that happens to contain bones. Full plate, blackened and corroded but intact, sealed at every joint. The helmet visor is down, and behind it there is nothing but a faint, cold light that tracks your movement with the precision of something that was, in life, very good at killing.',
    behavior: 'The Death Knight fights with military discipline. Dark Aura on round 2 buffs its attack for three rounds. Soul Strike on round 4 delivers magic damage during the buff window, bypassing physical armour entirely. Death Blow on round 7 is the executioner\'s swing: 20 physical damage from a greatsword that has been killing for longer than most adventurers have been alive.',
    lore: 'The Death Knight is the one undead in the Haunted Marsh that Vesper cannot explain with environmental animation. It moves with intent. It fights with technique. The Mysterious Stranger said: "It was a soldier. It is still a soldier. The only thing that changed is what it serves, and what it serves does not have a name yet."',
  },

  // ── Swamp Beasts (Haunted Marsh) ─────────────────────────────────────────────
  'Bog Toad': {
    appearance: 'Roughly the size of a large dog, with mottled grey-green skin, bulging amber eyes, and a mouth that opens wider than anything that size has a right to. It sits motionless on mud banks and fallen bogwood logs, indistinguishable from a rock until the rock blinks.',
    behavior: 'Bog toads are ambush predators. They sit, they wait, they strike with a tongue that moves faster than you can react. Tongue Lash on round 3 deals magic damage from a muscular appendage that Vesper classifies as "technically a limb and practically a weapon."',
    lore: 'Bog toads have been in the marsh for as long as the marsh has existed. Their Bog Hearts pulse for hours after extraction, a property that Vesper attributes to chemical reactions and adventurers attribute to the marsh being fundamentally wrong about how biology works.',
  },
  'Marsh Crawler': {
    appearance: 'A broad, low-slung reptile approximately six feet long, armoured in overlapping plates of mud-darkened chitin, with short, powerful legs built for traction on soft ground. Its head is flat and blunt, and its eyes sit on top of its skull, level with the waterline. You see the eyes. You do not see the rest.',
    behavior: 'Marsh crawlers patrol the waterways between the Bogwood Groves and the Iron Mires. They are territorial rather than predatory: they will not chase you, but they will not let you pass. No spells. No tricks. Just defence and the patience of something that does not need to be clever to win.',
    lore: 'Miners working the Iron Mires consider marsh crawlers a routine hazard, in the same way that one might consider the tide routine. Gavrik\'s guild contracts for the Mires include a standard warning: "Crawlers claim the water. Work from the banks."',
  },
  'Swamp Hydra': {
    appearance: 'Three heads on thick, muscular necks rising from a body that is mostly submerged. The heads are serpentine, scaled in dark green and black, each capable of independent movement and each one watching a different direction. The body, when it surfaces, is the size of a small boat.',
    behavior: 'Swamp hydras occupy the wider channels of the mid-marsh, surfacing without warning. Acid Spray on round 3 deals damage as one head vomits corrosive bile. Regenerate on round 5 heals 6 HP, because the hydra\'s biology has decided that fairness is optional and recovery is mandatory.',
    lore: 'Kessa Ironweld works Hydra Scale into shields and heavy armour, and she says the only material harder to work is "the hydra itself," which is the closest she comes to admitting respect for a living thing. The hydra\'s regeneration is biological rather than magical, which means it cannot be dispelled.',
  },
  'Ancient Crocodile': {
    appearance: 'The Ancient Crocodile is not a crocodile that grew old. It is a geological feature that learned to bite. Thirty feet of armoured predator lying in the deepest channel of the Haunted Marsh, its hide so encrusted with mud, algae, and mineral deposits that the waterline cannot tell where the bank ends and the crocodile begins.',
    behavior: 'The Ancient Crocodile fights with unhurried violence. Death Roll on round 3 delivers heavy physical damage. Submerge on round 5 drops it below the waterline, boosting evasion by 5 for two rounds as you swing at turbid water and miss. Jaws on round 7 delivers 18 damage with the full closing force of a mouth that was ancient when the marsh was young.',
    lore: 'The Ancient Crocodile appears in Thornwall\'s maps with the label "confirmed resident." Gavrik\'s contracts for the deep channels pay triple the base rate, and even then, takers are few. Captain Fen Darrow\'s patrol maps mark the crocodile\'s channel with a single word: "No." The word has not needed updating.',
  },

  // ── Witches (Haunted Marsh) ──────────────────────────────────────────────────
  'Hag Servant': {
    appearance: 'Stooped, robed in layers of marsh-stained cloth, with a face obscured by a low hood and hands that glow faintly with greenish light. Whether the hag servant is a person who became this or was always this is a question that Vesper has asked and the witches have not answered.',
    behavior: 'Hag servants patrol the edges of the Coven Hollows, casting from behind thorn screens and retreating when pressed. Curse on round 3 drops your defence for two rounds, stripping your armour\'s effectiveness at the exact moment the servant\'s allies close in.',
    lore: 'The relationship between hag servants and the coven is unclear. They may be apprentices. They may be victims. The distinction, in the Coven Hollows, is philosophical rather than practical: they serve, they cast, and they do not leave. Gavrik\'s guild contracts list them as "hostile caster, tier 1" and do not speculate further.',
  },
  'Cursed Villager': {
    appearance: 'A person. That is the worst part. The Cursed Villager is recognisably human: tattered clothing, calloused hands, a face that was ordinary before something was done to it. The eyes are wrong, though: milky, unfocused, and tracking you with a precision that the blank expression does not match.',
    behavior: 'Cursed villagers attack with desperate, uncoordinated violence: fists, improvised weapons, whatever their hands find. The strength behind it is more than a person that size should have, because the curse sustains what the body cannot. No spells. No magic. Just physical damage and the awful durability of someone who no longer feels pain.',
    lore: 'Nobody knows where the cursed villagers come from. Captain Fen Darrow has his suspicions: travellers who wandered too deep, patrol members who never returned, people the marsh took and the witches kept. The fact that cursed villagers are classified under "witches" rather than "undead" is a distinction that matters to Aldric\'s filing system and to nobody else.',
  },
  'Bog Witch': {
    appearance: 'Tall, gaunt, and dressed in the Witch Cloth that Vesper cannot identify: dark fabric that repels water, resists fire, and hums at frequencies that make nearby potions bubble. Her face is painted with symbols in a pigment that glows faintly in the mist, and her staff is bogwood crowned with a crystal that pulses in rhythm with her heartbeat.',
    behavior: 'Bog witches are the coven\'s practitioners. Hex on round 2 drops your accuracy for two rounds. Shadow Bolt on round 4 delivers damage while you are debuffed. Drain Life on round 6 deals damage and heals the witch, extending a fight you needed to end two rounds ago.',
    lore: 'The bog witches weave the Witch Cloth that adventurers covet and Vesper cannot reverse-engineer. Their magic is old, older than the marsh\'s necromancy, and Vesper believes it may be the reason the marsh is necromantic at all: the witches did not come to the marsh for its magic. The magic came because of them.',
  },
  'Coven Mother': {
    appearance: 'The Coven Mother does not look like her servants. She looks like what they are trying to become. Tall, angular, with skin that has the grey-green tint of the marsh itself and eyes that glow with a cold, steady light that does not flicker. The symbols on her face and hands are not paint: they are part of her.',
    behavior: 'The Coven Mother fights with a four-spell rotation. Dark Shield on round 2 buffs her defence for three rounds. Poison Cloud on round 4 delivers magic damage. Curse of Weakness on round 6 strips your defence. Cataclysm on round 8 delivers 18 magic damage to whatever is left.',
    lore: 'The Coven Mother is the oldest and most powerful witch in the Haunted Marsh, and possibly the oldest living human in the Pocketrealm ("living" is used loosely). The Mysterious Stranger said: "She learned the marsh\'s language before anyone else thought to listen. What she heard, she kept. What she kept, she became."',
  },

  // ── Goblins (Crystal Caverns) ────────────────────────────────────────────────
  'Goblin Gem Hunter': {
    appearance: 'A goblin adapted to the Crystal Caverns\' brightness: eyes permanently squinted, skin paler than its Deep Mines cousins, and hands calloused from cutting and prying gems from crystal formations. Carries a short blade and a satchel that jingles with loose gemstones.',
    behavior: 'Goblin gem hunters work the outer formations, chipping at crystal deposits with practised efficiency and treating any intruder as a rival claim-jumper. They fight scrappily, using the caverns\' light refractions to disorient opponents and strike from unexpected angles.',
    lore: 'Gem hunters are the Crystal Caverns\' prospectors: first in, fastest out, and absolutely not sharing the location of what they found. Lira Caravel has unsuccessfully attempted to bribe several. They take her coin and give her false coordinates, which she has grudgingly noted in her ledger as "tolerable ROI for the information density."',
  },
  'Goblin Tunneler': {
    appearance: 'Built like the Deep Mines\' miners but shorter, with thick-soled boots designed to grip crystal floors and a drilling device of goblin manufacture strapped to one arm. The device is loud, leaks occasionally, and has definitely exploded at least once based on the blast marks on the tunneler\'s left side.',
    behavior: 'Goblin tunnelers bore new passages between crystal formations with the focused efficiency of creatures that have been doing this since the Crystal Caverns were discovered. In combat, they use their drilling equipment as a bludgeon and their knowledge of the terrain to fight from positions that put crystal formations between you and them.',
    lore: 'The tunnelers are the Goblin King\'s infrastructure corps, extending the goblin warren deeper into the caverns every season. Vesper Tain has noted that their passages follow the crystal density gradients with a precision that suggests either geological intuition or surveying equipment better than anything Thornwall possesses.',
  },
  'Goblin Artificer': {
    appearance: 'Distinguished from other goblins by the array of gadgets, gizmos, and incomprehensible devices attached to its person at various angles. Wears magnifying lenses ground from cavern crystal, carries tools in seventeen pockets, and moves with the distracted purpose of something that is already thinking three problems ahead.',
    behavior: 'Goblin artificers apply engineering principles to combat. Bomb Trap on round 3 deploys a crystalline explosive that deals significant damage. Gadget Shield on round 5 activates a device that raises its defence for three rounds. Everything it does is practical, effective, and held together with goblin ingenuity and the kind of confidence that comes from having survived previous attempts.',
    lore: 'Artificers are the Goblin King\'s elite engineers, responsible for the mechanical marvels that have made the Crystal Caverns\' goblin population the most technologically sophisticated in the Pocketrealm. Aldric Voss has a separate file for goblin patents. It is growing faster than his filing system can accommodate.',
  },
  'Goblin King': {
    appearance: 'The largest goblin in the Pocketrealm, standing nearly as tall as a short human, adorned in a crown of hammered gold set with rough-cut gemstones and wearing plate armour that, for the first time in goblin history, actually fits. Its eyes are sharp, its posture is commanding, and it carries a golden mace that is both sceptre and weapon.',
    behavior: 'The Goblin King fights with four abilities that escalate relentlessly: Royal Decree on round 2 (a bellowed command that buffs attack), Golden Strike on round 4 (a heavy, gilded blow), Gem Barrage on round 6 (crystalline shrapnel), and Crown\'s Fury on round 8 (a devastating final attack). It does not fight often. When it does, it fights like a king.',
    lore: 'The Goblin King is the endpoint of goblin civilisation, the proof that given enough time, resources, and enemies, even goblins can build something that resembles a monarchy. Aldric Voss has a file on the Goblin King. It is the thickest file in his ledger. He will not say why.',
  },

  // ── Golems (Crystal Caverns) ─────────────────────────────────────────────────
  'Gem Construct': {
    appearance: 'A golem built entirely from raw gemstone: faceted, translucent, and catching the caverns\' ambient light in a way that makes it difficult to tell where the construct ends and the crystal formations begin. Its body clicks and chimes with every step, like a chandelier learning to walk.',
    behavior: 'Gem constructs are the Crystal Caverns\' sentinels, standing among the formations until disturbed. They fight with the same slow, deliberate violence as their Deep Mines cousins, but their gemstone composition scatters torchlight unpredictably, making them harder to read than their zero evasion would suggest.',
    lore: 'Lira Caravel has received offers from Thornwall\'s artificers to "acquire" gem construct fragments. She declines, not out of ethics, but because the fragments destabilise within hours of being separated from the construct, turning from priceless gemstone to worthless gravel. The Pocketrealm\'s economy has limits, and most of them are annoying.',
  },
  'Diamond Golem': {
    appearance: 'A golem of compressed diamond and crystal, so dense that light bends around it rather than passing through. Its surface is mirror-smooth and blindingly bright in direct torchlight. Hitting it feels like hitting a cliff face, and it sounds like it too.',
    behavior: 'Diamond golems guard the caverns\' richest deposits. Crystal Slam on round 4 delivers a concentrated blow that channels the golem\'s mass into a single, devastating impact. Diamond Shell on round 6 raises defence by 5 for three rounds, turning an already impenetrable surface into something that belongs in a geological textbook rather than a bestiary.',
    lore: 'A Thornwall artificer once calculated the material value of a diamond golem\'s body. The number was large enough that she sat down, stared at the wall for ten minutes, and then quietly tore up the calculation. Some prices are too high to know.',
  },
  'Golem Overlord': {
    appearance: 'The largest golem in the Pocketrealm. A cathedral of living mineral, crystal, and compressed ore that fills the passage it occupies and moves with the slow, inexorable momentum of a geological event. Its core pulses with light visible through cracks in its surface. It does not have a face. It does not need one.',
    behavior: 'The Golem Overlord fights with a four-ability rotation. Shockwave on round 3 hits everything in range. Crystal Prison on round 5 reduces your evasion by 6 for three rounds. Overload on round 7 releases stored mineral energy. Collapse on round 9 brings the ceiling down — not metaphorically.',
    lore: 'Nobody knows whether the Golem Overlord was created or whether it grew. The Crystal Caverns have existed for longer than any settlement in the Pocketrealm, and the Overlord has been at their centre for at least as long. It is not defending the caverns from intruders. It is the caverns, compressed into a form that can object in person.',
  },

  // ── Elementals (Crystal Caverns) ─────────────────────────────────────────────
  'Shard Elemental': {
    appearance: 'A floating cluster of crystal fragments arranged in a vaguely humanoid silhouette, held together by visible lines of arcane force that crackle faintly between the shards. The fragments rotate slowly around a central core of pale light, and the light intensifies when it detects your presence.',
    behavior: 'Shard elementals drift through the caverns\' mid-levels, drawn to sources of arcane disturbance. Crystal Shard on round 3 fires a fragment at high velocity, dealing magic damage. Between spells, it deals magic damage through proximity: the shards vibrate at frequencies that disrupt biological matter.',
    lore: 'Shard elementals form spontaneously in areas of high crystal density, condensing from ambient arcane energy the way dew condenses from humid air. They dissipate when defeated, their fragments scattering and losing their glow within minutes. Vesper has a collection of them. She says they are "just crystals now," in a tone that suggests she is disappointed.',
  },
  'Crystal Wisp': {
    appearance: 'A small, floating orb of cold, blue-white light, approximately the size of a fist, trailing luminous threads that dissolve into the air behind it. It moves through the caverns with the drifting, unhurried motion of something that has nowhere to be and infinite time to not be there.',
    behavior: 'Crystal wisps are the simplest elementals: no spells, no debuffs, just magic damage delivered through contact with the luminous threads they trail. In combat they are fragile and evasive, flickering in and out of visibility as they reposition between attacks.',
    lore: 'Crystal wisps are the caverns\' most common elemental and the reason first-time visitors think the Crystal Caverns are safe. They look like decoration. The light they cast is genuinely pleasant. Rowan Delk says the wisps "improve the ambiance considerably, right up to the moment they stop being ambient and start being personal."',
  },
  'Storm Crystal': {
    appearance: 'A jagged, freestanding crystal formation that has pulled itself from the cavern wall and begun to move. Roughly humanoid in shape but with proportions that are wrong: too angular, too faceted, and crackling with arcs of electrical energy. The air around a storm crystal smells of ozone and tastes of metal.',
    behavior: 'Storm crystals patrol the deep chambers, moving with a grinding deliberation. Lightning Arc on round 3 fires a bolt of crystallised electrical energy for 9 magic damage. Static Field on round 5 creates a zone of disrupted energy that drops your evasion by 4 for two rounds, pinning you in place for what follows.',
    lore: 'Vesper believes storm crystals are shard elementals that reached a critical mass of absorbed energy and crystallised into a more stable form. If she is right, the Crystal Caverns are a lifecycle: ambient energy becomes wisps, wisps become shards, shards become storms. She has not observed the transition directly. She would very much like to, from behind something thick.',
  },
  'Crystal Titan': {
    appearance: 'The Crystal Titan is the Resonance Chamber made ambulant. A towering figure of interlocking crystal plates, each one singing at a different frequency, assembled into a form that is roughly humanoid in the way that a cathedral is roughly a building. Its core is a sphere of concentrated light so bright that looking directly at it leaves a coloured afterimage that does not fade for minutes.',
    behavior: 'The Crystal Titan fights with four escalating spells. Resonance on round 2 buffs its attack for three rounds. Crystal Storm on round 4 fires crystal fragments for 12 magic damage. Prism Beam on round 6 delivers 16 magic damage. Shatter All on round 8 deals 22 magic damage, the highest single-hit magic damage in the tier 4 zones.',
    lore: 'The Crystal Titan does not patrol. It resides. The Mysterious Stranger said of the Titan: "It is not alive. It is not dead. It is the third thing, the one that the caverns are still deciding." Kessa Ironweld, who has seen the mithril veins pulse in time with the Titan\'s movements, says simply: "Do not mine near it. The stone objects."',
  },

  // ── Undead (Sunken Ruins) ────────────────────────────────────────────────────
  'Drowned Sailor': {
    appearance: 'A waterlogged corpse in salt-crusted clothing, swollen and discoloured by centuries of submersion. The clothing is naval: rope belts, canvas jackets, and boots designed for deck work, all preserved by the saltwater into a state of permanent decay that progresses no further.',
    behavior: 'Drowned sailors stumble through the flooded entrance halls, performing fragments of duties they can no longer complete. They attack anything that disrupts their patrol, swinging waterlogged fists and improvised weapons with the mechanical repetition of something that has not received a new order in a very long time.',
    lore: 'The drowned sailors are the oldest mindless undead in the Pocketrealm, predating the Haunted Marsh\'s skeletons by centuries. They were the lost civilisation\'s workforce. When the water rose, they drowned. When the Lich\'s will reached the entrance halls, they stood up and resumed. They have been resuming ever since.',
  },
  'Skeletal Knight': {
    appearance: 'A skeleton in armour, which is where the similarity to the Haunted Marsh\'s bone patrols ends. The Skeletal Knight\'s armour is intact, articulated, and made from a dark metal alloy that Kessa cannot identify. The bones inside are white, clean, and held in formation by the armour itself, which moves as if it remembers the body it was built for.',
    behavior: 'Skeletal knights patrol the mid-ruins in precise two-by-two formations, holding corridors and intersections with the mechanical discipline of a military that was professional in life and has not received orders to stand down in death. They do not speak. They simply maintain formation and engage anything that enters their section.',
    lore: 'The skeletal knights were the lost civilisation\'s military, and they are the strongest evidence that the civilisation had one. Their formations are textbook, and whoever wrote the textbook had a military philosophy that Captain Fen Darrow recognises as "uncomfortably sophisticated." He has asked Aldric to stop showing him the patrol maps. Aldric has not stopped.',
  },
  'Spectral Captain': {
    appearance: 'A translucent figure in a uniform that glows with cold, pale light. The uniform is military: high-collared, decorated with insignia that Aldric Voss has catalogued but cannot read, fitted to a frame that is no longer quite physical. The Captain\'s face is visible, which is worse than the faceless wraiths: this one has features, rank, and the expression of someone who is still, after all this time, on duty.',
    behavior: 'Spectral captains lead patrols of skeletal knights through corridors they have walked for centuries. Ghost Blade on round 3 deals 10 magic damage, bypassing physical armour. Spectral Chains on round 5 drops your evasion by 5 for two rounds, pinning you for the follow-up.',
    lore: 'The spectral captains are the Lich\'s intermediary officers: powerful enough to sustain their own presence, disciplined enough to maintain formations, and intelligent enough to recognise you as a threat. The Mysterious Stranger said, of the captains: "They are loyal to the last order. The last order was: hold."',
  },
  'Lich': {
    appearance: 'The Lich occupies the Throne Hall the way a thought occupies a mind: completely, invisibly, and with the quiet certainty that it was always there. It has a body, or what remains of one: a skeletal frame draped in robes that were ancient when the water rose, sitting on a throne of carved stone. Its skull is intact, its eye sockets burn with a light that is not fire and not magic but something older than both.',
    behavior: 'The Lich fights with a four-spell rotation. Death Ward on round 2 buffs its defence for three rounds. Necrotic Bolt on round 4 delivers 14 magic damage. Raise Dead on round 6 buffs its attack for three rounds. Soul Harvest on round 8 deals 22 magic damage: a direct extraction of vitality so thorough that Vesper described it as "not a spell — a thesis statement."',
    lore: 'The Lich is the will that animates the Sunken Ruins\' dead. It was a person once: the leader or high priest or architect of the lost civilisation. When the civilisation fell and the water rose, the Lich chose not to follow. It bound its will to the Throne Hall and continued issuing orders to a military that could no longer disobey, because the dead do not resign.',
  },

  // ── Serpents (Sunken Ruins) ──────────────────────────────────────────────────
  'Sea Snake': {
    appearance: 'A sleek, muscular serpent approximately four feet long, with banded scales of dark grey and blue-green that render it nearly invisible in the ruins\' murky water. Its head is narrow and blunt, its eyes adapted for the lightless corridors, and its mouth contains fangs that fold flat against the jaw until the moment they do not.',
    behavior: 'Sea snakes coil between the submerged columns of the entrance halls, hunting by vibration and thermal sense. They are ambush predators: motionless in the water until prey passes within range, then fast enough to close the gap before you process the movement. Venom Strike on round 3 delivers damage with a toxin that lingers.',
    lore: 'Sea snakes are the Sunken Ruins\' most common predator and the first thing most adventurers encounter upon entering the flooded corridors. They are not venomous enough to be dangerous individually. They are, however, rarely individual. Rowan Delk says the trick to avoiding sea snakes is to move slowly and never touch the columns.',
  },
  'Marsh Viper': {
    appearance: 'Shorter and thicker than the sea snake, with a triangular head, slit-pupil eyes, and mottled brown-green scales that blend into the silt and debris of the flooded floors. The viper coils in the shallows, its body barely submerged, watching the surface with the patience of something that has nowhere to be and intends to stay.',
    behavior: 'Marsh vipers hunt the shallower pools and flooded doorways of the mid-ruins, striking at anything that wades through their territory. No spells, no tricks; just high accuracy and evasion delivered through pure, efficient physical violence. The viper does not chase. It does not retreat.',
    lore: 'Marsh vipers are believed to have migrated into the Sunken Ruins from the Haunted Marsh, following the water table down through flooded tunnels. They have adapted to the saltwater with an efficiency that Vesper finds concerning, because species do not adapt this fast without environmental pressure.',
  },
  'Naga Warrior': {
    appearance: 'From the waist up, the Naga Warrior could pass for human if you did not look at the eyes: cold, vertical-slit pupils in a face that is beautiful in the way that a blade is beautiful. From the waist down: a powerful serpentine body of iridescent scales. The warrior carries a trident and a scale shield, both crafted from materials that predate anything in Thornwall\'s armoury.',
    behavior: 'Naga warriors guard the approaches to the inner sanctum, patrolling in pairs and communicating through sub-vocal clicks. Trident Thrust on round 3 delivers 11 physical damage. Scale Shield on round 5 buffs defence by 5 for three rounds, creating a durable window that forces you to burst through it or wait it out.',
    lore: 'The naga warriors are the Queen\'s military: disciplined, hierarchical, and operating with a chain of command that would make Captain Fen Darrow professionally envious. Vesper\'s examination of a recovered trident revealed that the metal is Ancient Ore shaped without heat. Kessa Ironweld heard this and went very quiet for a long time.',
  },
  'Naga Queen': {
    appearance: 'The Naga Queen is the largest naga in the Sunken Ruins, coiled on the dais of a flooded throne that was not built for her but which she occupies as if it were. Her scales are deep sapphire blue, edged with gold. She wears no armour; her scales are denser than anything Kessa has ever worked. Her eyes are gold, ancient, and carry the expression of something that has been waiting for you and is not impressed by what arrived.',
    behavior: 'The Naga Queen fights with a four-spell rotation. Tidal Blessing on round 2 buffs her attack by 6 for three rounds. Water Jet on round 4 delivers 14 magic damage. Constrict on round 6 drops your evasion by 5 for three rounds. Tsunami on round 8 delivers 24 magic damage: the single highest damage spell in the entire game.',
    lore: 'Vesper Tain has a theory about the naga that she has not published: that they are not the ruins\' invaders but their inheritors. The Throne Hall\'s carvings depict a serpentine figure on the dais. The Naga Queen sits where that figure sat. The Mysterious Stranger said: "The Lich commands the dead. The Queen commands the water. The ruins belong to whichever one you ask."',
  },

  // ── Abominations (Sunken Ruins) ──────────────────────────────────────────────
  'Ooze': {
    appearance: 'A translucent, viscous mass approximately the size of a large barrel, clinging to the walls and ceilings of the flooded entrance halls with a grip that defies gravity and good sense. It has no eyes, no mouth, and no discernible anatomy. It has surface tension, and the surface tension is acidic.',
    behavior: 'Oozes are the ruins\' simplest abomination: they cling, they dissolve, they move toward warmth. Acid Splash on round 3 deals damage as a spray of corrosive fluid that eats through armour and flesh with equal disinterest. It does not dodge. It does not retreat. It does not do anything that requires a nervous system, because it does not have one.',
    lore: 'Oozes are the most common abomination and the only one that Vesper can explain with conventional biology (barely). She classifies them as "aggressive colonial organisms," meaning they are not one creature but many, functioning as a collective that has decided dissolving things is its purpose.',
  },
  'Tentacle Horror': {
    appearance: 'A mass of dark, muscular limbs extending from a body concealed within a flooded doorway, a submerged alcove, or any opening large enough to hide something that does not want to be seen in its entirety. The tentacles are smooth, boneless, and lined with suckers that leave circular welts on anything they grip.',
    behavior: 'Tentacle horrors reach from concealment, striking at anything that passes through their section of corridor. Grapple on round 3 seizes you and drops your evasion by 4 for two rounds, holding you in place while the limbs constrict. The horror does not pursue. It is already where you need to go.',
    lore: 'Nobody has seen a tentacle horror\'s full body. Vesper has a theory that there is no body; that the tentacles are independent organisms sharing a common root system, like a fungus with ambition. Aldric Voss has filed the tentacle horror under "invertebrate, hostile, do not approach from below," which is the only classification in his bestiary that includes navigational advice.',
  },
  'Flesh Golem': {
    appearance: 'A lurching assemblage of parts that were never meant to be together, held in a roughly humanoid shape by sutures of sinew and a biology that has abandoned coherence in favour of mass. It stands seven feet tall, hunched under the weight of its own construction, and each limb is a different size, colour, and species.',
    behavior: 'Flesh golems are the abomination family\'s heavy: slow, massive, and built to absorb punishment and return it. Slam on round 3 delivers 10 physical damage with a limb that has the mass of a small tree trunk. Regenerate on round 6 heals 10 HP, because the flesh golem\'s biology repairs damage by repurposing whatever tissue is closest.',
    lore: 'The flesh golems were not built by the Lich and not built by the naga. They appear to have assembled themselves from the ruins\' abundant supply of biological material, driven by an imperative that is not intelligence and not instinct but something more fundamental: the deep, dumb persistence of matter that has learned to move and has not learned to stop.',
  },
  'Eldritch Abomination': {
    appearance: 'The Eldritch Abomination does not have an appearance. It has an impression, and the impression is wrong. It occupies the deepest chamber of the Sunken Ruins, where the water is warm and the stone is soft, and what you see when you enter is a suggestion of mass, of movement, of geometry that does not resolve into any shape your mind is equipped to process.',
    behavior: 'The Eldritch Abomination fights with a four-spell rotation. Madness Aura on round 2 drops your accuracy by 5 for three rounds. Void Bolt on round 4 delivers 14 magic damage. Tentacle Storm on round 6 deals 18 magic damage. Consume on round 9 deals 28 magic damage: the single highest damage in the entire game.',
    lore: 'The Eldritch Abomination is the oldest thing in the Sunken Ruins, and possibly the oldest thing in the Pocketrealm. The lost civilisation built around it. The carvings in the Throne Hall depict something beneath the city that the civilisation worshipped, feared, or both simultaneously. The Mysterious Stranger, who speaks of the Lich with patience and the Queen with respect, speaks of the Eldritch Abomination with silence.',
  },

  // ── Ancient Grove Treants (shared names with Deep Forest handled above) ───────
  'Moss Golem': {
    appearance: 'Like a bark golem, but larger, greener, and covered in a thick carpet of living moss that pulses faintly with each step. Its silhouette is softer, more organic, and somehow more unsettling for it. Where bark golems look like constructs, moss golems look like the forest wearing a disguise.',
    behavior: 'Moss golems guard the approaches to the Starbloom Meadow and the deeper groves, standing sentinel with the same patience as their Deep Forest cousins but with greater mass and greater purpose. They are the Ancient Grove\'s first line of defence against anything the outer treants did not catch.',
    lore: 'The moss that covers them is not decoration. It is alive, symbiotic, and possibly the actual intelligence driving the golem beneath. Vesper Tain requested a sample once. The golem\'s response was described as "firm but non-verbal." She did not ask again.',
  },
  'Ancient Treant': {
    appearance: 'An elderwood tree of staggering size, its silver-grey bark inscribed with natural patterns that glow faintly gold in the grove\'s ambient light. Its branches form a canopy of their own, and when it walks, the ground does not so much shake as settle, as if making room for something that belongs.',
    behavior: 'Ancient treants are the grove\'s gardeners, tending the sacred spaces with a patience measured in centuries. Root Cage on round 3 encases a target in binding roots that deal damage and restrict movement. Bark Shield on round 6 hardens their already formidable defences further, making a long fight nearly unwinnable.',
    lore: 'Each ancient treant in the grove is individually old enough to predate Millbrook. They have watched the town grow from a handful of huts to a settlement, and their opinion on the matter is unclear but probably unfavourable, given how many woodcutters have come from that direction over the years.',
  },
  'Treant Patriarch': {
    appearance: 'The oldest living thing in the Ancient Grove, and possibly in the Pocketrealm. Its trunk is wide enough to contain a room, its roots span the width of a clearing, and its branches scrape the canopy like fingers testing a ceiling. The bark is silver-white and warm, and the golden light of the grove seems to emanate from within it.',
    behavior: 'The Treant Patriarch guards the outer approach to the Sanctum with the unhurried violence of a natural force. Earthquake on round 3 sends fissures rippling through the earth. Regenerate on round 5 heals a significant chunk of damage, extending an already long fight. Ancient Fury on round 8 is the Patriarch\'s final word: a devastating blast of concentrated forest magic.',
    lore: 'The Patriarch does not speak, but it communicates. When it shifts, the other treants shift. When it stills, the grove falls silent. It is not the ruler of the Ancient Grove (that distinction belongs to something older and less visible), but it is the grove\'s will made physical: patient, immovable, and ancient beyond reckoning.',
  },
  'Giant Cave Spider': {
    appearance: 'A cave spider grown large: the size of a large hound, pale-bodied from years in the dark, with eight eyes that reflect torchlight in an unsettling row. Its web-spinning glands are overdeveloped, producing silk strong enough to slow even armoured fighters.',
    behavior: 'Giant cave spiders use Web Trap on round 3 to snare prey, reducing evasion and forcing close combat on their terms. Unlike surface spiders, they do not rely on ambush: in the cave tunnels there is nowhere to hide, so they make do with sticky obstruction and patient aggression.',
    lore: 'The cave entrance populations of giant spiders are thought to be descended from surface brood mothers whose offspring migrated downward over generations. Millbrook\'s herbalists collect their silk for rope and binding work, though they note the underground variety is stronger and considerably harder to harvest.',
  },
  'Rat Matriarch': {
    appearance: 'A cave rat of exceptional size and age, her pale fur patchy with old wounds and her eyes clouded but tracking. Dozens of smaller rats orbit her like satellites, responding to subsonic communications that human ears register only as unease.',
    behavior: 'The Rat Matriarch commands her swarm directly, using Summon Swarm (round 3) to call additional rats into the fight and Frenzy (round 6) to send the entire colony into a biting, clawing frenzy. She does not fight directly when her numbers are sufficient. They rarely are, for long.',
    lore: 'The rat colony in the Cave Entrance is one continuous family unit traced back to a single matriarch that established herself in the upper passages decades ago. The current Matriarch is her direct descendant, and the colony\'s territorial behaviour has been consistent across every generation. Whatever the first matriarch decided was hers, her descendants believe they are owed.',
  },
};

export const MOB_FAMILY_FLAVOR: Record<string, string> = {
  'Vermin': 'Vermin are the first lesson the Pocketrealm teaches, and the lesson is this: everything here wants to bite you, and most of it is smaller than your boot. The forests and caves near Millbrook crawl with rodents, insects, and other creatures that exist mainly to remind adventurers that even the lowest rung of the food chain has teeth.',
  'Spiders': 'The spiders of the Forest Edge are the reason most adventurers learn to look up. They spin their webs between the lower canopy and the undergrowth, patient as debt collectors and roughly as welcome. Silk harvested from their nests supplies half of Millbrook\'s textile trade, which means the town has a complicated relationship with creatures it would otherwise prefer to set on fire.',
  'Boars': 'The boars of the Forest Edge are the closest thing the Pocketrealm has to living siege equipment. Thick-skulled, thick-skinned, and profoundly ill-tempered, they occupy the muddy hollows and root-churned clearings of the lower forest with the quiet authority of something that has never lost a territorial dispute. Millbrook\'s palisade was built to a specific height for a specific reason, and that reason weighs about three hundred pounds and does not negotiate.',
  'Wolves': 'The wolves of the Deep Forest are not the rangy, half-starved scavengers of campfire stories. They are organized, patient, and unsettlingly intelligent. They hunt in formations, communicate through low-frequency howls that carry for miles, and demonstrate a grasp of flanking tactics that would embarrass most bandit patrols. The old guard at Millbrook\'s gate says he has heard them howling in unison on moonless nights, and unison means coordination, and coordination means something is giving orders.',
  'Bandits': 'The bandits of the Deep Forest are not desperate vagrants living hand to mouth. They are organized, well-supplied, and frustratingly professional. They control the stretches of the Old Road where the banks rise steep on either side, and they extract tolls from anyone foolish enough to travel without a drawn weapon. The fact that they are human makes them worse than the wolves in some respects: wolves do not lie about their intentions, and wolves do not hold grudges.',
  'Treants': 'The treants are what happens when a forest decides it has had enough. They are trees that move, think, and fight with the slow, implacable fury of something that has been standing still for centuries and has finally found a reason to stop. They do not dodge. They do not retreat. They absorb damage the way a riverbank absorbs rain: patiently, stubbornly, and with the quiet confidence of something that will still be here long after you are mulch.',
  'Spirits': 'The spirits of the Ancient Grove are not ghosts. Ghosts are dead things that forgot to leave. The spirits were never alive in the way that flesh understands the word. They are the grove\'s memory made visible: the residue of centuries of accumulated magic, shaped by the trees and the soil and the slow, patient turning of seasons into something that moves, thinks, and, when provoked, fights with a fury that has nothing to do with anger and everything to do with purpose.',
  'Fae': 'The fae of the Ancient Grove are beautiful, capricious, and fundamentally unconcerned with your wellbeing. They are not evil (evil requires intent, and the fae\'s intent changes with the wind). They are simply operating on a set of rules that nobody else was consulted on, involving concepts like "trespass," "tribute," and "we were here first, so everything that happens to you is technically your fault."',
  'Bats': 'The bats of the Cave Entrance are the underground\'s answer to a question nobody asked: what if something could see you perfectly in total darkness, fly faster than you can swing, and had absolutely no interest in a fair fight? They roost in the high chambers where stalactites cluster like inverted forests, and they descend in waves that are less "attack" and more "weather event." Hitting one is an achievement. Hitting one that matters is an education.',
  'Goblins': 'The goblins are the Pocketrealm\'s great survivors. They are not the strongest, the fastest, or the smartest creatures underground, but they are the most stubborn, and stubbornness, applied consistently over enough generations, looks remarkably like civilisation. They have built warrens beneath the Cave Entrance, an undercity in the Deep Mines, and something approaching a kingdom in the Crystal Caverns. Underestimate them at your peril. They have been underestimated before, and they are still here.',
  'Golems': 'Golems are what happens when the earth decides it is tired of being dug. They form spontaneously from mineral deposits disturbed by mining, shaped by the same ambient magic that creates treants above ground but expressed through stone, ore, and crystal rather than wood and root. They do not think, exactly. They respond: to vibration, to extraction, to the specific insult of someone chipping away at the wall they used to be part of.',
  'Crawlers': 'The crawlers are the Deep Mines\' original tenants, predating the goblins, the golems, and the mining operation that disturbed them all. They are arthropods of improbable size, evolved (or shaped, or simply grown) in the lightless tunnels beneath the earth, and they navigate the mine by vibration, scent, and a segmented logic that resembles intelligence just enough to be unsettling.',
  'Harpies': 'The harpies own the sky above the Whispering Plains, and they consider everything beneath it a buffet. They are the only airborne predator family in the Pocketrealm: part woman, part raptor, and entirely territorial, with a social hierarchy based on volume, wingspan, and the willingness to dive-bomb anything that enters their hunting ground. The "whispering" in the Whispering Plains is not the wind. It is the sound of harpy wings at altitude, carried across the grass in a constant, murmuring wash that the wind takes credit for.',
  'Undead': 'The dead of the Haunted Marsh were people once. Some of them still look like it. The marsh does not create undead so much as refuse to let things stay dead: the water preserves, the mud holds, and whatever ancient magic seeps up from beneath the peat animates what it finds with the indiscriminate enthusiasm of a process that has forgotten how to stop. They are not controlled. They are not organised. They simply persist, moving through the mist on errands they can no longer remember, attacking anything that still has the warmth they lost.',
  'Swamp Beasts': 'The swamp beasts of the Haunted Marsh are not undead, not cursed, and not magical. They are simply alive, in a place that kills most things, and they have been alive here for longer than anyone has been keeping records. The marsh\'s ambient necromancy does not affect them: the toads, crawlers, hydras, and crocodiles have adapted to the marsh\'s magic by ignoring it entirely. This makes them the most honest threat in the zone. They are not animated by dark forces. They are just very large, very territorial, and very hungry.',
  'Witches': 'The witches of the Haunted Marsh are not the marsh\'s creation. They are its tenants. Where the undead are animated by ambient necromancy and the swamp beasts are adapted biology, the witches chose to be here: they came to the marsh for its magic, built their hollows in its deepest reaches, and practice their craft with the focused intent of people who consider civilisation a distraction and morality a suggestion.',
  'Elementals': 'The elementals of the Crystal Caverns are not creatures. They are phenomena. Where golems are shaped by the caverns\' minerals and goblins have simply moved in, the elementals are the arcane energy of the Crystal Caverns made manifest: condensed geometry, crystallised magic, and the caverns\' ambient hum given form, purpose, and the inclination to destroy anything that disrupts the resonance.',
  'Serpents': 'The serpents of the Sunken Ruins are the water\'s own predators: cold-blooded, patient, and perfectly adapted to the flooded corridors and submerged galleries that make the ruins lethal for anything that breathes air. The sea snakes and marsh vipers are animals, evolved for saltwater and hunting by heat and vibration. The naga are not. The naga are something else entirely: intelligent, tool-using, language-having beings who rule the deep water with a cold, territorial authority that predates Thornwall, predates the marsh, and may predate the ruins themselves.',
  'Abominations': 'The abominations of the Sunken Ruins are not creatures in any useful sense of the word. They are what lives at the bottom: in the warm water, in the soft stone, in the darkness that was here before the civilisation built above it and that is here now that the civilisation is gone. The Lich commands the dead. The Naga Queen commands the water. The abominations command nothing. They are not intelligent enough for command and not simple enough for instinct.',
};
