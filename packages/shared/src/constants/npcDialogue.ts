export type DialogueEvent =
  | 'greeting'
  | 'idle'
  | 'buy'
  | 'sell'
  | 'farewell';

export interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>;
}

export const NPC_DIALOGUE: Record<string, NpcDialogue> = {
  'millbrook-general-store': {
    name: 'Bram Holloway',
    location: 'Left side of Main Street, Millbrook',
    personality: 'Practical, unhurried, faintly amused by everything.',
    lines: {
      greeting: [
        'Welcome, welcome. Everything\'s priced fair and stacked where you can see it. I don\'t haggle, I don\'t barter, and I don\'t accept \'interesting stories\' as currency. We tried that once. The economy did not recover.',
        'Ah, another fresh face. Or a familiar one, hard to tell with all the mud. Come in, have a look. Try not to bleed on the merchandise.',
        'Morning. Or evening. Honestly, I stopped keeping track. What do you need?',
      ],
      idle: [
        'Take your time. I\'m not going anywhere. Tried once, got as far as the gate, turned right back around. Terrible commute.',
        'If you\'re looking for something specific, just ask. If you\'re looking for something that doesn\'t exist, also ask. I\'ll tell you no, but at least we\'ll both know.',
        'That? Oh, that\'s been on the shelf since before the last Rat King incident. Still perfectly good. Probably.',
      ],
      buy: [
        'Solid choice. Or at least a choice. You\'ll find out which one soon enough.',
        'Pleasure doing business. Come back alive and we\'ll do it again.',
        'Sold. And if it breaks, you didn\'t buy it here. That\'s our return policy.',
      ],
      sell: [
        'Let me see... yes, I can take that off your hands. Won\'t ask where you got it. Learned that lesson years ago.',
        'Rat pelts again? I swear, half this town\'s economy runs on dead vermin. Fine, I\'ll add it to the pile.',
        'Not bad, not bad. I\'ll give you a fair price, which means you\'ll think it\'s too low and I\'ll think it\'s too high. That\'s how you know it\'s fair.',
      ],
      farewell: [
        'Safe travels. And if the Forest Edge gives you trouble, remember: the store opens at dawn. Assuming I\'m awake.',
        'Off you go, then. Try not to die out there. It\'s terrible for repeat business.',
      ],
    },
  },

  'millbrook-blacksmith': {
    name: 'Kessa Ironweld',
    location: 'The Forge, Crafting Quarter (behind The Crooked Antler); weapons rack on the right side of Main Street',
    personality: 'Direct, proud, and perpetually overheated.',
    lines: {
      greeting: [
        'You want something sharp, something sturdy, or something you can wave around to feel brave? I can do all three. Prices are on the rack. Don\'t touch anything until you\'ve decided.',
        'Back again? Good. Means the last thing I sold you worked. Or it didn\'t and you\'re a ghost. Either way, let\'s see your coin.',
        'Make it quick. I\'ve got ingots on the anvil and they don\'t care about your schedule.',
      ],
      idle: [
        'That copper dagger? Fine work, if I say so. And I do say so, because I made it. Holds an edge for about a week, which is longer than most adventurers last.',
        'If you\'re eyeing the wooden swords, those are from the carpenter, not me. I just sell them because he can\'t be bothered. And yes, before you ask, they\'re terrible. But they\'re cheap and they\'re here.',
        'See those burn marks on the wall? That\'s what happens when an apprentice tries to quench dark iron in cold water instead of oil. The apprentice is fine. The wall is not.',
      ],
      buy: [
        'Good steel finds good hands. Or at least it finds hands. Yours will do.',
        'Sold. If you bring it back bent, I\'ll straighten it. If you bring it back broken, I\'ll ask questions you won\'t like.',
        'There you go. Swing it before you trust it. Every blade has a personality, and some of them are disagreeable.',
      ],
      sell: [
        'Hmm. Decent material under all that damage. I\'ll melt it down and make something better. That\'s the circle of iron.',
        'You want me to buy this? I forged this. I know exactly what it\'s worth, which is why my price is fair and your disappointment is your own problem.',
        'Salvage? Absolutely. I\'ll strip it to components. Less sentimental than selling, more useful than hoarding. Smart choice.',
      ],
      farewell: [
        'Go on, then. Hit something with it. That\'s what it\'s for.',
        'Stay sharp out there. And I mean that literally. Bring a whetstone.',
      ],
    },
  },

  'millbrook-tavern': {
    name: 'Maren Ashwick',
    location: 'The Crooked Antler, Millbrook',
    personality: 'Warm, sharp-eyed, and dangerously good at listening.',
    lines: {
      greeting: [
        'Well, look what the Forest Edge dragged in. Sit down, you look like you\'ve been arguing with something that bites. What\'ll it be?',
        'Welcome back to the Antler. Same as last time? Don\'t worry, I remember. I remember everyone\'s. It\'s a gift. Or a curse. Depends on the customer.',
        'You\'re alive! That\'s worth celebrating. Or at least worth a drink, which is the same thing in here.',
      ],
      idle: [
        'See that antler above the door? Nobody knows what it came from. Too big for a deer, too small for whatever lives past the Whispering Plains. My grandmother hung it there and told everyone to stop asking. We stopped asking.',
        'Kessa was in here last night, complaining about an apprentice who tried to forge tin without preheating the mould. Said the ingot came out looking like a very expensive potato. She was furious. It was wonderful.',
        'Bram sent over a cask of something he called \'spiced cider.\' I\'m still not sure what spice. Neither is he. But it sells, and nobody\'s died yet, so we\'ve agreed not to investigate.',
        'Adventurers always come back with the same look. Not scared, exactly. More like they\'ve realized the forest is bigger than they thought. That\'s the look. You\'ve got it right now.',
      ],
      buy: [
        'Put your feet up. The stew\'s on, the fire\'s going, and nothing out there is getting in here tonight. I checked.',
        'Rest as long as you need. The Antler\'s been standing since before the first wolf pack, and it\'ll be standing after the last one. You\'re safe in here.',
      ],
      farewell: [
        'Off again? Stay sharp, stay fed, and come back with a story worth hearing. That\'s my only rule.',
        'Door\'s always open. Well, not literally. Literally it\'s closed at night. But metaphorically, always open.',
      ],
    },
  },

  'millbrook-herbalist': {
    name: 'Vesper Tain',
    location: 'The Alchemist\'s Bench, Crafting Quarter (the one that makes sounds)',
    personality: 'Intensely focused, clinically curious, and cheerfully indifferent to social convention.',
    lines: {
      greeting: [
        'Ah, a customer. Excellent. Don\'t touch the blue flask. Or the green one. Actually, don\'t touch anything on the left side of the bench. The right side is mostly safe. Mostly. What do you need?',
        'You look like someone who is about to do something unwise and would like to survive it. I can help with that. Probably. Depending on what it is.',
        'Welcome. I was just rendering rat tails into a base compound. You would not believe what they do for joint inflammation. Or perhaps you would prefer not to know. Either way, what can I brew you?',
      ],
      idle: [
        'That Minor Health Potion? Forest Sage extract, distilled twice, stabilized with a binding agent I will not name because you will stop buying them. It works. That is what matters.',
        'I have been trying to develop a reliable antivenom for spider bites for three years now. The current formula works on everything except Venomous Spiders, which is like building an umbrella that works in every weather except rain.',
        'People ask why the bench makes noises. The bench does not make noises. The compounds make noises. The bench is an innocent participant. As am I, technically.',
        'Kessa next door says my fumes are ruining the temper of her steel. I have explained, repeatedly, that correlation is not causation. She has explained, also repeatedly, that she does not care.',
      ],
      buy: [
        'Good. Drink it before you need it, not during. Potions work faster on a calm stomach. This is advice most adventurers receive once and ignore permanently.',
        'Sold. And please, for the sake of my professional reputation, do not mix it with anything. Especially not with ale. I cannot stress this enough.',
        'There you are. If you experience any unusual side effects, please come back and describe them in detail. For science. And also so I can adjust the formula.',
      ],
      sell: [
        'Cave Moss? Lovely. The spore structure on these is remarkable. I can use this in at least four different preparations, three of which are legal.',
        'Forest Sage, good condition. The peppery smell means it was harvested before noon, which is when the essential oils are strongest. You have good instincts, or good luck. I will accept either.',
        'Moonpetal. Beautiful. Do you know these only bloom under indirect starlight? The active compound breaks down in direct sun. Nature\'s way of making my job harder.',
      ],
      farewell: [
        'Stay alive out there. You are one of the few customers who pays on time, and I would hate to lose that.',
        'Off you go. And remember: if it hurts, drink the red one. If it burns, drink the blue one. If it glows, run.',
      ],
    },
  },

  'millbrook-quest-board': {
    name: 'Aldric Voss',
    location: 'The Town Square, beside the cork notice board near the well',
    personality: 'Methodical, perpetually exasperated, and quietly proud of a job nobody thanks him for.',
    lines: {
      greeting: [
        'Ah, there you are. The board has been updated since this morning. Three new dailies, one weekly, and something that Bram insists is \'urgent\' but which I suspect is just another rat problem. Have a look.',
        'Quests. Bounties. Tasks. Whatever you want to call them, I have them, they need doing, and you need tokens. Let us proceed with mutual benefit and minimal small talk.',
        'Good, a capable one. I can tell by the fact that you are standing upright and not bleeding. The board is to your left. Pick what suits you. I will handle the paperwork.',
      ],
      idle: [
        'Every quest on that board has been verified, categorized, and assigned a fair token reward. The system works. Slowly, and with complaints from all parties, but it works.',
        'The singing lessons advertisement? Not mine. Someone keeps pinning it back up every time I remove it. I have my suspicions, but Maren denies everything, and she does it with a straight face, which I find deeply suspicious.',
        'Weekly bounties pay better, but they require commitment. Daily tasks are smaller, faster, and less likely to get you killed. Choose according to your confidence and your schedule.',
        'I had an adventurer last week claim they killed sixty monsters in a single day. Sixty. I asked for evidence. They showed me a sack of rat tails. I counted thirty-two. We had a conversation about arithmetic.',
      ],
      buy: [
        'Noted. Tracked. The board knows what you owe, and so do I. Come back when it is done, and not before.',
        'Accepted. I have logged the parameters. Do not ask me to adjust them mid-task. The ledger does not appreciate corrections.',
      ],
      sell: [
        'Verified. Tokens awarded. Your contribution to Millbrook\'s ongoing survival has been recorded and will be forgotten by tomorrow. Such is the nature of public service.',
        'Done? Good. Cleanly done? Even better. Your tokens are here. Spend them wisely at the quest shop. Or unwisely. That is between you and your conscience.',
        'Another task completed. I will update the ledger. You know, some days I think I do more writing than the adventurers do fighting. The difference is that my work does not involve teeth.',
      ],
      farewell: [
        'The board updates at dawn. Try to be alive for it.',
        'Off you go. And please, if you discover anything noteworthy, report it properly. \'There was a big thing and it was angry\' is not a useful description, no matter how many times people try.',
      ],
    },
  },

  'millbrook-gathering-guide': {
    name: 'Rowan Delk',
    location: 'Just outside Millbrook\'s gate, leaning against the palisade',
    personality: 'Weathered, terse, and quietly competent.',
    lines: {
      greeting: [
        'You want to learn how to gather? Good. Step one: stop swinging at things for five minutes and look at the ground. It has been trying to tell you something since you left the gate.',
        'Mining, woodcutting, foraging. Three skills, one principle: the land gives you what it has if you know how to ask. If you do not know how to ask, it gives you blisters and a long walk home.',
        'Back again. Good. Most people try gathering once, decide it is boring, and go back to hitting rats. The ones who stick with it are the ones who eat regularly. Coincidence? No.',
      ],
      idle: [
        'I have worked every node between here and the Deep Mines. Twenty years of gathering. Still have all my fingers. That is not luck. That is technique.',
        'Bram thinks gathering is just the supply side of his business. Kessa thinks it is just the part before the forge. They are both wrong. Gathering is the part where you listen, and the Pocketrealm decides what to give you.',
        'You cannot force the land to give up what it is not ready to part with. Work steady. Pay attention. The rest is between you and the node.',
      ],
      farewell: [
        'Now go out there and practice. The nodes will not gather themselves. Well. The mushrooms might. But the ore definitely will not.',
        'Keep your tools sharp and your eyes open. The land remembers who treats it well.',
      ],
    },
  },

  'millbrook-casino': {
    name: 'Silas Vane',
    location: 'The casino (accessible after reaching Thornwall)',
    personality: 'Smooth, theatrical, and entirely too comfortable with other people\'s money.',
    lines: {
      greeting: [
        'Welcome to the table. The rules are simple: place your bets, watch the wheel, and try to remember that gold is just a number. A very entertaining number.',
        'Ah, a familiar face. Or a new one. Honestly, after enough rounds, everyone starts to look the same. Hopeful. Sit down. Let us see what the wheel thinks of you today.',
        'The table is open, the wheel is spinning, and your gold is yours to do with as you please. For now.',
      ],
      idle: [
        'Bets are open. Fifty seconds to decide how brave you are feeling. The wheel does not judge. I, however, am taking notes.',
        'Last call. If you are going to bet, bet. If you are going to think about it, you have already lost. Indecision is the only outcome the wheel cannot produce.',
        'And the wheel decides. Remember: the wheel has no memory, no loyalty, and no sense of dramatic timing. Except when it does, which is always.',
      ],
      buy: [
        'Well played. Or well guessed. The difference is irrelevant when the gold is real. Congratulations.',
        'A winner. The wheel smiles upon you today. Enjoy it. The wheel\'s smile is famously unreliable.',
        'Impressive. You have beaten the odds, which is the only thing in this establishment worth beating. Your gold, as promised.',
      ],
      sell: [
        'The wheel giveth, the wheel taketh. Today it taketh. My condolences, which are genuine and also free, unlike everything else here.',
        'Not your round. The beautiful thing about roulette is that there is always another round. The terrible thing about roulette is also that there is always another round.',
        'Gone. But think of it this way: you have contributed to the local economy, supported employment (mine), and gained a valuable lesson about probability. That is almost the same as winning.',
      ],
      farewell: [
        'Leaving? A wise choice. Knowing when to stop is the most valuable skill in this room. Second most valuable is knowing when to come back.',
        'Until next time. And there is always a next time. That is not a threat. It is a statistical certainty.',
      ],
    },
  },

  'millbrook-guild-recruiter': {
    name: 'Gavrik Stoneshoulder',
    location: 'The Guild Hall, Thornwall (near the Forge District)',
    personality: 'Bluff, pragmatic, and built like a wall that someone taught to speak.',
    lines: {
      greeting: [
        'Guild business? Good. The Pocketrealm does not care about solo acts. It cares about whether enough people can stand in the same place long enough to hold it. That is what a guild is. Everything else is paperwork.',
        'Welcome to the hall. If you are here to found a guild, I need fifty thousand turns and proof you know what you are doing. Level twenty, minimum. If you are here to join one, level ten and a willingness to show up. That is all I ask.',
        'Contracts are posted. Three this week, same as every week. Your guild picks them up, your guild completes them, your guild gets paid. Simple system. Works because people are less lazy in groups.',
      ],
      idle: [
        'See that board? Mob Slayer, Resource Gatherer, Pathfinder, the usual. The targets look large because they are meant for a guild, not a person. That is the point. Fifteen thousand kills sounds impossible until twenty people share the work.',
        'Specialisations unlock at guild level ten. Combat, crafting, gathering, or exploration. Pick one, commit to it. Respeccing costs two million from the treasury, which is my way of saying: pick carefully.',
        'The treasury is not a savings account. It is a war chest. Fund your projects, fuel your boosts, and for the love of all things sharp, do not let the officers spend it on decorations. I have seen it happen. Twice.',
        'I lost this hand to a Death Knight in the Haunted Marsh. Three of us went in. Two came out. The third one\'s name is on the memorial wall behind you. Guilds exist because nobody should face that alone.',
      ],
      buy: [
        'Noted. The contract runs until the week ends or your guild finishes it, whichever comes first. Do not come back early to complain about the targets. I set them. I know what they are.',
        'Accepted. Your guild\'s contribution is tracked collectively. Every kill, every gather, every craft counts. The board does not care who does the most. The treasury does not care either. I, personally, do care, but that is between me and the ledger.',
      ],
      sell: [
        'Done. Guild XP awarded. Treasury funded. Your guild just proved it can work together, which is more than most organisations manage. Well done.',
        'Contract fulfilled. I have updated the records. Aldric Voss in Millbrook would approve of my filing system, though he would never admit it. We use the same ink supplier.',
      ],
      farewell: [
        'Go. Build something that lasts. The Pocketrealm tears down everything eventually, but a good guild makes it work harder.',
        'The hall is always open. Guilds do not keep business hours, and neither do I.',
      ],
    },
  },

  'thornwall-merchant': {
    name: 'Lira Caravel',
    location: 'The Supply Depot, near Thornwall\'s western gate',
    personality: 'Sharp, pragmatic, and priced accordingly.',
    lines: {
      greeting: [
        'Supply Depot\'s open. Everything on the shelves made it here from somewhere worse than where you are standing. The prices reflect the journey. If that bothers you, Millbrook is back through the plains.',
        'Welcome. If you need dark iron, mithril, crystal wood, or anything else that requires a death wish to source, you are in the right place. If you need rat pelts, you have overshot.',
        'New stock came in yesterday. Lost a wheel and two guards on the trip, but the inventory survived, which is what matters. To me. The guards had families, which is what matters to them. Commerce is complicated.',
      ],
      idle: [
        'That dark iron? Hauled from the Iron Mires by a team that spent three days waist-deep in marsh water while things tried to eat them. The price includes their hazard pay. And mine. And the wheel I replaced. Twice.',
        'Bram Holloway back in Millbrook sells copper ore for pocket change and calls it commerce. I sell mithril ingots to people who know what they are worth. We are in the same industry the way a rowboat and a warship are in the same water.',
        'If you are looking for something I do not carry, it either does not exist or it has not been discovered yet. In either case, check back next week. Discoveries happen faster than you would think out here.',
        'The Forge District buys half my stock before adventurers see it. If you want first pick, arrive at dawn. I open early because supply chains do not respect sleep schedules.',
      ],
      buy: [
        'Sold. You will not find better materials this side of the Sunken Ruins, and anything from the Sunken Ruins has a surcharge for \'retrieved from a place where the water tries to kill you.\'',
        'Good choice. Handle it well. Every item in this depot crossed the Whispering Plains to reach you, and the plains do not give refunds.',
      ],
      sell: [
        'Let me see. Hmm. Quality is decent. Source zone? Never mind, I can tell by the residue. Haunted Marsh. I can smell the bog from here. Fair price for fair goods.',
        'Crystal Caverns material? Excellent. This will move fast. The artificers in the Forge District have a standing order for anything that glows.',
        'I will take it. And yes, my buy price is lower than my sell price. That is not greed. That is the wheel replacement fund.',
      ],
      farewell: [
        'Good luck out there. And if you find anything interesting on your travels, bring it here first. I pay better than Bram, and I ask fewer questions.',
        'Safe travels. The supply line runs both ways. You bring the materials, I bring them to market, and Thornwall keeps standing. That is the arrangement.',
      ],
    },
  },

  'wandering-merchant': {
    name: 'Vex',
    location: 'Encountered randomly while exploring any wild zone',
    personality: 'Cheerful, enigmatic, and operating under a business model that defies conventional supply chain analysis.',
    lines: {
      greeting: [
        'Oh, hello. You look like someone who needs something and did not know it until just now. Lucky you. Lucky me. Let us browse.',
        'Fancy meeting you here. Or anywhere, really. The wilderness is large and meetings are statistically unlikely, which makes this one either fortune or fate. I sell to both.',
        'Welcome to my shop. It is wherever I am standing. The overhead is low, the selection is surprising, and the return policy is that we never meet again. Shall we?',
      ],
      idle: [
        'Where do I get my inventory? From places. Specifically, from places that other merchants will not go, for reasons that other merchants find compelling. I find them negotiable.',
        'That item? Found it in the Haunted Marsh, wedged between two bones that were not originally neighbours. Cleaned it up nicely. Barely cursed at all.',
        'People ask how I survive out here alone. The answer is: I am very fast, very quiet, and very good at knowing when to stop being in a place. Also, most things find merchants confusing. Violence they understand. Commerce baffles them.',
        'Lira at the Thornwall depot thinks I undercut her prices. I do not undercut her prices. I simply do not have a wheel replacement fund, a warehouse lease, or guards to pay. My overhead is a pair of boots and a willingness to be uncomfortable.',
      ],
      buy: [
        'Pleasure doing business. If anyone asks where you got that, feel free to say \'a merchant in the woods.\' They will assume you are joking. Let them.',
        'Sold. And before you ask: no receipt, no warranty, and no fixed address for complaints. What I can promise is that it works. I do not sell things that do not work. Bad for the reputation, and out here, reputation is everything.',
      ],
      farewell: [
        'Off you go. And off I go. We shall meet again, or we shall not. The Pocketrealm is generous with coincidences.',
        'Until next time. Assuming there is a next time. For both of us. The wilderness is impartial about these things.',
      ],
    },
  },

  'mysterious-stranger': {
    name: 'The Stranger',
    location: 'Appears rarely in unexpected places',
    personality: 'Calm, knowing, and faintly amused by the fact that you exist.',
    lines: {
      idle: [
        'You have been to the Sunken Ruins. I can tell by the salt on your boots and the way you keep looking over your shoulder. Tell me: did you read the carvings in the Throne Hall? No? Perhaps that is for the best. The people who built that place wrote their history on the walls because they knew nobody would be left to remember it any other way.',
        'Bram Holloway keeps a locked drawer in the back of his shop. You may have noticed. The work log inside belongs to his grandfather, who founded the mining company and sealed the lower shafts himself. The Tunnel Wyrm was not the reason. The Tunnel Wyrm was the excuse. What they found in Shaft 7 was older.',
        'The Fae Queen has ruled the Canopy Court for centuries, and in all that time she has asked the Ancient Spirit for only one thing. Permission. For what, I will not say. But the Spirit refused, and the fae have been throwing things at visitors ever since. Interpret that as you will.',
        'You have noticed that the Ancient Grove and the Sunken Ruins share a quality. The light. Not the colour or the brightness, but the way it behaves: as if it is watching. That is not coincidence. The grove grew above the ruins. The roots of the elderwoods reach the flooded halls. What the trees know, the spirits know. What the ruins remember, the grove remembers. They are the same place, separated by soil and time.',
        'Thornwall was not built where it stands because of the plains or the marsh or the caverns. It was built because someone, a very long time ago, wanted to make sure that nothing in the ruins could walk north without passing a wall first. The wall came before the town. Ask Gavrik. He knows. He will not tell you, but he knows.',
      ],
      farewell: [
        'That is enough for today. You will have questions. I suggest you look for the answers yourself. They are better earned than given.',
        'We will meet again. Or we will not. The Pocketrealm decides these things, and it has a sense of humour that I have never fully understood.',
      ],
    },
  },

  'town-guard': {
    name: 'Captain Fen Darrow',
    location: 'Millbrook\'s gate, leaning against the palisade',
    personality: 'Tired, observant, and doing the best job she can with the budget she has been given.',
    lines: {
      greeting: [
        'Heading out? Stay on the paths if you can. Off the paths if something is on them. And if you see a Rat King, do not try to negotiate. We tried that. It did not go well.',
        'Welcome back. Still breathing, still upright, still have all your limbs. That puts you in the top half of today\'s returnees. Congratulations.',
        'The gate\'s open until sundown. After that, knock three times and wait. If I do not answer, I am either on patrol or asleep. Both are equally likely.',
      ],
      idle: [
        'See that dent in the gate? Great Boar, two winters ago. Came right up the road like it owned the place. We reinforced the timbers after that. The boar has not come back. Coincidence? Possibly. I choose to believe in the timbers.',
        'I keep a list of known bandit operatives. Aldric Voss keeps a better one. We compare notes on Thursdays. His handwriting is neater. My information is more recent. We consider this a fair exchange.',
        'Rowan is out there somewhere, leaning against the other side of this wall. We do not talk much. He watches the forest. I watch the gate. Between us, we cover the important angles.',
        'Maren tells me everything she hears at the Antler, which is more intelligence than my entire budget provides. I buy her a drink once a month as compensation. Millbrook\'s defence strategy runs on cheap ale and goodwill. It is more effective than it has any right to be.',
      ],
      buy: [
        'The Forest Edge? Manageable. Keep your weapon drawn and your back to something solid. The things out there are small and stupid. Mostly. The mostly is what gets people.',
        'Deep Forest? Watch for bandits on the Old Road. They favour the narrow stretches. And if the trees start moving, that is not your imagination. That is your cue to leave.',
        'You are heading past the plains? To Thornwall? Good luck. I mean that. Gavrik runs a tight operation out there, but the things between here and there do not care about operations.',
      ],
      farewell: [
        'Stay sharp. Come back. In that order.',
        'The gate will be here when you return. So will I. That is the entirety of my job description, and I take it seriously.',
      ],
    },
  },
};

/** Valid NPC keys — derived from NPC_DIALOGUE for compile-time safety. */
export type NpcKey = keyof typeof NPC_DIALOGUE;

export function getNpcLine(npcKey: NpcKey, event: DialogueEvent): string | null {
  const npc = NPC_DIALOGUE[npcKey];
  if (!npc) return null;
  const lines = npc.lines[event];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

export function getNpcName(npcKey: NpcKey): string | null {
  return NPC_DIALOGUE[npcKey]?.name ?? null;
}
