# NPC Dialogue: Thornwall Frontier Merchant

## Content

### Character Brief

**Name:** Lira Caravel
**Location:** The Supply Depot, near Thornwall's western gate
**Personality:** Sharp, pragmatic, and priced accordingly. Lira runs the Supply Depot with the unsentimental efficiency of someone who has personally hauled inventory across the Whispering Plains on a cart with one bad wheel and a harpy problem. She is polite but transactional, friendly but never at a discount, and she knows the exact value of everything she sells because she knows exactly what it cost to get it here. Where Bram Holloway in Millbrook sells with gentle amusement, Lira sells with the quiet confidence of a woman whose prices reflect survival margins, not markup.

---

### Greeting Lines (on shop open)

> "Supply Depot's open. Everything on the shelves made it here from somewhere worse than where you are standing. The prices reflect the journey. If that bothers you, Millbrook is back through the plains."

> "Welcome. If you need dark iron, mithril, crystal wood, or anything else that requires a death wish to source, you are in the right place. If you need rat pelts, you have overshot."

> "New stock came in yesterday. Lost a wheel and two guards on the trip, but the inventory survived, which is what matters. To me. The guards had families, which is what matters to them. Commerce is complicated."

### Browse / Idle Lines (while shop is open)

> "That dark iron? Hauled from the Iron Mires by a team that spent three days waist-deep in marsh water while things tried to eat them. The price includes their hazard pay. And mine. And the wheel I replaced. Twice."

> "Bram Holloway back in Millbrook sells copper ore for pocket change and calls it commerce. I sell mithril ingots to people who know what they are worth. We are in the same industry the way a rowboat and a warship are in the same water."

> "If you are looking for something I do not carry, it either does not exist or it has not been discovered yet. In either case, check back next week. Discoveries happen faster than you would think out here."

> "The Forge District buys half my stock before adventurers see it. If you want first pick, arrive at dawn. I open early because supply chains do not respect sleep schedules."

### Purchase Lines (on buy)

> "Sold. You will not find better materials this side of the Sunken Ruins, and anything from the Sunken Ruins has a surcharge for 'retrieved from a place where the water tries to kill you.'"

> "Good choice. Handle it well. Every item in this depot crossed the Whispering Plains to reach you, and the plains do not give refunds."

### Sell Lines (player selling materials)

> "Let me see. Hmm. Quality is decent. Source zone? Never mind, I can tell by the residue. Haunted Marsh. I can smell the bog from here. Fair price for fair goods."

> "Crystal Caverns material? Excellent. This will move fast. The artificers in the Forge District have a standing order for anything that glows."

> "I will take it. And yes, my buy price is lower than my sell price. That is not greed. That is the wheel replacement fund."

### Farewell Lines (on shop close)

> "Good luck out there. And if you find anything interesting on your travels, bring it here first. I pay better than Bram, and I ask fewer questions."

> "Safe travels. The supply line runs both ways. You bring the materials, I bring them to market, and Thornwall keeps standing. That is the arrangement."

## Integration Notes

- **Same dialogue system as all previous NPCs:** Keyed by NPC ID and event type, random selection.
- **Character name (Lira Caravel):** Ninth named NPC. Third Thornwall NPC (alongside Silas Vane and Gavrik Stoneshoulder).
- **Cross-references:**
  - Bram Holloway (N-01) is referenced twice, establishing a professional rivalry. Bram sells starter goods with amusement; Lira sells advanced goods with survival margins. They are the same job at different scales.
  - The Iron Mires (Z-09) and the Whispering Plains (Z-07) are referenced in idle lines, grounding her supply chain in zones the player has explored.
  - The Forge District (Z-08) is referenced as her primary buyer.
  - The Sunken Ruins and Crystal Caverns are referenced as source zones for premium materials.
  - Sell lines identify material source by "residue," adding a sensory detail that makes Lira feel like a genuine expert.
- **Personality niche:** Among Thornwall NPCs: Silas (chance), Gavrik (solidarity), Lira (supply). Among all NPCs, she represents the logistics of the Pocketrealm: the unglamorous but essential work of moving materials from dangerous places to useful ones.
- **Pricing philosophy:** Her dialogue makes the mechanical reality of higher prices in Thornwall feel narratively justified. Items cost more here because the supply chain is longer and more dangerous, not because of arbitrary game balance.
- **Location detail:** The Supply Depot at Thornwall's western gate (Z-08) is the entry point for supplies arriving from across the plains. Placing Lira here means she is the first merchant players encounter when entering Thornwall from the west.
