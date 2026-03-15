# Item Descriptions: Stamina/Mana Potions

## Content

**Minor Stamina Potion**
A gritty, yellow-green draught that tastes of Forest Sage and determination. Restores enough stamina to keep moving when your body has decided, reasonably, that it would prefer to stop.

**Stamina Potion**
A thicker, more concentrated formula brewed from Moonpetal extract and a stabiliser that Vesper says is proprietary (which means she is not proud of what it is). Sixty points of recovery, which is the difference between one more fight and the walk of shame back to town.

**Greater Stamina Potion**
Vesper's full-strength stamina restoration: Starbloom essence in a base so potent that the liquid vibrates faintly in the bottle. One hundred points, enough to keep an adventurer going long past the point where wisdom would have them stop. Vesper considers this a personal failing of the customer, not the product.

**Minor Mana Potion**
A thin, luminous blue liquid that restores a modest amount of magical energy and tastes like cold water from a stream that has never seen sunlight. Vesper brews it in batches and considers it entry-level work, which from her is not a compliment.

**Mana Potion**
Shimmer Fern extract distilled into a deeper blue that glows faintly in dim light. Forty-five points of mana restoration, enough for several spells and too little for carelessness.

**Greater Mana Potion**
Brewed from concentrated Shimmer Fern and reagents that Vesper sources from adventurers who went to the Crystal Caverns personally (she did not; she has standards about personal safety that she does not extend to her suppliers). Eighty points of mana, delivered with a clarity that makes the world sharpen at the edges for a moment before settling back to normal.

## Integration Notes

- Add as `flavorText` on the `ItemTemplate` model, keyed by the `IDS.pots.*` item IDs.
- **Companion to I-06:** The health potions entry (I-06) covered healing, cleansing, resist, the T4 mana potion, and the Elixir of Power. This entry covers the stamina and mana potion lines that were added later, completing the full consumable set.
- **Ingredient tier progression mirrors health potions:** Minor Stamina uses Forest Sage (T1 foraging), Stamina uses Moonpetal (T2), Greater Stamina uses Starbloom (T3). This is the same ingredient ladder as Minor Health through Greater Health (I-06), grounding stamina potions in the same material economy.
- **Mana potions use Shimmer Fern:** All three mana entries reference Shimmer Fern (Crystal Caverns T4 foraging resource, Z-10), consistent with the Mana Potion description in I-06 and the Shimmer Fern Grotto environmental flavor.
- **Cross-references:**
  - Vesper Tain (N-04) anchors every entry, consistent with I-06 and her role as the Pocketrealm's sole potion brewer. Her reactions escalate: proprietary embarrassment (Stamina Potion), professional judgment of customer decisions (Greater Stamina), dismissal of entry-level work (Minor Mana), and outsourcing danger to suppliers (Greater Mana Potion).
  - The Greater Mana Potion's "world sharpens at the edges" effect connects to the Crystal Caverns' ambient arcane resonance (Z-10), suggesting the Shimmer Fern retains some of the caverns' sensory properties even after distillation.
- **Items not covered:** The Focused Mana Potion (T3) and Supreme Mana Potion (T5) are not listed in the tracker. They can receive flavor text in a future pass following the same tier-escalation pattern.
- **Stamina vs. Mana tone distinction:** Stamina potions are physical, practical, and slightly undignified (gritty taste, proprietary stabiliser, vibrating liquid). Mana potions are luminous, cold, and faintly transcendent (cold streams, sharpening edges). The distinction mirrors the stat families they serve: stamina is about endurance, mana is about clarity.
- **Items complete:** This is the 20th and final item entry. All 20 item categories now have flavor text.
