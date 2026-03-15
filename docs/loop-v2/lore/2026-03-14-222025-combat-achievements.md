# Achievement Flavor: Combat Kill Milestones

## Content

### Monster Hunter (100 kills)

*"One hundred creatures have fallen to your hand. The Forest Edge knows your name now, or at least your smell. Either way, they've stopped underestimating you."*

Unlock text: A hundred down. The Pocketrealm has noticed you, and it is not impressed. Keep going.

### Warrior (500 kills, title: The Warrior)

*"Five hundred. What started as survival has become something closer to a profession. The blood washes out of most fabrics now, and you have stopped flinching at the sound of your own sword."*

Unlock text: You fight because you can, not because you must. The title is earned, not given.

### Slayer (1,000 kills, title: The Slayer, +1 attribute point)

*"A thousand lives ended by your hand. Tavern songs don't capture the reality of it: the repetition, the sore arms, the sheer volume of rat pelts. But here you are, still standing, still swinging."*

Unlock text: One thousand. The monsters have started telling stories about you. None of them end well.

### Annihilator (5,000 kills, title: The Annihilator, +2 attribute points)

*"Five thousand. Entire species have revised their migration patterns to avoid you. Scholars at Millbrook have begun tracking your impact on local ecosystems, and the early findings are, in their words, 'concerning.'"*

Unlock text: You are no longer part of the food chain. You are the reason it has gaps.

### Extinction Event (10,000 kills, title: Extinction Event, +3 attribute points)

*"Ten thousand. The number is difficult to hold in your mind, so don't try. Just know that somewhere, a very tired clerk is running out of space in the casualty ledger, and the Pocketrealm's bestiary has started listing you as a natural disaster."*

Unlock text: Congratulations. Future generations of monsters will use your name to frighten their young. Assuming there are future generations.

## Integration Notes

- **Unlock text:** Display as a toast notification or achievement popup when the threshold is reached. Keep it to 1-2 sentences for the popup; the longer italic passage is for the achievement detail/inspection view.
- **Achievement detail view:** The italic paragraph provides expanded flavor when the player opens the achievement panel and clicks/hovers on a completed achievement.
- **Title grants:** "The Warrior," "The Slayer," "The Annihilator," and "Extinction Event" are cosmetic titles. The flavor text here gives context for why the title fits.
- **Cross-references:** "Rat pelts" (Slayer) nods to the vermin bestiary and Bram Holloway's sell dialogue. "Scholars at Millbrook" (Annihilator) references the scholars mentioned in the Giant Rat bestiary entry. Maintains the running joke that Millbrook's scholars are perpetually alarmed.
- **Scaling tone:** Entries deliberately escalate from humble (Monster Hunter) to absurd (Extinction Event), matching the exponential kill thresholds. Early achievements feel personal; later ones feel mythological.
