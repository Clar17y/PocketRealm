# Item Descriptions: Quest Shop Scrolls

## Content

**Attribute Reset Scroll**
A wax-sealed parchment from Aldric Voss's quest shop, redeemable for a complete reallocation of attribute points. The seal bears the note "no refunds" in handwriting so small it constitutes a moral position.

**Talent Reset Scroll**
Unravels your skill point allocations and returns them unspent. Aldric issues it with the warning that you should think carefully before using it, and the certainty that you will not.

**Forge Luck Scroll**
Inscribed with a probability-altering enchantment that doubles your forge upgrade chance for three attempts. Kessa Ironweld calls luck scrolls a crutch, which is why she keeps one in her apron pocket for emergencies.

**Forge Protection Scroll**
The most expensive scroll in the quest shop: it wraps your next forge upgrade in a protective enchantment that prevents item destruction on failure. Kessa says anyone who needs one should not be forging at that tier. The scrolls sell out every week regardless.

**XP Boost Scroll**
A pale gold parchment that amplifies experience gains by ten percent for the next hundred XP-granting actions. Vesper suspects the enchantment is placebo. Aldric's data suggests otherwise.

**Teleport Scroll**
Folds the distance between your current location and any discovered zone into a single step. The scroll burns on arrival, leaves no ash, and the sensation of transit is like falling sideways through a door that was not there a moment ago.

**Hearthstone**
Not a scroll but a smooth, palm-sized stone carved with a homing rune that returns you instantly to your home town. The cheapest item in the quest shop and the most frequently purchased, because the Pocketrealm is large and your legs are finite.

## Integration Notes

- Add as `flavorText` on the `ShopItem` model (or as tooltip text in the quest shop UI), keyed by `shopItem.key`.
- **These are quest-point purchases, not crafted or dropped items.** The descriptions reflect transactional, utilitarian items rather than world-dropped materials. The tone is drier and more bureaucratic than combat loot, matching the quest shop's administrative context.
- **Cross-references:**
  - Aldric Voss (N-05) anchors the reset scrolls. "No refunds" on the Attribute Reset and the resigned certainty on the Talent Reset continue his characterisation as the Pocketrealm's put-upon bureaucrat. His data-tracking on the XP Boost connects to his ledger (established in N-05).
  - Kessa Ironweld (N-02) anchors the forge scrolls. Her calling Forge Luck a "crutch" while keeping one in her pocket is consistent with her blunt, practical personality. Her comment on Forge Protection ("should not be forging at that tier") is the craftsman's version of Aldric's exasperation.
  - Vesper Tain (N-04) appears in the XP Boost entry, skeptical as always about things she cannot chemically verify. The tension between her doubt and Aldric's data is a minor NPC dynamic that plays naturally.
  - Teleport Scroll's "falling sideways through a door" avoids repeating any existing magical-transit description and establishes teleportation as disorienting but instantaneous.
  - Hearthstone as the cheapest, most-purchased item grounds the quest shop economy in a simple, relatable need: you are far from home and you would like to not be.
- **Items not covered:** The tracker specifies the seven core scrolls. The remaining shop items (Efficiency Reset, Gathering Yield, Crafting Fortune, Combat Power, Iron Skin, Durability Shield, Bestiary Tome, Recipe Scroll, Guild Contract Reroll, and the two prestige titles) can receive flavor text in a future pass or be handled inline during UI implementation.
- **Display context:** Quest shop item tooltips, purchase confirmation dialogs, and the quest shop browse panel. The Hearthstone description also works as inventory tooltip text for the consumed item.
