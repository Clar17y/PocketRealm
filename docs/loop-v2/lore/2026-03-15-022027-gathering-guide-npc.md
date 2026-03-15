# NPC Dialogue: Mining Trainer / Gathering Guide (Millbrook)

## Content

### Character Brief

**Name:** Rowan Delk
**Location:** Just outside Millbrook's gate, leaning against the palisade
**Personality:** Weathered, terse, and quietly competent. Rowan has spent more of his life outside Millbrook's walls than inside them, and it shows: sun-darkened skin, hands like old leather, and a way of talking that assumes you already know half of what he is saying and will figure out the rest once you stop interrupting. He teaches mining, woodcutting, and foraging not because he enjoys teaching but because he is tired of watching adventurers ruin perfectly good resource nodes through ignorance. He respects the land the way a sailor respects the sea: with fondness, caution, and the certain knowledge that it will kill you if you let it.

---

### Greeting Lines (on gathering trainer open)

> "You want to learn how to gather? Good. Step one: stop swinging at things for five minutes and look at the ground. It has been trying to tell you something since you left the gate."

> "Mining, woodcutting, foraging. Three skills, one principle: the land gives you what it has if you know how to ask. If you do not know how to ask, it gives you blisters and a long walk home."

> "Back again. Good. Most people try gathering once, decide it is boring, and go back to hitting rats. The ones who stick with it are the ones who eat regularly. Coincidence? No."

### Skill-Specific Lines (on selecting a gathering skill)

**Mining:**
> "Mining is simple. Find a vein. Hit it with a pick. Hit it again. Keep hitting it until the ore comes loose or your arms give out. The ore is patient. You should be too."

> "Copper at the Forest Edge, tin in the Deep Forest and caves, iron in the Deep Mines. The deeper you go, the better the ore, and the worse the company. That is the bargain."

**Woodcutting:**
> "The oaks in the Forest Edge are easy. The maples in the Deep Forest are harder. The elderwood in the Ancient Grove will actively resent you for trying. Plan accordingly."

> "Rule one of woodcutting: check if the tree is looking at you before you swing. If it is, pick a different tree. Trust me on this."

**Foraging:**
> "Forest Sage grows everywhere at the Edge. Smells like pepper, keeps the rats off. Moonpetal is deeper, only blooms at night. Starbloom is in the Grove, and the things that guard it do not appreciate visitors."

> "Vesper will buy whatever you bring her, but she pays better for clean harvests. Bruised herbs lose their potency. Take your time. The mushrooms are not going anywhere. Usually."

### Browse / Idle Lines (while panel is open)

> "See that tree line? I have worked every node between here and the Deep Mines. Twenty years of gathering. Still have all my fingers. That is not luck. That is technique."

> "Bram thinks gathering is just the supply side of his business. Kessa thinks it is just the part before the forge. They are both wrong. Gathering is the part where you listen, and the Pocketrealm decides what to give you."

> "The gems come when they come. You cannot force a ruby out of a copper vein any more than you can force a good day out of a bad one. Swing steady. Pay attention. The rest is between you and the stone."

### Farewell Lines (on panel close)

> "Now go out there and practice. The nodes will not gather themselves. Well. The mushrooms might. But the ore definitely will not."

> "Keep your tools sharp and your eyes open. The land remembers who treats it well."

## Integration Notes

- **Same dialogue system as N-01 through N-05:** Keyed by NPC ID and event type, random selection. New event type: "skill_select" for mining/woodcutting/foraging-specific lines.
- **Character name (Rowan Delk):** Sixth named Millbrook NPC. Located outside the gate, not inside the town, which distinguishes him physically from the other NPCs and connects him to the wilderness.
- **Cross-references:**
  - Mining lines reference the resource progression: Copper (Forest Edge Z-02), Tin (Deep Forest Z-03), Iron (Deep Mines Z-06).
  - Woodcutting lines reference oak (Forest Edge), maple (Deep Forest), and elderwood (Ancient Grove Z-05), with the treant joke paying off M-06 ("check if the tree is looking at you").
  - Foraging lines reference Forest Sage (I-02), Moonpetal (Deep Forest), and Starbloom (Ancient Grove Z-05).
  - Vesper Tain (N-04) is referenced as a buyer for foraged herbs.
  - Bram (N-01) and Kessa (N-02) are referenced in the idle line, establishing Rowan's view of them and his philosophy that gathering is undervalued.
  - The gem idle line references the gem drop system from gathering crits.
- **Personality niche:** Bram (commerce), Kessa (craft), Maren (community), Vesper (knowledge), Aldric (order), Rowan (the land). He is the connection between the town and the wilderness, the one who sees value in what the world produces rather than what the town consumes.
- **Location detail:** Placing Rowan outside the gate (Z-01: "A guard is usually posted here") creates a natural encounter point for players heading out to gather, and separates him from the indoor NPCs.
