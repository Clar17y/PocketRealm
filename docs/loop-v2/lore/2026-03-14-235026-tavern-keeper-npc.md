# NPC Dialogue: Tavern Keeper (Millbrook)

## Content

### Character Brief

**Name:** Maren Ashwick
**Location:** The Crooked Antler, Millbrook
**Personality:** Warm, sharp-eyed, and dangerously good at listening. Maren has tended bar at The Crooked Antler for longer than most people in Millbrook have been alive, and she treats the place like an extension of herself: slightly creaky, surprisingly resilient, and always open. She remembers every face, every drink order, and every rumour that has ever been whispered across her counter. She gives advice freely, pours generously, and knows exactly how much truth a person can handle before they need another round.

---

### Greeting Lines (on tavern open)

> "Well, look what the Forest Edge dragged in. Sit down, you look like you've been arguing with something that bites. What'll it be?"

> "Welcome back to the Antler. Same as last time? Don't worry, I remember. I remember everyone's. It's a gift. Or a curse. Depends on the customer."

> "You're alive! That's worth celebrating. Or at least worth a drink, which is the same thing in here."

### Idle / Atmosphere Lines (while in tavern)

> "See that antler above the door? Nobody knows what it came from. Too big for a deer, too small for whatever lives past the Whispering Plains. My grandmother hung it there and told everyone to stop asking. We stopped asking."

> "Kessa was in here last night, complaining about an apprentice who tried to forge tin without preheating the mould. Said the ingot came out looking like a very expensive potato. She was furious. It was wonderful."

> "Bram sent over a cask of something he called 'spiced cider.' I'm still not sure what spice. Neither is he. But it sells, and nobody's died yet, so we've agreed not to investigate."

> "Adventurers always come back with the same look. Not scared, exactly. More like they've realized the forest is bigger than they thought. That's the look. You've got it right now."

### Rest / Heal Lines (on rest action)

> "Put your feet up. The stew's on, the fire's going, and nothing out there is getting in here tonight. I checked."

> "Rest as long as you need. The Antler's been standing since before the first wolf pack, and it'll be standing after the last one. You're safe in here."

### Rumour / Lore Lines (information hooks)

> "Word from the woodcutters: the maples in the Deep Forest have been moving. Not growing, mind you. Moving. Slowly, but deliberately. Might want to keep your axe handy."

> "A trader came through last week, said he saw lights in the caves past the Forest Edge. Green lights, deep underground. Goblins, probably. Or something worse. With caves, it's always something worse."

> "The old guard at the gate swears he heard howling from the Deep Forest three nights running. Wolves, he says. But wolves don't howl in unison like that unless something's organized them."

### Farewell Lines (on tavern close)

> "Off again? Stay sharp, stay fed, and come back with a story worth hearing. That's my only rule."

> "Door's always open. Well, not literally. Literally it's closed at night. But metaphorically, always open."

## Integration Notes

- **Same dialogue system as N-01 and N-02:** Keyed by NPC ID and event type, random selection per trigger.
- **New event types:** "rest" (triggers on rest/heal action in tavern), "rumour" (triggers on an information/lore interaction, or randomly during idle).
- **Character name (Maren Ashwick):** Display as the tavern NPC nameplate. She is the third named Millbrook NPC alongside Bram Holloway and Kessa Ironweld.
- **Cross-references:** Idle lines directly reference Kessa (N-02) and Bram (N-01) by name, establishing that these NPCs exist in the same social world. Rumour lines seed upcoming content: moving maples (treants, M-06), green cave lights (goblins, M-08), organized howling (wolves, M-04).
- **The Crooked Antler name:** Established in Z-01, now given a backstory through the antler idle line (grandmother hung it, origin unknown). This mystery can be expanded in future lore.
- **Personality niche:** Bram sells goods (transactional). Kessa sells weapons (professional). Maren sells comfort, information, and a sense of belonging (social). The three NPCs form a triangle of Millbrook life: commerce, craft, community.
- **Rumour system potential:** The "rumour" lines can rotate with game state, hinting at zones the player hasn't discovered yet or events in progress. Future iterations could make these context-aware.
