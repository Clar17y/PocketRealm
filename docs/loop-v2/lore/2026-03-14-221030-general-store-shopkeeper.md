# NPC Dialogue: General Store Shopkeeper (Millbrook)

## Content

### Character Brief

**Name:** Bram Holloway
**Location:** Left side of Main Street, Millbrook
**Personality:** Practical, unhurried, faintly amused by everything. Bram has run the general store since before most adventurers were born and treats every transaction like a small, predictable miracle. He speaks in the measured cadence of a man who has learned that rushing only leads to miscounted change.

---

### Greeting Lines (on shop open)

> "Welcome, welcome. Everything's priced fair and stacked where you can see it. I don't haggle, I don't barter, and I don't accept 'interesting stories' as currency. We tried that once. The economy did not recover."

> "Ah, another fresh face. Or a familiar one, hard to tell with all the mud. Come in, have a look. Try not to bleed on the merchandise."

> "Morning. Or evening. Honestly, I stopped keeping track. What do you need?"

### Browse / Idle Lines (while shop is open)

> "Take your time. I'm not going anywhere. Tried once, got as far as the gate, turned right back around. Terrible commute."

> "If you're looking for something specific, just ask. If you're looking for something that doesn't exist, also ask. I'll tell you no, but at least we'll both know."

> "That? Oh, that's been on the shelf since before the last Rat King incident. Still perfectly good. Probably."

### Purchase Lines (on buy)

> "Solid choice. Or at least a choice. You'll find out which one soon enough."

> "Pleasure doing business. Come back alive and we'll do it again."

> "Sold. And if it breaks, you didn't buy it here. That's our return policy."

### Sell Lines (player selling items)

> "Let me see... yes, I can take that off your hands. Won't ask where you got it. Learned that lesson years ago."

> "Rat pelts again? I swear, half this town's economy runs on dead vermin. Fine, I'll add it to the pile."

> "Not bad, not bad. I'll give you a fair price, which means you'll think it's too low and I'll think it's too high. That's how you know it's fair."

### Farewell Lines (on shop close)

> "Safe travels. And if the Forest Edge gives you trouble, remember: the store opens at dawn. Assuming I'm awake."

> "Off you go, then. Try not to die out there. It's terrible for repeat business."

## Integration Notes

- **Shop open/close events:** Trigger greeting and farewell lines when the player opens/closes the shop UI panel.
- **Browse idle:** Display on a timer or randomly while the shop panel stays open without a transaction.
- **Buy/sell:** Show the relevant line as a brief toast or speech bubble after confirming a transaction.
- **Character name (Bram Holloway):** Can be displayed as the shop panel header or NPC nameplate. Reusable in quest dialogue and other NPCs' references.
- **Consistency:** References "the gate" (from Millbrook zone lore), "Rat King incident" (from vermin bestiary), and "rat pelts" (from the T1 mob drops item list, I-04). The shop location matches Main Street's left-side stalls described in the Millbrook zone entry.
- **Implementation:** Store dialogue lines in a JSON/TS config keyed by NPC ID and event type (greeting, idle, buy, sell, farewell), with random selection per event.
