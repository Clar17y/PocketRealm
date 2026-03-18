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
  'Wayfinder Buckler':
    'A small, battered shield that has seen more forearms than battlefields. Kessa keeps a stack of them by the door for new arrivals. "You will lose this within a week," she says. "Try to prove me wrong."',

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

  // ── T1 Resources ─────────────────────────────────────────────────────────────
  'Copper Ore':
    'Dull green chunks pried from shallow veins along the Forest Edge. It smelts into something almost useful, which is more than most things in these woods can claim.',
  'Oak Log':
    'A solid length of Forest Edge oak, still damp with sap. Woodcutters say the trees here practically volunteer, though whether that is generosity or a trap remains an open question.',
  'Forest Sage':
    'A grey-green herb with a sharp, peppery scent that clings to your fingers for hours. Herbalists prize it for basic remedies. Everyone else prizes it for keeping the rats away from their packs.',
};
