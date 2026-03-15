# Achievement Flavor: Secret and Tutorial Achievements

## Content

### Humbling Experience (first death, secret)

*"You lost. Not 'almost lost,' not 'barely survived,' but properly, completely, face-in-the-dirt lost. Something in the Pocketrealm hit you harder than you expected, and instead of a victory screen you got a long, quiet walk back to town with nothing but your pride in tatters. This is not a failure. This is a lesson, and it is the most important one the Pocketrealm teaches: you are not invincible. Now get up."*

Unlock text: You fell. You got back up. The Pocketrealm does not remember your defeats. It remembers what you did after them.

### The Graduate (tutorial complete, title: The Graduate)

*"The tutorial is behind you. The training dummies are done, the practice swings have been swung, and someone (probably Rowan Delk, leaning against the gate with his arms crossed) has decided that you are unlikely to die in the first five minutes. This is a low bar. You have cleared it. The Pocketrealm awaits, and it is considerably less patient than the tutorial."*

Unlock text: Tutorial complete. You know which end of the sword to hold, where the ore goes, and why you should not pet the rats. Everything else, you will learn by doing.

### Golden Hands (legendary crit craft, secret, tier 5, title: Golden Hands)

*"The hammer fell. The metal sang. And something happened that should not have happened: the material transcended itself, the craft transcended the crafter, and what came out of the forge (or the bench, or the loom) was not merely excellent. It was legendary, born from a critical success so improbable that Kessa Ironweld would stop mid-sentence to stare at it. Vesper Tain would set down her flask. Aldric Voss would open a new page in the ledger, specifically. This is the rarest achievement in the Pocketrealm: not earned through grinding, not reached through patience, but produced by a single, unrepeatable moment where everything aligned and the universe held its breath."*

Unlock text: Golden Hands. A legendary item, forged through a critical success. Lightning does not strike twice, but it only needed to strike once.

## Integration Notes

- **Same display pattern as all previous achievement entries:** Short unlock text as toast/popup; italic passage in achievement detail view.
- **Secret achievement handling:** Humbling Experience and Golden Hands have `secret: true`. Their titles, descriptions, and flavor text should be hidden until unlocked. Pre-unlock display: "??? - A secret achievement awaits..." or similar placeholder.
- **Three distinct emotional registers:**
  - Humbling Experience: compassionate defeat. The tone is encouraging, not punishing. Dying is normal, and the achievement reframes it as growth.
  - The Graduate: cheerful graduation. The tone is light, the bar is acknowledged as low, and the future is positioned as the real challenge.
  - Golden Hands: awe. The tone is reverent, matching the T5 weapon descriptions (I-09) and the Legendary Smith achievement (A-05). This is the lore's most wonder-struck moment.
- **Cross-references:**
  - The Graduate references Rowan Delk (N-06) at the gate, consistent with his location outside the palisade (N-06 integration notes).
  - Golden Hands references Kessa (N-02), Vesper (N-04), and Aldric (N-05), each reacting in character: Kessa stares, Vesper sets down her flask, Aldric opens a new ledger page. This is the third "NPC ensemble reaction" moment (after Legendary Smith in A-05 and Legend in A-06), reserved for the game's most significant achievements.
- **Tier 5 significance:** Golden Hands is the only tier 5 achievement in the game. The flavor reflects this by positioning it as unrepeatable and improbable, distinct from every other milestone which rewards accumulation or consistency.
- **Tone:** These three achievements bracket the player's experience: the first defeat (beginning of humility), the first step (beginning of competence), and the highest possible crafting moment (peak of possibility). Together they form a narrative of falling, standing, and transcending.
