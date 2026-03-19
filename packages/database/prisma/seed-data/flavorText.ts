/**
 * Item flavour text, keyed by ItemTemplate name (must match exactly).
 * Extracted from docs/loop-v2/lore/ files.
 */
export const ITEM_FLAVOR_TEXT: Record<string, string> = {
  // ── Starter Weapons (Kessa's tutorial gifts) ──────────────────────────────
  "Kessa's Training Sword":
    'Kessa made this one herself, which she will remind you of every time you visit. The balance is surprisingly good for something she calls "practice grade." The nick on the crossguard is from her testing it on the doorframe. She says it adds character.',
  "Kessa's Training Bow":
    'Kessa does not make bows. She is very clear about this. She "assembled" this one from parts the carpenter left behind, and she will not discuss the process further. It shoots straight enough, which is more than she expected.',
  "Kessa's Training Staff":
    'Kessa wrapped the grip herself, though she refuses to call it enchanting. "I just bound the heartwood properly," she says. The faint warmth in the grain suggests the oak disagrees with her definition.',
  // ── T1 Weapons ─────────────────────────────────────────────────────────────
  'Wooden Sword':
    'Carved from a single plank by someone who clearly valued enthusiasm over craftsmanship. The edge is about as sharp as a strong opinion, but it will do until something tries to eat you.',
  'Oak Shortbow':
    "A simple hunting bow, still smelling of sawdust and fresh lacquer. Millbrook's bowyer swears each one is \"personally tested,\" though nobody has ever seen him hit a target.",
  'Oak Staff':
    'A length of oak heartwood, stripped and sanded smooth. Faint lines of natural grain pulse when held by someone with even a scrap of magical talent. For everyone else, it makes a passable walking stick.',
  'Copper Dagger':
    'Light, quick, and almost pretty in the right light. Favoured by those who prefer not to be where the blade was a moment ago. The copper holds an edge poorly, but the things you will be stabbing at this point barely notice.',

  // ── T2 Weapons ─────────────────────────────────────────────────────────────
  'Tin Sword':
    'Properly forged, properly balanced, and properly capable of making something regret its life choices. Your first real blade, and it feels like an upgrade because it is one.',
  'Maple Longbow':
    'Carved from Deep Forest maple, with a pull that demands actual arm strength. The extra range means you can kill things before they know you are there, which is the polite way to fight.',
  'Maple Staff':
    'Dense, dark-grained maple that hums faintly when channelling. The magical throughput is nearly double that of oak, which matters less for the spells and more for the headaches you will not have afterwards.',
  'Boar Tusk Mace':
    "A brutal thing: a haft wrapped in boar hide, crowned with a Great Boar's tusk set in copper. It hits like the animal it came from, and the slight armour bonus comes from the tusk's tendency to deflect blades aimed at your knuckles.",
  'Bat Wing Crossbow':
    'Limbs reinforced with stretched bat wing membrane give this crossbow an unsettling flex and a whisper-quiet release. The dodge bonus is real; something about the way it handles makes you move lighter on your feet. Or maybe you are just flinching less.',
  'Goblin Hex Staff':
    'Looted (or, more charitably, "salvaged") from a goblin shaman\'s collection. The carvings along the shaft are crude but effective, and the residual hexwork amplifies magic with an enthusiasm that borders on reckless. Smells faintly of cave mushrooms.',

  // ── T3 Weapons ─────────────────────────────────────────────────────────────
  'Iron Longsword':
    "Forged from Deep Mines iron, properly quenched, and heavy enough to mean business. Kessa Ironweld considers this the first blade worth putting her mark on, which is the closest thing to a compliment she gives.",
  'Willow Warbow':
    'Cut from Whispering Plains willow, whose wood bends without breaking under tensions that would snap oak or maple. The draw is smooth, the release is silent, and the arrow arrives before the sound does.',
  'Elderwood Staff':
    'Shaped from Ancient Grove elderwood that was old when the forest was young. The grain spirals naturally around the shaft, and the magical resonance is deep enough to feel in your teeth. Vesper Tain once tried to use one as a stirring rod. It set the potion on fire.',
  'Crawler Fang Blade':
    'A serrated short sword edged with the mandible of a Deep Mines crawler, ground to a wicked point. The chitin holds an edge longer than steel and finds gaps in armour that metal alone would miss. It does not cut cleanly. That is not the point.',
  'Harpy Talon Bow':
    'A recurve bow tipped with harpy talons that serve as natural arrow rests, lending each shot an eerie stability. The whole weapon is lighter than it looks, built for archers who plan to be somewhere else by the time the arrow lands.',
  'Fae Crystal Staff':
    "A shaft of elderwood crowned with a crystal pried from the Ancient Grove's deepest glade. The crystal hums with a frequency that makes nearby candles flicker and nearby goblins nervous. Its magical output is staggering for its tier, though the fae who grew the crystal would like it back.",

  // ── T4 Weapons ─────────────────────────────────────────────────────────────
  'Dark Iron Greatsword':
    'Forged from Haunted Marsh dark iron, which absorbs light the way a drain absorbs water. The blade is heavier than it needs to be and hits harder than it should, as if the metal remembers being underground and resents everything above it.',
  'Bogwood Longbow':
    'Shaped from bogwood cured in the marshes for decades before anyone thought to fish it out. The draw is slow, the release is punishing, and the wood smells faintly of peat and old grief. It does not rot. Nothing rots in the marsh without permission.',
  'Crystal Staff':
    'A shaft of crystal wood from the Crystal Caverns, polished until it is nearly transparent. The magical throughput is extraordinary; channelling through it feels less like casting a spell and more like opening a valve. Vesper says the resonance pattern is "mathematically beautiful." Kessa says it looks fragile. They are both correct.',
  'Hydra Fang Sabre':
    "A curved blade edged with a Swamp Hydra's fang, serrated naturally by the creature's diet of bone and armour. The crit chance is not a design feature; it is a consequence of the fang's irregular edge finding seams that straight steel would miss. Every cut is slightly different. That is the unsettling part.",
  'Wraith Bow':
    'A longbow strung with cord that shimmers faintly at the edges of vision, as if not entirely present. Arrows fired from it carry a trace of spectral energy, dealing damage that is partly physical and partly something else. Archers report that the bow feels lighter at night, which nobody finds reassuring.',
  "Witch's Sceptre":
    "Salvaged from the fen-soaked sanctums of the Haunted Marsh's bog witches and restored with more caution than enthusiasm. The magical output is staggering, nearly double that of the Crystal Staff, but the sceptre hums with residual hexwork that Vesper has described as \"active but directionless.\" She keeps it at arm's length. So should you.",

  // ── T5 Weapons ─────────────────────────────────────────────────────────────
  'Mithril Blade':
    'A blade forged from Crystal Caverns mithril, lighter than iron and harder than anything Kessa Ironweld has ever worked. It holds an edge so fine that the air seems to part before the swing arrives. She made three of these before she was satisfied with one. She will not discuss what happened to the other two.',
  'Ancient Bow':
    'Carved from Sunken Ruins petrified wood that spent centuries hardening under salt water and arcane pressure. The grain has crystallised into something that is no longer wood and not quite stone. Arrows leave the string with a sound like tearing silk, and they arrive with a sound like nothing at all.',
  'Lich Staff':
    'A staff of petrified wood crowned with a crystal that pulses with a cold, pale light and does not stop pulsing, even when stored, even when buried, even when you are trying to sleep. The magical throughput is the highest of any craftable weapon in the Pocketrealm. Vesper Tain examined one and went very quiet for a long time before saying, simply, "Be careful with this." She did not elaborate. She did not need to.',

  // ── Potions ─────────────────────────────────────────────────────────────────
  'Minor Health Potion':
    'Forest Sage extract, distilled twice and stabilized with a binding agent Vesper refuses to name. Tastes like warm copper and bad decisions, but it closes wounds faster than rest and cheaper than prayer.',
  'Health Potion':
    'A deeper red than its minor cousin, brewed from Moonpetal and a base that takes three days to prepare. The healing is immediate, thorough, and accompanied by a brief tingling sensation that Vesper insists is normal.',
  'Cleansing Potion':
    'Three years of failed antivenom research condensed into a bottle that actually works (on everything except, infuriatingly, common spider venom). Strips poison, curses, and lingering magical effects with the gentle subtlety of a cold river.',
  'Greater Health Potion':
    'Starbloom essence suspended in a solution so precisely balanced that Vesper labels each batch personally. Heals deep wounds, knits bone, and temporarily makes you feel invincible, which is the dangerous part.',
  'Resist Potion':
    'A thick, iridescent liquid brewed from Gravemoss and dark iron filings. Hardens your body against incoming damage for several rounds. The aftertaste is indescribable, in the sense that Vesper has described it and nobody wants to hear it twice.',
  'Elixir of Power':
    "Vesper's masterwork: Abyssal Kelp distilled with methods she will not teach and reagents she will not source publicly. Amplifies your damage output significantly for the duration. The bottle is warm to the touch, which is concerning, but the results speak louder than the concerns.",

  // ── Stamina Potions ─────────────────────────────────────────────────────────
  'Minor Stamina Potion':
    'A gritty, yellow-green draught that tastes of Forest Sage and determination. Restores enough stamina to keep moving when your body has decided, reasonably, that it would prefer to stop.',
  'Stamina Potion':
    "A thicker, more concentrated formula brewed from Moonpetal extract and a stabiliser that Vesper says is proprietary (which means she is not proud of what it is). Sixty points of recovery, which is the difference between one more fight and the walk of shame back to town.",
  'Greater Stamina Potion':
    "Vesper's full-strength stamina restoration: Starbloom essence in a base so potent that the liquid vibrates faintly in the bottle. One hundred points, enough to keep an adventurer going long past the point where wisdom would have them stop. Vesper considers this a personal failing of the customer, not the product.",

  // ── Mana Potions ─────────────────────────────────────────────────────────────
  'Minor Mana Potion':
    'A thin, luminous blue liquid that restores a modest amount of magical energy and tastes like cold water from a stream that has never seen sunlight. Vesper brews it in batches and considers it entry-level work, which from her is not a compliment.',
  'Mana Potion':
    'Shimmer Fern extract distilled into a deeper blue that glows faintly in dim light. Forty-five points of mana restoration, enough for several spells and too little for carelessness.',
  'Greater Mana Potion':
    "Brewed from concentrated Shimmer Fern and reagents that Vesper sources from adventurers who went to the Crystal Caverns personally (she did not; she has standards about personal safety that she does not extend to her suppliers). Eighty points of mana, delivered with a clarity that makes the world sharpen at the edges for a moment before settling back to normal.",

  // ── T1 Gems ─────────────────────────────────────────────────────────────────
  'Rough Ruby':
    'A cloudy red stone the size of a thumbnail, pried from a copper vein during a lucky swing. Uncut and unpolished, it still catches the light in a way that makes you forget you are standing in a ditch.',
  'Raw Amber':
    'A warm, honey-coloured bead found tangled in the roots of a Forest Sage patch. Something small and ancient is visible inside, perfectly preserved. Vesper says it is a beetle. You prefer not to look too closely.',
  'Tree Resin':
    'A hardened glob of golden sap that seeps from the oldest oaks when the wood is struck just right. It smells faintly of vanilla and stubbornly resists any attempt to dissolve it, which makes it useful for things that need to stay stuck.',

  // ── T2 Gems ─────────────────────────────────────────────────────────────────
  'Rough Sapphire':
    'A deep blue crystal, rough-edged and faintly translucent, pulled from a tin deposit in the Deep Forest. Rowan Delk calls finding one "the stone\'s way of saying thank you." He does not say this often, and never where anyone can hear him.',
  'Raw Pearl':
    'A pale, lustrous sphere found nestled among Moonpetal roots, formed over years in soil saturated with ambient magic. It is cool to the touch regardless of the temperature around it, which Vesper finds fascinating and everyone else finds slightly unnerving.',
  'Fossilized Sap':
    "Ancient tree sap, compressed and crystallized over centuries into a translucent amber stone harder than glass. Found in the heartwood of Deep Forest maples, usually only when the woodcutter's axe hits a pocket they were not expecting. The surprise is mutual.",

  // ── T1 Mob Drops ────────────────────────────────────────────────────────────
  'Rat Pelt':
    'A scrap of coarse, greasy fur stripped from a forest rat. Bram Holloway buys them by the armful and never explains what he does with them all, though the general store\'s suspiciously warm insulation offers a clue.',
  'Boar Hide':
    "Thick, mud-caked, and stubborn to work with. Millbrook's tanners swear the boars grow their hide specifically to inconvenience anyone who kills them, which feels petty but is difficult to disprove.",
  'Spider Silk':
    "Sticky, translucent thread harvested from the webs of Forest Edge spiders. Remarkably strong for its weight; the weavers of Millbrook spin it into cloth that is both lightweight and deeply unpleasant to think about too carefully.",
  'Rat Tail':
    'A thin, leathery tail severed at the base. Alchemists use them in poultices for reasons they refuse to elaborate on. The smell suggests the reasons are bad.',
  'Boar Tusk':
    'A yellowed, curving tusk dense enough to ring like metal when struck. Kessa Ironweld sets them into mace heads, and the result hits like the animal it came from: hard, blunt, and without apology.',

  // ── T2 Mob Drops ────────────────────────────────────────────────────────────
  'Wolf Pelt':
    'Dense grey-brown fur stripped from a Deep Forest wolf, still carrying the faint smell of pine and wet earth. Kessa tans these into Wolf Leather that is supple, warm, and considerably more cooperative than the animal it came from.',
  'Bandit Cloth':
    "Torn fabric salvaged from the uniforms of Deep Forest bandits, dyed in forest greens and browns that were meant for camouflage and are now meant for recycling. The stitching is surprisingly good. Whoever outfits the bandits takes their work seriously.",
  'Wolf Fang':
    "A curved canine pulled from a forest wolf's jaw, still sharp enough to draw blood if handled carelessly. Weaponsmiths set them into hilts and crossguards for grip and intimidation. The intimidation is the more reliable function.",
  'Ancient Bark':
    "Thick, dark bark shed (or more accurately, torn) from a Deep Forest treant. It is harder than most wood and denser than some stone, and it retains a faint warmth that suggests the tree it came from has not entirely given up on the piece.",
  'Bat Wing':
    "Leathery membrane harvested from a Cave Entrance dire bat, thin as parchment but remarkably strong under tension. Bowyers stretch it over crossbow limbs for a whisper-quiet release, and Vesper uses scraps in wound dressings that nobody asks questions about.",
  'Goblin Rag':
    "A scrap of rough-woven fabric of uncertain origin, stained with cave dust and the general residue of goblin living conditions. It smells the way you would expect. It is, despite this, a perfectly serviceable textile once washed. Twice. Possibly three times.",

  // ── T3 Mob Drops ────────────────────────────────────────────────────────────
  'Fae Silk':
    'Thread spun by the fae of the Ancient Grove, lighter than air and stronger than steel wire. It catches light in colours that should not exist in the visible spectrum, which Vesper finds fascinating and Kessa finds impractical.',
  'Dryad Thread':
    'A length of living vine shed by a dryad during combat, still faintly green and warm to the touch. Left alone, it will try to take root in whatever surface it rests on. Storing it requires a sealed container and a certain resignation.',
  'Sprite Dust':
    'Fine, golden powder that clings to everything a forest sprite has recently been near, including you. It is mildly luminous, mildly magical, and mildly irritating to the skin. Vesper uses it as a catalyst in advanced alchemical processes and insists the sneezing is worth it.',
  'Pixie Wing':
    'A translucent wing shed by a pixie, iridescent as oil on water and surprisingly rigid for something so thin. They are collected from the ground beneath the Canopy Court, because nobody is fast enough to take one from a pixie that still wants it.',
  'Crawler Chitin':
    'Plates of dark, segmented shell stripped from a Deep Mines rock crawler. The chitin is naturally layered for impact resistance, and Kessa has developed a technique for binding it into armour reinforcement that she considers one of her better innovations.',
  'Warg Hide':
    "The pelt of a Whispering Plains warg: thick, coarse, and carrying a musk that no amount of tanning entirely removes. Rowan Delk says the smell is the hide's way of remembering what it used to be. The leather it produces is excellent. The smell is a commitment.",
  'Harpy Feather':
    'A long, barbed flight feather plucked from a Whispering Plains harpy. The barbs catch the wind in ways that fletchers find useful and everyone else finds unnerving, because an arrow fletched with harpy feather curves slightly toward warm targets. Coincidence, probably.',

  // ── T4 Mob Drops ────────────────────────────────────────────────────────────
  'Croc Hide':
    'Skin stripped from a Haunted Marsh ancient crocodile, thick enough to stop a blade and treated by centuries of brackish immersion into something that is less leather and more geological deposit. It smells like the marsh. Everything from the marsh smells like the marsh.',
  'Hydra Scale':
    'An iridescent plate shed by a Swamp Hydra, dense and slightly oily, with a faint green tinge that does not wash off no matter how many times you try. Kessa uses them for shield reinforcement and says the only material harder to work is the hydra itself.',
  'Witch Cloth':
    "Dark fabric woven by the Haunted Marsh's bog witches from fibres that Vesper cannot identify and has stopped trying to. It resists fire, repels water, and hums faintly at frequencies that make nearby potions bubble. Sewing with it requires needles made from bone, because metal warps on contact.",
  'Wraith Essence':
    "A cold, luminous residue collected from a wraith's dissipation point: the spot where it stopped being present and started being memory. It is stored in sealed vials because it evaporates in open air and because the glow unsettles people who were not there when it was collected.",
  'Bone Fragment':
    "A shard of ancient bone from the Haunted Marsh's skeleton patrols, yellowed and dense and carrying a residual chill that has nothing to do with temperature. Weaponsmiths use them for edge reinforcement. Alchemists use them for reagents. Nobody uses them for decoration, though they have been asked.",
  'Bog Heart':
    "A fist-sized organ harvested from a Bog Toad or Marsh Crawler, still faintly pulsing hours after extraction. Vesper says the pulse is a chemical reaction, not a biological one. This is technically reassuring but practically unsettling, especially when the jar it is stored in starts vibrating at three in the morning.",

  // ── T5 Mob Drops ────────────────────────────────────────────────────────────
  'Naga Scale':
    'A broad, iridescent plate shed by a Sunken Ruins naga, dense as stone and slick with a salt-mineral coating that never fully dries. Kessa works them into armour with a reverence she reserves for materials that are older than the craft she uses to shape them.',
  'Spectral Silk':
    'A luminous thread drawn from the dissolution of a spectral captain: the fabric of a uniform that outlasted the body, the rank, and the civilisation that issued it. It is cold to the touch and faintly transparent, and it carries the outline of military insignia that Aldric Voss has no record of.',
  'Ooze Residue':
    'A viscous, faintly acidic gel collected from the remains of a Sunken Ruins ooze, stored in sealed glass because it dissolves everything else. Vesper uses it in concentrated alchemical preparations and says it is, chemically speaking, the most aggressive solvent in the Pocketrealm. She says this with admiration.',
  'Eldritch Fragment':
    'A shard of something that is not stone, not crystal, and not any material that has a name. It was recovered from the deepest chamber of the Sunken Ruins, where the Eldritch Abomination nests, and it pulses with a light that does not illuminate. Vesper studied one for three days and returned it without comment. She has not asked for another.',
  'Lich Dust':
    "A fine, grey powder collected from the space a Lich occupied before it stopped occupying it. The dust is what remains when a will that has sustained itself for centuries finally loses coherence: part ash, part magic, part the residue of a personality that refused to end. It is extraordinarily potent in necromantic applications. Nobody asks where it comes from more than once.",
  'Naga Pearl':
    "A deep-water pearl harvested from the Naga Queen's hoard, formed in the flooded galleries over centuries of mineral accretion around a core that Vesper believes is a fragment of Ancient Ore. If she is right, the pearl is the only known material where the ruins' ore and the ruins' water have fused into something neither could produce alone. It is beautiful. That is the least interesting thing about it.",
  'Ancient Relic':
    'A fragment of carved stone, metal, or ceramic from the civilisation that built the Sunken Ruins, recovered from the deepest and most intact chambers. Each relic is unique: a piece of a frieze, a section of inscription, a shard of a mechanism with no identifiable purpose. Aldric Voss catalogues them obsessively. He has filled four ledgers. He cannot read a single inscription. He keeps cataloguing.',

  // ── Boss Trophy Materials ────────────────────────────────────────────────────
  'Alpha Wolf Fang':
    "A canine the length of your forearm, yellowed with age and scored by a hundred dominance fights. It radiates a low, ambient warmth, as if the Alpha's fury persists in the bone long after the beast itself has fallen. Kessa handles these with uncharacteristic care.",
  'Spirit Essence':
    "A small, luminous sphere that hovers slightly above any surface it is placed on. It is warm, faintly golden, and hums at a frequency that makes your teeth ache. Vesper Tain keeps hers in a sealed jar and has been observed talking to it. She denies this. The jar glows.",

  // ── Boss Equipment ───────────────────────────────────────────────────────────
  'Wolfsbane Blade':
    "Forged from Alpha Wolf Fang and dark steel, this blade carries the memory of the hunt in its edge. The crit chance is not mechanical; it is instinctual, the weapon finding openings the way a wolf finds a throat. It cannot be sold because nobody who earns one would part with it.",
  'Alpha Pelt Chest':
    "Armour stitched from the Alpha Wolf's pelt by hands that understood what they were working with. The fur is impossibly dense, the leather beneath it supple and warm, and the whole piece moves with you as if the pelt remembers what running felt like. Dodge, health, and armour in one package, and the faint smell of deep forest that never quite fades.",
  'Spirit Staff':
    "A shaft of elderwood crowned with a sliver of Spirit Essence that has been coaxed (Vesper's word; \"negotiated\" might be more accurate) into resonance with the staff's grain. The magical throughput is precise, controlled, and carries a crit chance that feels less like luck and more like the grove deciding to help. Vesper described it as \"alive.\" She was not being poetic.",
  'Ethereal Robes':
    "Woven from material that Vesper cannot identify and refuses to speculate about publicly. The fabric is translucent in certain light, opaque in others, and weighs almost nothing regardless. It provides magic defence, health, and dodge through means that operate outside conventional armour theory. Wearing it feels like being wrapped in a warm thought. That is not a metaphor. That is the most accurate description anyone has managed.",

  // ── Backpacks ────────────────────────────────────────────────────────────────
  'Cloth Satchel':
    'A simple bag of stitched canvas with a drawstring top, sold by Bram for a price that suggests he knows you have no alternative. Holds eight items, which sounds like plenty until it is not.',
  'Reinforced Pack':
    'Canvas reinforced with boar leather straps and copper buckles, sturdy enough to survive being dragged through the Forest Edge and back. Sixteen slots, which is the point where carrying capacity stops being a limitation and starts being a decision.',
  "Traveller's Rucksack":
    "A properly framed pack with internal compartments, waxed canvas, and adjustable straps that Rowan Delk helped design (he insisted the hip belt distribute weight evenly, because he has opinions about spinal health). Twenty-four slots for the adventurer who has committed to being away from town for longer than a day.",
  "Ranger's Haversack":
    "Built from willow-frame construction and lined with spider silk for waterproofing, designed for Thornwall's long-range patrols and adopted by anyone who spends more time in the field than in town. Thirty-two slots, organized for rapid access without removing the pack, because Lira Caravel does not believe in packing inefficiently and neither should you.",
  "Adventurer's Expedition Pack":
    "The largest portable storage solution in the Pocketrealm: forty slots of waxed canvas, mithril-reinforced framing, and compartmentalized organization that Aldric Voss would approve of if he ever left his desk long enough to see one in the field. It weighs more than some weapons, but it carries everything, which is the point.",

  // ── Jewellery ────────────────────────────────────────────────────────────────
  'Copper Ring':
    'A thin band of hammered copper, crudely polished and sold by Bram for a price that suggests he values the sentiment more than the material. It makes you slightly luckier, which in the Pocketrealm means the difference between a critical hit and a near miss.',
  'Copper Pendant':
    'A flat disc of copper on a leather cord, warm against the chest and inscribed with a mark that Bram says means "fortune" and Kessa says means "adequate."',
  'Iron Band':
    'Heavier than copper and twice as serious, forged from Deep Forest iron into a ring that sits on the finger like a small commitment to staying alive. The accuracy boost is slight but measurable, and Aldric would classify the luck improvement as "statistically significant, if barely."',
  'Dark Iron Ring':
    'Forged from Haunted Marsh dark iron, this ring carries a faint chill that has nothing to do with temperature and everything to do with where the ore was mined. Kessa works dark iron jewellery reluctantly, not because the material is difficult but because she considers jewellery a frivolous use of a serious metal.',
  'Mithril Ring':
    'A band of Crystal Caverns mithril so light you forget it is there and so precisely crafted that Kessa will not discuss how many attempts it took. The critical damage amplification is not magic; it is weight distribution channelling force into the exact point where it matters most.',
  'Ancient Ring':
    'Carved from Sunken Ruins ore into a band that is warm regardless of temperature and hums at a frequency Vesper can detect but not explain. The inscription on the inner surface is in a language that predates everything except the ruins it came from.',

  // ── Soulbound Starter Gear ───────────────────────────────────────────────────
  'Rat Hide Gloves':
    'Your first real armour, stitched from rat pelts by someone (probably you) who had never worked leather before, and it shows. They fit well enough, protect your knuckles from things that bite, and smell faintly of the Forest Edge no matter how many times you wash them.',
  'Spider Silk Belt':
    "A strip of woven spider silk cinched at the waist, light enough to forget you are wearing it and strong enough to remind you when something hits you there. The silk's faint stickiness has not gone away, and Vesper maintains that this is a feature.",
  'Boar Hide Boots':
    'Sturdy boots cut from Forest Edge boar hide, thick-soled and practical and utterly lacking in elegance. They will keep your feet dry, absorb the kind of impacts Kessa would consider negligible, and outlast your first dozen fights without complaint.',
  'Wayfinder Buckler':
    "A small, round shield issued by the Millbrook militia to every adventurer who walks through the gate, stamped with a compass rose that Fen Darrow insists is decorative. The angled grip steadies your off-hand and improves your aim, which is why it has saved more lives than any weapon in Millbrook's armoury.",

  // ── Achievement Family Items ─────────────────────────────────────────────────
  "Ratcatcher's Gloves":
    'Stitched from the pelts of every rat variant in the Pocketrealm, these gloves fit like a second skin and strike like you know exactly where the weak points are. Bram Holloway considers their existence proof that someone finally took the rat problem seriously.',
  'Venomweave Boots':
    "Spider silk woven by someone who studied every arachnid the Pocketrealm has to offer and survived to make footwear from the experience. The silk anticipates your movement, which Vesper says is a property of the material and not evidence that it remembers.",
  'Tuskhide Pauldrons':
    "Boar hide layered and hardened into shoulder plates dense enough to stop a charging tusk, because you have now been charged by every tusk there is. Kessa reinforced them with iron studs and said nothing, which from her is the highest compliment.",
  'Wolf Pelt Cloak':
    'A cloak cut from the pelts of every wolf variant from forest to plains, worn like a trophy by someone the pack would recognise as an equal. It moves in the wind the way a live wolf does, which is unsettling until you remember how you earned it.',
  "Bandit Lord's Blade":
    "A longsword of suspicious provenance, awarded for mastering every bandit variant in the Pocketrealm. The 5% critical chance is not enchantment; it is the muscle memory of someone who has fought enough humans to know where a blade needs to go.",

  // ── T1 Armor ──────────────────────────────────────────────────────────────────
  'Copper Helm':
    'A dome of hammered copper that sits on your head like a heavy suggestion. It keeps the sun off and the teeth out, which is all Kessa promises for tier one metalwork. The green patina is cosmetic. Mostly.',
  'Copper Chainmail':
    'Interlocking copper rings stitched onto a canvas backing by Kessa Ironweld on what she describes as an uninspired afternoon. It stops claws and small blades well enough for the Forest Edge, and the weight builds character. Or at least shoulders.',
  'Boar Leather Cap':
    'A simple skullcap of cured boar hide, snug and sweat-stained within a day. It will not stop a blade, but it will stop you from noticing the branch before it matters.',
  'Boar Leather Vest':
    'Thick-cut boar hide shaped into a vest that fits like a firm handshake. Rowan Delk wears one under his travelling coat and considers it adequate, which from him is high praise for anything that once tried to gore him.',
  'Silk Hood':
    'Spider silk woven into a light cowl that covers the head without the bulk. It barely counts as armour, but the faint magical resistance woven into the fibre is real enough when a sprite takes offence.',
  'Silk Robe':
    'Millbrook spider silk spun into a robe so light it billows in a draught. The magic defence comes from the silk itself, which resonates faintly with ambient energy. Vesper Tain owns three and calls them work clothes.',

  // ── T2 Armor ──────────────────────────────────────────────────────────────────
  'Tin Plate Helm':
    'A proper helm forged from tin alloy, heavier than copper and considerably more serious about its job. The visor dips slightly to the left. Kessa says that is intentional. It is not.',
  'Tin Plate Cuirass':
    'Solid tin plate shaped to the torso, with riveted straps and a backplate that Kessa fits personally. It is the first armour that makes you walk differently, and the Deep Forest is where you start to need it.',
  'Tin Plate Greaves':
    'Shaped tin plates covering the shins and knees, strapped over padded cloth. They limit your sprint but protect against the low strikes that Deep Forest wolves favour. A fair trade, on balance.',
  'Wolf Leather Cap':
    'Tanned wolf hide shaped into a fitted cap, lined with the pelt for warmth. It carries a faint smell of pine that no amount of treatment removes. Rowan Delk says this is a feature.',
  'Wolf Leather Vest':
    'Deep Forest wolf hide, tanned supple and stitched into a vest that moves with you instead of against you. The dodge bonus is not enchantment; it is simply that well-made leather does not slow you down the way metal does.',
  'Wolf Leather Leggings':
    'Fitted leggings of tanned wolf leather, flexible at the knee and reinforced at the thigh. They handle the underbrush of the Deep Forest without snagging, which is more than most trousers can claim.',
  'Woven Hood':
    'Bandit cloth and spider silk woven into a hood that is lighter than it looks and warmer than it should be. The enchantment is subtle, barely perceptible, and Vesper insists that is the correct way to do it.',
  'Woven Tunic':
    'Layered cloth reinforced with spider silk thread, offering protection that has no right to exist in something this comfortable. The magic defence is woven into the fibre itself, and the dodge bonus comes from weighing almost nothing.',
  'Woven Pants':
    'Spider silk blended with forest cotton into trousers that flex, breathe, and resist minor hexes. They look ordinary, which is the point. The best defence is the one nobody expects.',

  // ── T3 Armor ──────────────────────────────────────────────────────────────────
  'Iron Helm':
    'Deep Mines iron forged into a full helm with cheek guards and a reinforced crown. Kessa Ironweld considers this the first headpiece worth engraving, and the small anvil stamp on the brow is hers. It is heavy. It is supposed to be.',
  'Iron Breastplate':
    'A solid chestpiece of Deep Mines iron, shaped to deflect and distribute blows across the torso. Kessa marks each one with her maker stamp and a serial number, because she has started caring about her legacy. The protection is serious. So is the weight.',
  'Iron Greaves':
    'Iron plates shaped to guard the knees and shins, articulated for a full stride. They ring faintly when you walk on stone, which is annoying in the Deep Mines and useful everywhere else, because nothing sneaks up on someone who sounds like a bell.',
  'Iron Boots':
    'Thick-soled boots with iron plating across the toe and heel, built for the kind of terrain where what you step on might object. The grip is excellent on stone. The weight takes getting used to.',
  'Iron Gauntlets':
    'Articulated iron plates across the knuckles and fingers, lined with warg leather for grip. Kessa designed the joints herself and is quietly proud of the range of motion. You can still hold a weapon properly, which was apparently not guaranteed in earlier prototypes.',
  'Warg Hide Cap':
    'A cap shaped from Whispering Plains warg hide, thick and coarse and smelling faintly of musk. It cushions blows that would ring a metal helm and keeps rain off better than tin. The smell is a known issue.',
  'Warg Hide Coat':
    'A long coat of warg hide, tanned dark and stitched with sinew for flexibility. It moves like a second skin, absorbs impacts the way only thick animal hide can, and makes you smell like something most predators would rather avoid. Rowan considers this a tactical advantage.',
  'Warg Hide Leggings':
    'Warg hide cut and stitched into leggings that protect the thigh and knee without binding the stride. They are warm in winter, tolerable in summer, and smell like warg in all seasons.',
  'Warg Hide Boots':
    'Boots of thick warg leather, double-soled and gripping. They handle the rocky scrub of the Whispering Plains without complaint and the musk keeps insects at a respectful distance.',
  'Warg Hide Gloves':
    'Fitted gloves of warg leather, supple enough for bowstring work and tough enough for a bare-handed block. The grip is excellent. The smell is persistent.',
  'Fae Silk Hood':
    'Ancient Grove fae silk shaped into a hood that shimmers faintly when magic is nearby. It weighs almost nothing and provides a magic defence that Vesper calls "elegant," which from her means the enchantment is structurally sound and aesthetically pleasing.',
  'Fae Silk Robe':
    'A robe woven from fae silk that catches light in colours the eye cannot quite name. The magical resistance is extraordinary for its weight, and the dodge bonus comes from wearing something so light you forget it is there. Vesper considers these the finest robes available below tier four. She is correct.',
  'Fae Silk Pants':
    'Fae silk spun into trousers so light they feel like wearing a warm breeze. The magic defence is woven into every thread, and the fabric adjusts to temperature with a subtlety that suggests the silk remembers being alive.',
  'Fae Silk Slippers':
    'Slippers of fae silk, soft-soled and silent on any surface. They provide almost no physical protection, but the magical warding in the weave is potent enough to turn minor hexes. Every step is quiet. Unnervingly so.',
  'Fae Silk Gloves':
    'Fae silk shaped into gloves so thin you can feel the grain of a staff through them. The dexterity is perfect, the magic channelling is clean, and the faint shimmer across the knuckles is the silk reacting to your body heat.',

  // ── T4 Armor ──────────────────────────────────────────────────────────────────
  'Dark Iron Helm':
    'Haunted Marsh dark iron shaped into a helm that absorbs light and radiates cold. The protection is formidable, and the faint chill across the brow never entirely fades. Kessa forges these in short sessions, because the metal resists heat the way it resists everything.',
  'Dark Iron Platemail':
    'A full chestpiece of dark iron, dense and cold and heavy enough to change your posture. The protection is the best that conventional metalwork can offer, and the weight is the price. Kessa says the metal cooperates grudgingly. She says this about all dark iron, and she means it every time.',
  'Dark Iron Greaves':
    'Dark iron plates guarding the legs from knee to shin, cold against the skin even through padding. The articulation is stiff compared to regular iron, because dark iron bends only when Kessa insists, and she has to insist repeatedly.',
  'Dark Iron Boots':
    'Thick boots plated with dark iron, heavy enough to crater soft ground. The grip is excellent on marsh terrain, which is where you will need them. The cold seeps upward through the soles for the first hour. After that, your feet go numb. Kessa says this is temporary.',
  'Dark Iron Gauntlets':
    'Gauntlets of dark iron, articulated with reluctant precision. The metal resists fine shaping, so Kessa forged each knuckle joint separately and riveted them by hand. The result is armour that protects the hands completely and makes the wearer feel as though the marsh is gripping back.',
  'Dark Iron Belt':
    'A belt of dark iron links, heavy enough to anchor your stance and cold enough to notice through your shirt. It holds the platemail in place and distributes the weight of the full set. Kessa considers it a structural necessity, not an accessory.',
  'Croc Scale Cap':
    'Haunted Marsh crocodile scales layered over a leather frame, forming a cap that is harder than most helms and lighter than it has any right to be. The scales overlap like roof tiles, shedding blows sideways. It smells like the marsh, faintly and permanently.',
  'Croc Scale Vest':
    'A vest of layered crocodile scales, each one placed and riveted to overlap the next. The result is armour that flexes, breathes, and stops blades with the disinterested competence of something that spent centuries being bitten by things larger than you.',
  'Croc Scale Leggings':
    'Crocodile scales stitched over reinforced leather, protecting the thighs and knees. The scales are naturally water-resistant, which matters in the Haunted Marsh and is simply convenient everywhere else.',
  'Croc Scale Boots':
    'Boots surfaced with crocodile scale, water-resistant and hard-wearing. They grip marsh mud without slipping and shrug off the kind of incidental bites that the swamp offers freely.',
  'Croc Scale Gloves':
    'Gloves of crocodile scale over leather, offering grip and protection without sacrificing finger movement. The scales across the knuckles are the thickest, placed there by Kessa because, as she put it, "your hands hit things more often than you admit."',
  'Croc Scale Belt':
    'A belt of interlocking croc scales, wide and sturdy and built to support the weight of a full set. The buckle is bone, because metal corrodes in the marsh and bone does not.',
  'Cursed Hood':
    'A cowl of cursed fabric from the Haunted Marsh, dark and faintly warm and shifting at the edges of vision. The magic defence is exceptional. The hood whispers when the wind blows. Vesper says that is the weave settling. Nobody believes her.',
  'Cursed Garb':
    'Robes stitched from cursed fabric, offering magic defence that borders on excessive and a dodge bonus born from the fabric being slightly out of phase with the physical world. Wearing it feels like standing in two places at once. The sensation fades. Mostly.',
  'Cursed Pants':
    'Trousers of cursed fabric, uncomfortably warm and faintly luminous at the seams. The magic defence is real and significant. The feeling that something is watching from inside the cloth is, according to Vesper, a known side effect of residual hexwork.',
  'Cursed Slippers':
    'Slippers of cursed fabric, silent on any surface and warm regardless of temperature. They leave no footprints on wet ground, which is useful in the marsh and unsettling everywhere else.',
  'Cursed Gloves':
    'Gloves of cursed fabric, thin as paper and strong as leather. Magic channelling through them is remarkably clean. The faint tingling in the fingertips is the hexwork resonating with your body heat, and it never entirely stops.',
  'Cursed Belt':
    'A sash of cursed fabric wound and knotted at the waist. It holds itself in place with a grip that has nothing to do with friction and everything to do with whatever intelligence remains in the weave. It will not come undone accidentally. Whether it will come undone on purpose is a separate question.',

  // ── T5 Armor ──────────────────────────────────────────────────────────────────
  'Mithril Helm':
    'Crystal Caverns mithril shaped into a helm so light it feels like wearing a circlet. The protection rivals dark iron at a fraction of the weight, and the metal gleams with a pale lustre that Kessa says is the mithril remembering sunlight it has never seen.',
  'Mithril Warplate':
    'A full chestpiece of mithril, lighter than iron and harder than anything the Pocketrealm has produced before. Kessa Ironweld spent six weeks perfecting the shaping technique and will not discuss the failures. The result is armour that moves like cloth and stops blows like stone.',
  'Mithril Greaves':
    'Mithril plates shaped to the leg with a precision that borders on sculptural. They weigh less than iron greaves and provide more protection, which Kessa considers a personal triumph and everyone else considers long overdue.',
  'Mithril Boots':
    'Boots plated with mithril, light-footed and sure-gripped. They ring softly on stone with a clear, bell-like tone that Kessa finds pleasing and the Deep Mines creatures find alarming. You can run in these. Properly run.',
  'Mithril Gauntlets':
    'Gauntlets of mithril so finely articulated that Kessa assembled each joint under a magnifying lens. The grip is perfect, the protection is comprehensive, and the knuckle plates flex with a fluidity that dark iron could never match. She considers them her finest small work.',
  'Mithril Belt':
    'A belt of woven mithril links, light and strong and bright as water in sunlight. It anchors the warplate without adding appreciable weight, and the clasp is a small engineering marvel that Kessa designed in secret because she did not want advice.',
  'Naga Scale Cap':
    'Sunken Ruins naga scales layered into a cap that is harder than stone and lighter than leather. The iridescent surface shifts colour with the angle of light, and the salt-mineral coating gives the whole piece a faint oceanic smell that never fades.',
  'Naga Scale Armour':
    'A vest of Naga scales, each one set by hand into overlapping rows that mimic the creature they came from. The armour is dense, flexible, and carries an iridescence that makes the wearer difficult to look at directly in bright light. Kessa calls this her most challenging leatherwork. She does not say whether she enjoyed it.',
  'Naga Scale Leggings':
    'Naga scales riveted over leather leggings, water-resistant and hard as stone. They handle the flooded passages of the Sunken Ruins without softening and turn blades with a click that sounds almost dismissive.',
  'Naga Scale Boots':
    'Boots surfaced with naga scale, perfectly waterproof and grippy on wet stone. They were designed for the Sunken Ruins and perform anywhere else with the quiet competence of equipment that has already survived the worst.',
  'Naga Scale Gloves':
    'Gloves of naga scale, iridescent and hard and surprisingly dexterous. The scales across the fingers are smaller and more precisely placed than anywhere else in the set, because Kessa refuses to sacrifice hand function for protection.',
  'Naga Scale Belt':
    'A belt of interlocking naga scales, broad and sturdy and carrying the permanent salt-sheen of the deep ruins. It supports the full armour set and distributes the weight with the effortless balance of a material that spent millennia under water.',
  'Spectral Hood':
    'A cowl of spectral fabric that is not entirely present in the physical world. It shimmers at the edges, reacts to magical fields, and provides protection through means that Vesper has documented extensively and explained to nobody. Looking at yourself in a mirror while wearing it is a strange experience.',
  'Spectral Robe':
    'A robe of spectral fabric, translucent in certain light and solid in others. The magic defence is the highest of any craftable light armour, and the dodge bonus comes from the fabric existing partly elsewhere. Vesper measured the phase differential once and has not released her findings.',
  'Spectral Pants':
    'Trousers of spectral fabric, warm and weightless and faintly luminous at the seams. They provide magic defence that would require twice the weight in conventional materials and a dodge bonus that comes from the fabric anticipating movement in ways Vesper finds "theoretically troubling."',
  'Spectral Slippers':
    'Slippers of spectral fabric, silent and weightless and leaving footprints that glow faintly for a moment before fading. They provide no physical armour to speak of, but the magical warding is extraordinary. Walking in them feels like walking on the surface of a still pond.',
  'Spectral Gloves':
    'Gloves of spectral fabric so thin they are nearly invisible. Magic channelled through them arrives with a clarity and force that surprises even experienced casters. The fabric hums faintly when a spell is forming, which serves as its own early warning system.',
  'Spectral Belt':
    'A sash of spectral fabric, knotted in a pattern that Vesper says is structurally significant and nobody else can replicate. It holds the robes in place, anchors the magical defences of the full set, and glows faintly at midnight for reasons that remain under investigation.',

  // ── Jewellery (continued) ─────────────────────────────────────────────────────
  'Copper Charm':
    'A small copper disc stamped with a four-leaf clover that Bram Holloway swears is traditional. The luck bonus is marginal, but the dodge improvement suggests the charm knows when to get out of the way, even if you do not.',
  'Iron Chain':
    'A necklace of linked iron forged in the Deep Forest style, heavy enough to feel serious and plain enough to match. The health bonus is modest but reliable, and Kessa considers the chain her most efficient use of iron, which is not a compliment to the rest of her catalogue.',
  'Iron Talisman':
    'An iron disc inscribed with a warding pattern that Aldric Voss traced from a Deep Forest monolith. The luck and dodge bonuses are subtle but measurable, and the talisman grows warm when danger is nearby, which is either useful or redundant depending on your awareness.',
  'Dark Iron Amulet':
    'A pendant of dark iron set on a leather cord, cold against the chest and faintly humming. The health and luck bonuses are significant for something so small. Kessa shaped it reluctantly, because she maintains that dark iron should be used for armour, not accessories. The ore disagreed.',
  'Dark Iron Charm':
    'A dark iron disc that absorbs light and radiates a chill that prickles the skin. The luck, dodge, and critical chance bonuses are notable for a charm, and the metal seems to pulse faintly in combat. Vesper says the pulse is thermic reaction. The timing suggests otherwise.',
  'Mithril Necklace':
    'A delicate chain of mithril links so fine they look like liquid silver. Kessa forged each link individually, and the health and luck bonuses reflect the precision of the work rather than any enchantment. It catches light beautifully, which Kessa considers irrelevant and everyone else considers the point.',
  'Mithril Talisman':
    'A disc of Crystal Caverns mithril, polished to a mirror finish and inscribed with a pattern that Vesper designed and Kessa executed with visible reluctance. The luck, dodge, and crit bonuses are the highest of any talisman below ancient tier. It hums at a frequency only dogs and Vesper can hear.',
  'Ancient Amulet':
    'A pendant carved from Sunken Ruins ore, warm to the touch and inscribed with symbols that predate every known language in the Pocketrealm. The health, luck, and accuracy bonuses are extraordinary. Aldric Voss has examined three of these and catalogued each inscription differently, because no two are alike.',
  'Ancient Charm':
    'A disc of ancient ore, smooth and warm and humming with a resonance that makes other jewellery vibrate sympathetically. The luck, dodge, and critical bonuses are the highest available. Vesper held one for thirty seconds and set it down carefully, saying only, "It is paying attention." She did not say to what.',

  // ── Soulbound Advanced Gear ────────────────────────────────────────────────────
  'Wolf Fang Necklace':
    'A Deep Forest wolf fang set in iron and hung on a leather cord. It rests against the collarbone like a promise, and the faint attack and crit bonuses come from wearing the kind of trophy that makes you feel dangerous. Which, at this point, you are.',
  "Bandit's Lucky Ring":
    'Taken from a Deep Forest bandit who insisted it was lucky, right up until it was not. The luck and dodge bonuses are real, and the ring fits perfectly regardless of hand size, which Vesper says is a minor enchantment and the bandit said was destiny.',
  'Ironbark Gloves':
    'Gloves reinforced with treant bark plating, hard as iron and half the weight. The armour and magic defence bonuses come from the bark itself, which retains a faint living warmth that treants would recognise. Kessa shaped them with a chisel instead of a hammer, because the bark asked her to.',
  'Bat Wing Boots':
    'Boots lined with bat wing membrane, impossibly light and eerily quiet. The dodge bonus is significant, born from wearing something that makes every step feel like a suggestion rather than a commitment.',
  'Goblin Trinket Charm':
    'A crude charm assembled from bits of shiny metal, coloured glass, and string, taken from a goblin who valued it more than anything. The luck and health bonuses are modest. The charm itself is ugly. It works anyway.',
  'Sprite Dust Ring':
    'A ring coated in sprite dust that has bonded permanently to the metal, giving it a faint golden glow. The magic power and luck bonuses are notable for a ring, and the dust never rubs off no matter how vigorously you try. Vesper says it is chemically married to the band.',
  'Fae Crown':
    'A circlet of living vine shaped by the fae of the Ancient Grove, worn as a charm rather than on the head. The magic defence and dodge bonuses come from the vine itself, which is still growing, imperceptibly slowly, and adjusting its shape to fit the wearer.',
  'Heartwood Shield':
    'A shield carved from the heartwood of an Ancient Grove oak, dense and warm and faintly resonant. The armour and health bonuses are substantial, and the wood repairs minor scratches overnight in a way that Vesper says is cellular regeneration and Kessa says is creepy.',
  'Crystal Core Belt':
    'A belt reinforced with a crystal core from the Deep Mines, heavy and stable and faintly luminous. The armour and health bonuses anchor the wearer, and the crystal pulses in time with the heartbeat, which is either reassuring or deeply personal depending on your perspective.',
  'Chitin Gauntlets':
    'Gauntlets plated with crawler chitin, layered for impact resistance and shaped for a closed fist. The attack and armour bonuses reflect the dual nature of chitin: hard enough to protect, sharp enough to harm. Kessa considers these proof that insects have better armour than most smiths.',
  'Warg Rider Belt':
    'A belt of warg leather, wide and thick and carrying the permanent musk of the Whispering Plains. The attack, dodge, and health bonuses come from wearing something that belonged to an animal that feared nothing. The smell comes free.',
  "Warlord's Signet":
    'A ring bearing the signet of a Whispering Plains warlord whose name Aldric Voss cannot find in any record. The attack and crit damage bonuses are significant, and the ring grows warm in combat as though it remembers what it was forged for.',
  "Windcaller's Charm":
    'A charm carved from harpy bone and strung with harpy feather, light enough to float if released. The dodge bonus is the highest of any single charm, and the charm sways toward incoming threats a fraction of a second before they arrive.',
  "Death Knight's Ring":
    'A ring of dark iron and bone, cold and heavy and pulsing faintly with a light that has no source. The attack and crit bonuses are formidable. The ring was taken from a death knight in the Haunted Marsh, and it carries a chill that suggests the original owner has opinions about the transfer.',
  'Hydra Scale Shield':
    'A tower shield faced with Swamp Hydra scales, iridescent and virtually impenetrable. The armour and health bonuses are the highest of any off-hand below tier five, and the shield regenerates minor scratches with an oily sheen that Kessa says is the scales remembering how to grow.',
  'Coven Amulet':
    'An amulet of dark glass and witch-bone, strung on cord that hums at frequencies Vesper finds "musically interesting." The magic power and crit bonuses are substantial, and the amulet grows warm during spellcasting in a way that feels collaborative rather than reactive.',
  'Storm Crystal Charm':
    'A shard of Crystal Caverns storm crystal, set in dark iron and crackling with static that makes your hair stand on end. The magic power and crit damage bonuses are exceptional, and the crystal discharges visibly during critical hits. Vesper considers it beautiful. Kessa considers it a hazard.',
  'Diamond Golem Belt':
    'A belt reinforced with plates from a Crystal Caverns diamond golem, harder than any natural material and faintly luminous. The armour and magic defence bonuses are extraordinary, and the plates ring like bells when struck, which is either a warning or a celebration.',
  "Goblin King's Crown":
    'A crown of hammered gold and crude gemstones, taken from the Goblin King of the Crystal Caverns and worn tilted because it was made for a head shaped differently than yours. The luck, attack, and health bonuses are impressive. The crown is ugly in a way that commands respect.',

  // ── Achievement Family Items (continued) ───────────────────────────────────────
  'Ironbark Shield':
    'A shield of ancient treant wood, so dense it turns steel and so old it remembers a forest that no longer exists. The armour and health bonuses are the reward for having fought every treant the Pocketrealm grows, and the shield weighs precisely as much as the effort it took to earn.',
  'Spectral Lantern':
    'A lantern that burns with spectral fire, carried as a charm. The magic power and magic defence bonuses come from the flame itself, which Vesper says is not fire at all but a sustained magical reaction. It never goes out, never needs fuel, and casts shadows that point the wrong way.',
  'Pixie Dust Ring':
    'A ring permanently coated in pixie dust from every pixie, sprite, and fae creature in the Pocketrealm. The luck and dodge bonuses are extraordinary, and the ring leaves a faint trail of golden motes wherever your hand passes. Cleaning it is not possible. Vesper has tried.',
  'Echolocation Helm':
    'A helm of bat-wing leather, fitted with membranes that vibrate in response to sound. The dodge and accuracy bonuses are exceptional, earned by someone who fought every bat variant the caves could produce. You can sense movement in the dark while wearing it, which is useful and profoundly disorienting.',
  'Crystal Core Charm':
    'A charm containing a crystalline core from the deepest golem in the Crystal Caverns, pulsing with a slow, geological heartbeat. The magic defence and armour bonuses are the reward for shattering every golem variant, and the core hums when danger approaches from underground.',
  'Chitin Legguards':
    'Legguards plated with chitin from every crawler variant in the Deep Mines, layered so densely that Kessa needed a diamond file to shape them. The armour and health bonuses reflect a career spent in tunnels where the insects grew to the size of dogs and the dogs grew to the size of horses.',
  'Featherstep Boots':
    'Boots of harpy feather and fae silk, so light they barely register on a scale. The dodge and accuracy bonuses come from footwear that anticipates the ground before you reach it. Walking in them feels like the floor is rising to meet you.',
  "Death Knight's Gauntlets":
    'Gauntlets of dark iron and bone from the Haunted Marsh, cold enough to numb bare hands on contact. The attack and crit damage bonuses are the reward for defeating every undead variant in the Pocketrealm. The gauntlets grow colder in combat, which Vesper says is impossible and your hands say is happening.',
  "Mire Walker's Belt":
    'A belt of layered marsh leather from every swamp beast in the Haunted Marsh, tanned and oiled until it is waterproof and virtually indestructible. The health and armour bonuses come from materials that survived the marsh, which is the highest qualification anything can claim.',
  'Hexweave Cowl':
    'A cowl woven from witch cloth collected from every coven in the Haunted Marsh, humming with layered hexwork that Vesper spent a week untangling into something safe. The magic power and magic defence bonuses are formidable. The cowl whispers occasionally. Vesper says that is the weave, not the witches. Probably.',
  'Primordial Shard Necklace':
    'A necklace strung with shards from every elemental type in the Pocketrealm, each one a different colour and temperature. The magic power and magic defence bonuses are balanced perfectly, and the shards orbit each other when you cast a spell, which Vesper finds "scientifically interesting" and everyone else finds alarming.',
  "Naga Queen's Ring":
    'A ring of naga pearl and ancient ore, given as tribute by a queen who no longer rules. The magic defence and dodge bonuses are extraordinary, and the ring adjusts its size to fit any finger perfectly. Aldric Voss theorises the ring was a diplomatic tool. The diplomacy it represents is not the gentle kind.',
  'Fleshknit Vest':
    'A vest of layered hide from every abomination variant in the Sunken Ruins, treated with Vesper\'s most aggressive stabilisation process. The health bonus is the highest of any single stat on any achievement item. The vest repairs itself overnight. "Self-healing leather," Vesper calls it. She does not explain further.',

  // ── T1 Resources ─────────────────────────────────────────────────────────────
  'Copper Ore':
    'Dull green chunks pried from shallow veins along the Forest Edge. It smelts into something almost useful, which is more than most things in these woods can claim.',
  'Oak Log':
    'A solid length of Forest Edge oak, still damp with sap. Woodcutters say the trees here practically volunteer, though whether that is generosity or a trap remains an open question.',
  'Forest Sage':
    'A grey-green herb with a sharp, peppery scent that clings to your fingers for hours. Herbalists prize it for basic remedies. Everyone else prizes it for keeping the rats away from their packs.',

  // ── T2 Resources ─────────────────────────────────────────────────────────────
  'Tin Ore':
    'Grey, dense chunks from Deep Forest deposits. Smelts into a serviceable alloy that Kessa considers the bare minimum for real metalwork.',
  'Maple Log':
    'Dark-grained wood from the Deep Forest, heavier than oak and considerably more stubborn to saw. Bowyers prize it for staves and longbows.',
  'Fungal Wood':
    'A log riddled with luminescent fungal growth, harvested from the Deep Forest floor. The mycelium strengthens the grain in ways that carpenters find useful and mycologists find fascinating.',
  'Moonpetal':
    'A pale flower that opens only at night and wilts by dawn. Vesper Tain harvests them by moonlight and says the timing is not superstition; it is chemistry.',
  'Cave Moss':
    'Damp, grey-green moss scraped from Cave Entrance walls. It glows faintly in the dark and tastes terrible, which Vesper considers irrelevant to its medicinal value.',

  // ── T3 Resources ─────────────────────────────────────────────────────────────
  'Iron Ore':
    'Heavy, rust-streaked stone from the Deep Mines, dense with iron that Kessa Ironweld considers the first ore worth her time. It takes proper heat and proper skill to work.',
  'Sandstone':
    'Layered sedimentary rock from the Deep Mines, soft enough to cut with hand tools and hard enough to build with. The masons of Millbrook use it for everything that needs to last.',
  'Elderwood Log':
    'A length of Ancient Grove elderwood, old enough that the growth rings tell a story longer than most histories. The grain spirals naturally, and the wood hums faintly when struck.',
  'Willow Log':
    'Whispering Plains willow, flexible and pale and carrying the scent of open grass. Bowyers consider it the finest natural wood for longbows.',
  'Starbloom':
    'A luminous white flower found in the Ancient Grove, blooming in starlight and closing at dawn. Vesper handles them with tweezers and distils them within the hour, because the potency fades with exposure to sunlight.',
  'Glowcap Mushroom':
    'A mushroom from the Deep Mines that glows a steady blue-green. Miners use them for light. Vesper uses them for reagents. The taste is apparently excellent, though nobody will confirm this on the record.',
  'Windbloom':
    'A tall, silver-stemmed flower from the Whispering Plains, bending in winds that do not seem to exist. Vesper says the stem channels ambient magical energy. Rowan Delk says it just does that.',

  // ── T4 Resources ─────────────────────────────────────────────────────────────
  'Dark Iron Ore':
    'Nearly black ore from the Haunted Marsh, cold to the touch and reluctant to smelt. Kessa says working it is like arguing with the earth. She wins, but the earth makes her earn it.',
  'Mithril Ore':
    'Pale, luminous ore from the Crystal Caverns, lighter than it looks and harder than anything else in the vein. Kessa treats each piece with the quiet reverence of someone handling material better than her usual supply.',
  'Bogwood Log':
    'Wood preserved in the Haunted Marsh for decades, dark and dense and smelling of peat. It does not rot, does not burn easily, and makes bows with a draw weight that punishes the archer as much as the target.',
  'Crystal Wood':
    'A log from the Crystal Caverns, partially crystallised by mineral saturation. It is translucent at the edges and rings like glass when tapped. Carpenters work it carefully, because it shatters if mishandled.',
  'Gravemoss':
    'A sickly grey-green moss found growing on the graves and ruins of the Haunted Marsh. Vesper uses it in her resist potions and says the active compounds are "robust," which is her way of saying the moss thrives on death.',
  'Shimmer Fern':
    'A Crystal Caverns fern with fronds that shimmer in patterns matching ambient magical fields. Vesper harvests them personally, because the mana restoration compounds degrade within hours if handled incorrectly.',

  // ── T5 Resources ─────────────────────────────────────────────────────────────
  'Ancient Ore':
    'Ore from the deepest chambers of the Sunken Ruins, warm to the touch and humming at a frequency that Vesper can detect but not identify. Kessa forges it with reverence and admits freely that the ore knows more about metallurgy than she does.',
  'Petrified Wood':
    'Sunken Ruins wood, hardened over centuries into something between timber and stone. It does not burn, does not bend, and holds an edge if you can manage to shape it, which requires tools that Kessa designed specifically for the purpose.',
  'Abyssal Kelp':
    'Dark, rubbery seaweed from the flooded depths of the Sunken Ruins, growing in water that has not seen light in centuries. Vesper distils it into her most potent preparations and says the taste is the least of its problems.',

  // ── T3 Gems ─────────────────────────────────────────────────────────────────
  'Rough Emerald':
    'A cloudy green stone pulled from an iron deposit in the Deep Mines. Uncut, it looks like a shard of green glass. Cut, it looks like money.',
  'Raw Jade':
    'A smooth, pale green stone found among Starbloom roots in the Ancient Grove. It is cool and dense and carries a faint resonance that gem cutters say makes it easier to shape than it should be.',
  'Crystal Bark':
    'A shard of crystallised bark from an elderwood tree in the Ancient Grove, formed where sap met mineral deposits over decades. It is harder than the tree it came from and considerably more valuable.',

  // ── T4 Gems ─────────────────────────────────────────────────────────────────
  'Rough Diamond':
    'An uncut diamond from a Crystal Caverns deposit, cloudy and angular and harder than anything in Kessa\'s toolbox. She cuts them with other diamonds, because nothing else works.',
  'Raw Moonstone':
    'A milky, opalescent stone found in the roots of Shimmer Fern patches, glowing faintly by moonlight. Vesper says the glow is stored magical energy. Gem cutters say it is just pretty. Both are correct.',
  'Heartwood Gem':
    'A crystallised node from deep within a Crystal Wood log, formed over decades of mineral absorption. It glows faintly amber and feels warm. Woodcutters consider finding one in a log to be excellent luck.',
  'Ancient Amber':
    'A large, deep-gold piece of fossilised resin from a Crystal Caverns tree that no longer exists. Something is visible inside, moving very slowly. Vesper says that is impossible. She is correct. It is still moving.',

  // ── T5 Gems ─────────────────────────────────────────────────────────────────
  'Rough Opal':
    'An uncut opal from the Sunken Ruins, shifting through colours that have no names in common speech. It is warm, heavy, and faintly luminous, and gem cutters approach it with the kind of caution usually reserved for live ordinance.',
  'Raw Starcrystal':
    'A crystalline formation found in the deepest chambers of the Sunken Ruins, pulsing with a cold white light. Vesper measured the energy output and declined to share the number. She said it would "cause excitement," which from her means panic.',

  // ── Cut Gems ─────────────────────────────────────────────────────────────────
  'Cut Ruby':
    'A Forest Edge ruby, polished and faceted into a deep red stone that catches light like a drop of blood. Small, but Kessa sets them into hilts for good reason.',
  'Cut Sapphire':
    'A Deep Forest sapphire, cut into a cool blue gem that seems to glow from within. Kessa sets them into tin and iron work for a splash of colour she will not admit she enjoys.',
  'Cut Emerald':
    'A Deep Mines emerald, faceted into brilliant green. The clarity is startling for something that spent millennia in the dark.',
  'Cut Diamond':
    'A Crystal Caverns diamond, cut with painstaking precision into a stone that fractures light into rainbows. Kessa uses them sparingly and charges accordingly.',
  'Cut Opal':
    'A Sunken Ruins opal, cut to reveal the shifting colours within. Each facet shows a different hue, and the stone seems to pulse faintly in the hand. Gem cutters consider a clean cut opal their finest achievement.',
  'Cut Amber':
    'A Forest Edge amber, polished smooth and warm to the touch. The beetle inside is now visible in perfect clarity, which Vesper considers a bonus and most customers consider a drawback.',
  'Cut Pearl':
    'A Deep Forest pearl, polished to a flawless lustre. The cool-to-the-touch property survives the cutting process, and the pearl seems to glow faintly in dim light.',
  'Cut Jade':
    'An Ancient Grove jade, polished and shaped into a smooth cabochon. The pale green deepens in magical light, which gem cutters say is the stone responding to ambient energy.',
  'Cut Moonstone':
    'A Crystal Caverns moonstone, polished until the opalescent glow is visible even in daylight. It sits in the palm like a captured moon. Vesper keeps one on her workbench for calibration purposes she will not explain.',
  'Cut Starcrystal':
    'A Sunken Ruins starcrystal, faceted with tools that Kessa designed specifically for the task. The cold white light is now focused and directional, and the gem hums at a frequency that makes nearby glass vibrate.',
  'Cut Resin':
    'Forest Edge resin, polished into a golden bead. The vanilla scent survives the process, and the hardness makes it useful as a setting stone for delicate metalwork.',
  'Cut Sap':
    'Deep Forest fossilised sap, polished transparent. The ancient inclusions are visible in sharp detail, and the stone is harder than glass and warmer than stone.',
  'Cut Bark':
    'Ancient Grove crystal bark, shaped and polished into a translucent cabochon. The internal grain patterns are visible, spiralling the way elderwood grows. It glows faintly amber in magical light.',
  'Cut Heartwood':
    'A Crystal Caverns heartwood gem, polished to reveal the amber glow within. The warmth is perceptible even through a glove. Gem cutters say cutting one feels like opening a very small door.',
  'Cut Ancient Amber':
    'Sunken Ruins ancient amber, polished into a deep gold stone with something still moving inside. The movement is slower now, visible only if you watch for several minutes. Nobody watches for several minutes twice.',

  // ── Ingots ─────────────────────────────────────────────────────────────────────
  'Copper Ingot':
    'Dull orange metal, smelted from Forest Edge ore. It bends too easily and tarnishes too quickly, but it is where every smith starts. Including Kessa.',
  'Tin Ingot':
    'A pale, solid bar smelted from Deep Forest tin. Harder than copper and less temperamental than iron. Kessa considers it workmanlike, which is as much as she asks of tier two.',
  'Iron Ingot':
    'A heavy bar of Deep Mines iron, properly smelted and properly dense. Kessa handles these with the quiet satisfaction of a smith who has reached material that deserves her attention.',
  'Cut Stone':
    'Deep Mines sandstone, cut into uniform blocks. The masons prize it for construction, and Kessa uses it for anvil bases when her iron ones crack. Which they do, occasionally.',
  'Dark Iron Ingot':
    'A cold, nearly black bar of Haunted Marsh dark iron. It absorbs light and resists heat and tests the patience of every smith who works it. Kessa says the metal has a personality. She is not fond of it.',
  'Mithril Ingot':
    'A gleaming bar of Crystal Caverns mithril, lighter than iron and harder than steel. Kessa works it in short, focused sessions and treats each ingot as though it might be the last, because mithril is rare enough that it might be.',
  'Ancient Ingot':
    'An ingot smelted from Sunken Ruins ore, warm and humming faintly. Kessa says it is the finest metal she has ever worked and the only one she trusts more than her own judgement.',

  // ── Planks ─────────────────────────────────────────────────────────────────────
  'Oak Plank':
    'A flat-sawn board of Forest Edge oak, still smelling of sawdust. Reliable, common, and unpretentious.',
  'Maple Plank':
    'Deep Forest maple, planed smooth and dark-grained. It takes stain beautifully and holds nails without splitting.',
  'Fungal Plank':
    'A plank of fungal wood, faintly luminescent at the edges. The mycelium running through the grain makes it surprisingly resistant to splitting.',
  'Elderwood Plank':
    'A board of Ancient Grove elderwood, heavy and dense and spiralling at the grain. Woodworkers treat it with respect bordering on nervousness.',
  'Willow Plank':
    'Whispering Plains willow, planed thin and flexible. It bends without breaking, which makes it ideal for bow staves and instrument backs.',
  'Bogwood Plank':
    'Haunted Marsh bogwood, sawn with difficulty and dark as peat. It does not rot, does not warp, and makes furniture that outlasts the house it sits in.',
  'Crystal Plank':
    'Crystal Caverns wood, partially crystallised and translucent at the edges. Sawing it produces a high, clear tone. Dropping it produces fragments.',
  'Petrified Plank':
    'Sunken Ruins petrified wood, harder than stone and heavier than iron. It requires specialised tools to shape and the patience to match.',

  // ── Leather and Cloth ─────────────────────────────────────────────────────────
  'Rat Leather':
    'Thin, greasy leather tanned from rat pelts. It works for gloves and straps. Nobody brags about wearing it.',
  'Boar Leather':
    'Thick, tough leather from Forest Edge boar hide. Stubborn to work with and stubborn to wear out, which is the same thing said twice.',
  'Silk Cloth':
    'Forest Edge spider silk, woven into cloth so light it floats on a strong exhale. The strength-to-weight ratio is remarkable, provided you do not think about the source.',
  'Wolf Leather':
    'Deep Forest wolf hide, tanned into supple, grey-brown leather. It smells faintly of pine and handles like a material that is better than you deserve at this level.',
  'Bat Leather':
    'Leather tanned from Cave Entrance bat wing membrane, thin and flexible and unsettlingly quiet. Cobblers use it for boot linings when silence matters.',
  'Woven Cloth':
    'Spider silk and bandit cloth combined into a textile that is lighter than either and stronger than both. The weavers of Millbrook consider it their signature product.',
  'Warg Leather':
    'Whispering Plains warg hide, tanned dark and heavy. The musk persists through every stage of the process. Rowan Delk says you get used to it. This is technically true.',
  'Chitin Plate':
    'Crawler chitin, cleaned and shaped into rigid plates for armour reinforcement. Kessa bonds them with iron rivets and calls the result "nature doing her job for her."',
  'Fae Fabric':
    'Fae silk and dryad thread woven into cloth that shimmers in colours the eye struggles to name. It is impossibly light, faintly warm, and more durable than any mundane textile.',
  'Croc Leather':
    'Haunted Marsh crocodile hide, tanned into leather so tough that Kessa uses a diamond awl to punch stitching holes. It smells like the marsh. Always.',
  'Scale Mail':
    'Hydra scales set in leather backing, forming a flexible sheet of armour material. Each scale must be placed individually, which makes assembling a full vest an exercise in patience.',
  'Cursed Fabric':
    'Cloth woven from witch cloth fibres, dark and warm and faintly humming. Vesper stabilises it before anyone is allowed to cut or sew it, because unstabilised cursed fabric has a tendency to stitch itself back together.',
  'Ethereal Cloth':
    'A textile of spectral silk and witch cloth, translucent and warm and not entirely present in the physical world. Tailors sew it with bone needles, because metal passes through it unpredictably.',
  'Naga Leather':
    'Sunken Ruins naga hide, tanned into leather that is iridescent, waterproof, and harder than boar leather at twice the thickness. Kessa works it slowly and bills accordingly.',
  'Spectral Fabric':
    'Fabric woven from spectral silk, existing partly in the physical world and partly elsewhere. It provides magical resistance through mechanisms Vesper has documented but not published. The cloth glows faintly at the seams.',

  // ── T2 Mob Drops (continued) ───────────────────────────────────────────────────
  'Bat Fang':
    'A curved incisor from a Cave Entrance dire bat, sharp and hollow. Vesper uses them as pipette tips. Everyone else considers this deeply unpleasant.',
  'Stolen Coin':
    'A tarnished copper coin taken from a Deep Forest bandit. It could be anyone\'s. The bandit certainly did not earn it.',
  'Crude Gemstone':
    'A rough, cloudy stone of uncertain type, dropped by a goblin who clearly valued quantity over quality. A jeweller could identify it. Nobody has bothered.',

  // ── T3 Mob Drops (continued) ───────────────────────────────────────────────────
  'Rough Gem':
    'An unidentified gem dropped by a Whispering Plains creature, cloudy and angular. It could be worth something once a jeweller takes a proper look.',
  'Stolen Ore':
    'A chunk of ore taken from a creature that took it from a miner who would like it back. Provenance unclear. Utility intact.',
  'Crystal Shard':
    'A sharp fragment of raw crystal from the Deep Mines, glowing faintly and warm to the touch. Too small to cut, too pretty to discard. Vesper buys them in bulk.',
  'Harpy Talon':
    'A curved, hooked talon torn from a Whispering Plains harpy. Bowyers set them into crossbow mechanisms, and Kessa uses them as engraving tools when her steel ones dull.',

  // ── T4 Mob Drops (continued) ───────────────────────────────────────────────────
  'Cut Gem':
    'A gem already cut and polished, taken from a creature in the Crystal Caverns that had no use for jewellery but excellent taste in collecting. It is ready for setting.',
  'Goblin Gold':
    'A small, irregular nugget of actual gold, hoarded by Crystal Caverns goblins. Bram Holloway buys them without question and sells them without comment.',
  'Dark Crystal':
    'A shard of dark crystal from the Crystal Caverns, cold and dense and absorbing light at its edges. Vesper uses them in her most advanced work and says they are "concentrated absence," which she means literally.',

  // ── Consumables (continued) ────────────────────────────────────────────────────
  'Focused Mana Potion':
    'Starbloom and Shimmer Fern in precise proportion, brewed by Vesper into a mana draught that hits cleaner than its predecessors. The clarity of restoration is notable; spells cast immediately afterward feel sharper, as if the mana itself has an opinion about quality.',
  'Supreme Mana Potion':
    'Vesper\'s pinnacle of mana restoration: Abyssal Kelp and reagents she sources from the Sunken Ruins through channels she will not describe. One hundred and twenty points of mana, enough to fuel sustained casting that would drain lesser potions three times over. The bottle is cold. The contents glow.',
};
