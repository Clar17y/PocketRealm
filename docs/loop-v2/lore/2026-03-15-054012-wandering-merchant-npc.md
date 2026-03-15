# NPC Dialogue: Wandering Merchant (Random Encounters)

## Content

### Character Brief

**Name:** Vex
**Location:** Encountered randomly while exploring any wild zone
**Personality:** Cheerful, enigmatic, and operating under a business model that defies conventional supply chain analysis. Vex appears without warning, sells without explanation, and vanishes without ceremony. They carry a pack that is visibly too small for the inventory it contains and wear a cloak that changes colour depending on the zone (green in forests, grey in caves, pale blue underground). Nobody knows where Vex comes from, where Vex goes, or how Vex survives alone in territories that kill armed patrols. Lira Caravel considers Vex a competitor. Bram Holloway considers Vex a rumour. Vex considers both of them "colleagues who work indoors, which must be nice."

---

### Greeting Lines (on encounter)

> "Oh, hello. You look like someone who needs something and did not know it until just now. Lucky you. Lucky me. Let us browse."

> "Fancy meeting you here. Or anywhere, really. The wilderness is large and meetings are statistically unlikely, which makes this one either fortune or fate. I sell to both."

> "Welcome to my shop. It is wherever I am standing. The overhead is low, the selection is surprising, and the return policy is that we never meet again. Shall we?"

### Browse / Idle Lines (while shop is open)

> "Where do I get my inventory? From places. Specifically, from places that other merchants will not go, for reasons that other merchants find compelling. I find them negotiable."

> "That item? Found it in the Haunted Marsh, wedged between two bones that were not originally neighbours. Cleaned it up nicely. Barely cursed at all."

> "People ask how I survive out here alone. The answer is: I am very fast, very quiet, and very good at knowing when to stop being in a place. Also, most things find merchants confusing. Violence they understand. Commerce baffles them."

> "Lira at the Thornwall depot thinks I undercut her prices. I do not undercut her prices. I simply do not have a wheel replacement fund, a warehouse lease, or guards to pay. My overhead is a pair of boots and a willingness to be uncomfortable."

### Purchase Lines (on buy)

> "Pleasure doing business. If anyone asks where you got that, feel free to say 'a merchant in the woods.' They will assume you are joking. Let them."

> "Sold. And before you ask: no receipt, no warranty, and no fixed address for complaints. What I can promise is that it works. I do not sell things that do not work. Bad for the reputation, and out here, reputation is everything."

### Farewell Lines (on shop close / encounter end)

> "Off you go. And off I go. We shall meet again, or we shall not. The Pocketrealm is generous with coincidences."

> "Until next time. Assuming there is a next time. For both of us. The wilderness is impartial about these things."

## Integration Notes

- **Unique encounter system:** Unlike town NPCs, Vex appears during exploration as a random event. Dialogue triggers on encounter discovery, not on visiting a fixed location.
- **Character name (Vex):** Tenth named NPC. Deliberately ambiguous (no surname, no pronoun commitment, no fixed location). The mystery is the character.
- **Cross-references:**
  - Lira Caravel (N-09) is referenced as a competitor, establishing a Thornwall-wilderness rivalry.
  - Bram Holloway (N-01) considers Vex a rumour, placing Vex in the Millbrook gossip ecosystem.
  - The Haunted Marsh (Z-09) is referenced in an idle line ("wedged between two bones").
  - The colour-shifting cloak adapts to zone context, making Vex feel like a natural part of whichever zone the player encounters them in.
- **Personality niche:** Among all NPCs: Bram (commerce), Kessa (craft), Maren (community), Vesper (knowledge), Aldric (order), Rowan (the land), Silas (chance), Gavrik (solidarity), Lira (supply), Vex (mystery). Vex is the only NPC who exists outside the settlement framework, and their dialogue reflects a worldview shaped by solitude, self-reliance, and the cheerful acceptance that everything is temporary.
- **Implementation:** Vex can appear as a random exploration event in any wild zone, offering a rotating selection of items that may include materials, consumables, or rare finds not available in town shops. The encounter frequency and inventory should be tuned to feel like a genuine surprise.
- **The pack:** "Visibly too small for the inventory it contains" is a deliberate nod to video game inventory logic, delivered in-world as a character trait rather than a fourth wall break.
