# Achievement Flavor: PvP Milestones

## Content

### Gladiator (1 PvP win)

*"Monsters fight because they must. You fought another adventurer because you chose to. That is a different kind of violence entirely, and the fact that you won says something about you. Whether it says something good is a question for quieter moments."*

Unlock text: Your first victory over a fellow adventurer. The arena remembers, even if they would rather not.

### Pit Fighter (25 PvP wins, title: Pit Fighter)

*"Twenty-five opponents faced, twenty-five lessons delivered. You have learned to read a fighter's intentions in the way they shift their weight, the half-second pause before a spell, the telltale grip change that says 'I am about to do something desperate.' You read all of it. And then you hit them anyway."*

Unlock text: You do not fight in the arena to prove a point. You fight because you are good at it, and being good at things is its own reward.

### Arena Champion (100 PvP wins, title: Champion, +2 attribute points)

*"One hundred victories. The arena has become a second home, which says something unfortunate about your social life but something extraordinary about your combat instincts. Opponents study your patterns. They prepare strategies. They discuss your tendencies over drinks at The Crooked Antler. And then they lose to you anyway, because knowing what you do and stopping you from doing it are entirely separate problems."*

Unlock text: Champion. Not because someone gave you a crown, but because a hundred people tried to take it and failed.

### On A Roll (5 PvP win streak)

*"Five in a row. Luck gets you two, maybe three. After that, it is just you: reading faster, hitting cleaner, making fewer of the mistakes that separate a fighter from a spectacle."*

Unlock text: Five consecutive victories. You are not just winning; you are making it look deliberate.

### Unstoppable (10 PvP win streak, secret, title: The Unstoppable)

*"Ten. Consecutive. Victories. The arena crowd has gone from cheering to something closer to awe, the kind of respectful silence usually reserved for natural disasters and very large predators. Nobody has a plan for you anymore. They have hopes, and wishes, and the vague optimism of someone who buys a lottery ticket. But plans? Those stopped working five fights ago."*

Unlock text: Ten in a row. They stopped trying to beat you and started trying to survive. There is a difference, and you taught it to them.

## Integration Notes

- **Same display pattern as A-01 and A-02:** Short unlock text as toast/popup; italic expanded passage in the achievement detail view.
- **Tone distinction:** PvE achievements (A-01) escalate through absurdity. Boss achievements (A-02) stay grounded and personal. PvP achievements split the difference: personal and specific, but with an edge of competitive swagger that fits player-vs-player context.
- **Secret achievement (Unstoppable):** The `secret: true` flag means this achievement's title and description are hidden until unlocked. The flavor text should only appear post-unlock. The detail view could show "???" or "A secret achievement awaits..." before unlock.
- **Cross-references:** Arena Champion mentions The Crooked Antler (Z-01, N-03), placing PvP culture within Millbrook's social fabric. Opponents discussing strategies at the tavern ties the arena to the community.
- **Win streak vs. total wins:** On A Roll and Unstoppable have a different narrative feel (momentum, flow state) compared to the accumulation milestones (Gladiator, Pit Fighter, Champion). The writing reflects this: streak achievements focus on the present moment and continuous performance.
- **PvP constants context:** The game has a rating system (starting at 1000 Elo), bracket matching, and cooldowns. The flavor text avoids mechanical specifics but hints at the competitive ecosystem.
