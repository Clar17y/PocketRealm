# NPC Dialogue: Guild Contract Board / Recruiter

## Content

### Character Brief

**Name:** Gavrik Stoneshoulder
**Location:** The Guild Hall, Thornwall (near the Forge District)
**Personality:** Bluff, pragmatic, and built like a wall that someone taught to speak. Gavrik is Thornwall's guild registrar and contract administrator: the man who charters new guilds, posts weekly contracts, and settles disputes between guildmates with a combination of bureaucratic procedure and physical presence. He was a frontline fighter before an encounter in the Haunted Marsh took his left hand below the wrist. He replaced it with a metal prosthetic that Kessa Ironweld forged to his specifications, and he uses it to stamp documents with a force that has cracked three desks. He believes in guilds the way Rowan Delk believes in the land: as the thing that keeps everything else from falling apart.

---

### Greeting Lines (on guild panel open)

> "Guild business? Good. The Pocketrealm does not care about solo acts. It cares about whether enough people can stand in the same place long enough to hold it. That is what a guild is. Everything else is paperwork."

> "Welcome to the hall. If you are here to found a guild, I need fifty thousand turns and proof you know what you are doing. Level twenty, minimum. If you are here to join one, level ten and a willingness to show up. That is all I ask."

> "Contracts are posted. Three this week, same as every week. Your guild picks them up, your guild completes them, your guild gets paid. Simple system. Works because people are less lazy in groups."

### Browse / Idle Lines (while guild panel is open)

> "See that board? Mob Slayer, Resource Gatherer, Pathfinder, the usual. The targets look large because they are meant for a guild, not a person. That is the point. Fifteen thousand kills sounds impossible until twenty people share the work."

> "Specialisations unlock at guild level ten. Combat, crafting, gathering, or exploration. Pick one, commit to it. Respeccing costs two million from the treasury, which is my way of saying: pick carefully."

> "The treasury is not a savings account. It is a war chest. Fund your projects, fuel your boosts, and for the love of all things sharp, do not let the officers spend it on decorations. I have seen it happen. Twice."

> "I lost this hand to a Death Knight in the Haunted Marsh. Three of us went in. Two came out. The third one's name is on the memorial wall behind you. Guilds exist because nobody should face that alone."

### Contract Accept Lines (on contract pickup)

> "Noted. The contract runs until the week ends or your guild finishes it, whichever comes first. Do not come back early to complain about the targets. I set them. I know what they are."

> "Accepted. Your guild's contribution is tracked collectively. Every kill, every gather, every craft counts. The board does not care who does the most. The treasury does not care either. I, personally, do care, but that is between me and the ledger."

### Contract Complete Lines (on contract turn-in)

> "Done. Guild XP awarded. Treasury funded. Your guild just proved it can work together, which is more than most organisations manage. Well done."

> "Contract fulfilled. I have updated the records. Aldric Voss in Millbrook would approve of my filing system, though he would never admit it. We use the same ink supplier."

### Farewell Lines (on guild panel close)

> "Go. Build something that lasts. The Pocketrealm tears down everything eventually, but a good guild makes it work harder."

> "The hall is always open. Guilds do not keep business hours, and neither do I."

## Integration Notes

- **Same dialogue system as all previous NPCs:** Keyed by NPC ID and event type, random selection. Event types: greeting, idle, contract_accept, contract_complete, farewell.
- **Character name (Gavrik Stoneshoulder):** Eighth named NPC. First NPC placed in Thornwall (alongside Silas Vane at the casino). He was referenced in the Thornwall zone overheard conversations (Z-08: "Gavrik had to break it up with a bellows").
- **Cross-references:**
  - Kessa Ironweld (N-02) forged his prosthetic hand, connecting the Millbrook and Thornwall NPC networks.
  - Aldric Voss (N-05) is referenced as a fellow administrator, establishing a professional kinship between the two registrars.
  - Rowan Delk (N-06) is referenced philosophically in the character brief.
  - The Haunted Marsh and Death Knight (M-16 upcoming) are referenced in his backstory, grounding his authority in personal experience.
  - The memorial wall is a new Thornwall detail that adds depth to the Guild Hall.
- **Mechanical references:** Guild creation cost (50k turns, level 20), join requirement (level 10), contract system (3/week), specialisation unlock (level 10, 2M respec cost), and treasury are all referenced naturally in dialogue.
- **Personality niche:** Among Thornwall NPCs, Gavrik is the community builder (paralleling Maren's role in Millbrook, but forged in combat rather than hospitality). Among all NPCs, he represents collective effort, the eighth pillar: solidarity.
- **The prosthetic hand:** A character detail that can be referenced in future NPC dialogue and quest content. It connects him to Kessa and grounds his authority in sacrifice.
