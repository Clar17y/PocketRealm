# Item Descriptions: Boss Trophies + Boss Gear

## Content

### Trophy Materials

**Alpha Wolf Fang**
A canine the length of your forearm, yellowed with age and scored by a hundred dominance fights. It radiates a low, ambient warmth, as if the Alpha's fury persists in the bone long after the beast itself has fallen. Kessa handles these with uncharacteristic care.

**Spirit Essence**
A small, luminous sphere that hovers slightly above any surface it is placed on. It is warm, faintly golden, and hums at a frequency that makes your teeth ache. Vesper Tain keeps hers in a sealed jar and has been observed talking to it. She denies this. The jar glows.

### Boss Equipment

**Wolfsbane Blade**
Forged from Alpha Wolf Fang and dark steel, this blade carries the memory of the hunt in its edge. The crit chance is not mechanical; it is instinctual, the weapon finding openings the way a wolf finds a throat. It cannot be sold because nobody who earns one would part with it.

**Alpha Pelt Chest**
Armour stitched from the Alpha Wolf's pelt by hands that understood what they were working with. The fur is impossibly dense, the leather beneath it supple and warm, and the whole piece moves with you as if the pelt remembers what running felt like. Dodge, health, and armour in one package, and the faint smell of deep forest that never quite fades.

**Spirit Staff**
A shaft of elderwood crowned with a sliver of Spirit Essence that has been coaxed (Vesper's word; "negotiated" might be more accurate) into resonance with the staff's grain. The magical throughput is precise, controlled, and carries a crit chance that feels less like luck and more like the grove deciding to help. Vesper described it as "alive." She was not being poetic.

**Ethereal Robes**
Woven from material that Vesper cannot identify and refuses to speculate about publicly. The fabric is translucent in certain light, opaque in others, and weighs almost nothing regardless. It provides magic defence, health, and dodge through means that operate outside conventional armour theory. Wearing it feels like being wrapped in a warm thought. That is not a metaphor. That is the most accurate description anyone has managed.

## Integration Notes

- Add as `flavorText` on the `ItemTemplate` model, same pattern as all item entries.
- **Soulbound items:** All boss gear has `sellPrice: 0`, reflected in the Wolfsbane Blade description ("cannot be sold because nobody who earns one would part with it"). This narrative justification applies to all boss drops.
- **Trophy-to-gear connection:** Alpha Wolf Fang is the material for Wolfsbane Blade and Alpha Pelt Chest. Spirit Essence is the material for Spirit Staff and Ethereal Robes. The trophy descriptions establish the material's properties; the gear descriptions show what those properties become when crafted.
- **Cross-references:**
  - Alpha Wolf Fang references Kessa Ironweld (N-02) handling them with care, consistent with her professional respect for quality materials (I-09: three attempts at mithril).
  - Spirit Essence references Vesper Tain (N-04) talking to it in a jar, extending her pattern of treating specimens as conversation partners.
  - Spirit Staff extends the "alive" description from M-09 (Ancient Spirit bestiary) and I-09 (T5 Lich Staff parallel). Vesper's "negotiated" adds a new verb to her relationship with alchemical materials.
  - Ethereal Robes: Vesper "cannot identify" the material, which is significant because she can identify almost everything. This positions the Ancient Spirit's essence as genuinely beyond current understanding.
  - Alpha Pelt Chest references the Deep Forest smell, connecting back to Z-03.
- **Tone:** Boss gear descriptions are reverential without being overwrought. These are the rewards for the game's hardest fights, and the writing treats them as earned rather than granted. Each piece carries an echo of its source: the wolf's instinct, the grove's warmth.
