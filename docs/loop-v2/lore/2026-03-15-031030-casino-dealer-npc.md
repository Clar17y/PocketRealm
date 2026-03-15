# NPC Dialogue: Casino Dealer

## Content

### Character Brief

**Name:** Silas Vane
**Location:** The casino (accessible after reaching Thornwall)
**Personality:** Smooth, theatrical, and entirely too comfortable with other people's money. Silas runs the roulette table with the polished ease of someone who has turned probability into a performance art. He speaks in a low, unhurried voice, always smiling, always watching, and never once letting on whether the house is winning or losing (the house is winning). He genuinely enjoys his work, which makes him either the most honest or the most dangerous person in the room, depending on your perspective.

---

### Greeting Lines (on casino open)

> "Welcome to the table. The rules are simple: place your bets, watch the wheel, and try to remember that gold is just a number. A very entertaining number."

> "Ah, a familiar face. Or a new one. Honestly, after enough rounds, everyone starts to look the same. Hopeful. Sit down. Let us see what the wheel thinks of you today."

> "The table is open, the wheel is spinning, and your gold is yours to do with as you please. For now."

### Roulette Lines (during betting / round events)

> "Bets are open. Fifty seconds to decide how brave you are feeling. The wheel does not judge. I, however, am taking notes."

> "Last call. If you are going to bet, bet. If you are going to think about it, you have already lost. Indecision is the only outcome the wheel cannot produce."

> "And the wheel decides. Remember: the wheel has no memory, no loyalty, and no sense of dramatic timing. Except when it does, which is always."

### Win Lines (on player win)

> "Well played. Or well guessed. The difference is irrelevant when the gold is real. Congratulations."

> "A winner. The wheel smiles upon you today. Enjoy it. The wheel's smile is famously unreliable."

> "Impressive. You have beaten the odds, which is the only thing in this establishment worth beating. Your gold, as promised."

### Loss Lines (on player loss)

> "The wheel giveth, the wheel taketh. Today it taketh. My condolences, which are genuine and also free, unlike everything else here."

> "Not your round. The beautiful thing about roulette is that there is always another round. The terrible thing about roulette is also that there is always another round."

> "Gone. But think of it this way: you have contributed to the local economy, supported employment (mine), and gained a valuable lesson about probability. That is almost the same as winning."

### Gold Exchange Lines (on turns-to-gold exchange)

> "Exchanging turns for gold. A fine decision. Turns come back; gold comes back less reliably. But gold buys things that turns cannot, and that is why you are here."

> "Turns in, gold out. The exchange rate is fair, which means neither of us is entirely happy, which means it is working as intended."

### Big Win Lines (on winning over 2000 gold)

> "Now that is a number worth remembering. The table salutes you. The house... acknowledges you. There is a difference, but tonight, it does not matter."

### Farewell Lines (on casino close)

> "Leaving? A wise choice. Knowing when to stop is the most valuable skill in this room. Second most valuable is knowing when to come back."

> "Until next time. And there is always a next time. That is not a threat. It is a statistical certainty."

## Integration Notes

- **Same dialogue system as N-01 through N-06:** Keyed by NPC ID and event type, random selection. New event types: "roulette_round" (during betting window), "win," "loss," "big_win," "gold_exchange."
- **Character name (Silas Vane):** Seventh named NPC. Distinct from the Millbrook NPCs by being located at the casino (likely Thornwall, the advanced town).
- **Personality niche:** Bram (commerce), Kessa (craft), Maren (community), Vesper (knowledge), Aldric (order), Rowan (the land), Silas (chance). He is the only NPC who profits directly from the player's decisions, which gives his warmth an edge that the others lack.
- **Mechanical integration:**
  - Roulette lines trigger during the 50-second betting window (`BETTING_WINDOW_SECONDS: 50`).
  - Big win line triggers when payout exceeds `BIG_WIN_THRESHOLD: 2001`.
  - Gold exchange lines trigger on turns-to-gold conversion (`GOLD_EXCHANGE_RATE: 1`).
- **Tone:** Silas is the only NPC who is explicitly performative. The others are sincere (even Kessa's bluntness is genuine). Silas is sincere about being a performance, which makes him charming and faintly unsettling. The humour is sharper here, rooted in the comedy of voluntarily giving money to someone who tells you they are taking it.
- **No cross-references to other NPCs:** Deliberate. Silas exists in a separate social orbit from the Millbrook NPCs. He does not mention them; they do not mention him. The casino is its own world.
