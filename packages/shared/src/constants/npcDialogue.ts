export type DialogueEvent =
  | 'greeting'
  | 'idle'
  | 'buy'
  | 'sell'
  | 'farewell';

export interface ContextLine {
  zoneKeyword: string;
  lines: string[];
}

export interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>;
  contextLines?: Partial<Record<DialogueEvent, ContextLine[]>>;
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
        'Door\'s open, shelves are stocked, and I\'m in a reasonable mood. Take advantage while it lasts.',
        'You look like someone who\'s about to spend money. That\'s my favourite kind of look. Come on in.',
        'Back so soon? Either I sell quality goods or you break things faster than expected. Let\'s say it\'s the first one.',
        'Another adventurer. Wonderful. The bell on the door still works, so that\'s something. Browse at your leisure.',
        'Inventory\'s fresh. Well, fresher than yesterday. Most of it survived the humidity. That counts as fresh in Millbrook.',
        'Welcome to Holloway\'s. Yes, I named it after myself. No, there\'s no other branch. One of me is plenty.',
        'Ah, you\'re back. I was just starting to enjoy the quiet. Come in, come in. What are you after this time?',
      ],
      idle: [
        'Take your time. I\'m not going anywhere. Tried once, got as far as the gate, turned right back around. Terrible commute.',
        'If you\'re looking for something specific, just ask. If you\'re looking for something that doesn\'t exist, also ask. I\'ll tell you no, but at least we\'ll both know.',
        'That? Oh, that\'s been on the shelf since before the last Rat King incident. Still perfectly good. Probably.',
        'I reorganized the back shelf last week. Took three hours. Found a potion nobody remembers ordering. It\'s still there. Nobody wants to be the one to open it.',
        'Maren keeps telling me I should decorate. Put up some banners, maybe a plant. I told her I sell supplies, not ambiance. She sent a fern anyway. It died. Point proven.',
        'See that sign? "No refunds on items used in combat." I added that after an adventurer returned a shield with teeth marks and asked for store credit. Human teeth, mind you. Long story.',
        'The floor creaks on the left side. That\'s not a defect, that\'s an alarm system. Cheapest security in Millbrook and it\'s never failed me.',
        'Every month I do inventory. Every month the numbers are slightly wrong. Either I can\'t count, or the rats are stealing from me. I suspect both.',
        'Rowan brought in some wild berries yesterday. Said they were \'edible, technically.\' I\'ve learned that \'technically\' is doing a lot of work in that sentence. They\'re on the top shelf if you\'re brave.',
        'Slow day. Not complaining. Slow days mean nobody\'s dying fast enough to need emergency supplies. That\'s the best kind of economics.',
      ],
      buy: [
        'Solid choice. Or at least a choice. You\'ll find out which one soon enough.',
        'Pleasure doing business. Come back alive and we\'ll do it again.',
        'Sold. And if it breaks, you didn\'t buy it here. That\'s our return policy.',
        'Good. Straightforward transaction, no drama. My favourite kind.',
        'There you go. Use it wisely. Or don\'t. I get paid either way.',
        'Another satisfied customer. Or at least a customer. Satisfaction is your responsibility.',
        'Pleasure. And if it saves your life out there, you\'re welcome. If it doesn\'t, well, no refunds.',
        'Done. If Kessa asks where you got the handle wrap, tell her it came from Thornwall. She doesn\'t need to know everything.',
        'Sold. I\'d say \'enjoy,\' but most of what I sell is designed to keep you from dying, and nobody enjoys that part.',
        'Receipt? I don\'t do receipts. My memory is the receipt. And my memory says you paid. We\'re good.',
      ],
      sell: [
        'Let me see... yes, I can take that off your hands. Won\'t ask where you got it. Learned that lesson years ago.',
        'Rat pelts again? I swear, half this town\'s economy runs on dead vermin. Fine, I\'ll add it to the pile.',
        'Not bad, not bad. I\'ll give you a fair price, which means you\'ll think it\'s too low and I\'ll think it\'s too high. That\'s how you know it\'s fair.',
        'Hmm. A bit battered, but I can move it. Someone out there has lower standards than you. That\'s my entire business model.',
        'I\'ll take it. Not because I need it, but because storage space is cheaper than an argument.',
        'Fair enough. That goes straight to the \'miscellaneous\' bin. The bin is large. Millbrook runs on miscellaneous.',
        'Sure, I can sell that. Might take a while. Might take forever. But it\'s off your hands and on my shelf, and that\'s what you wanted.',
        'You know, my grandfather used to say \'one adventurer\'s junk is another adventurer\'s salvation.\' He also went bankrupt twice, but the principle stands.',
        'Sold to me, then. I\'ll mark it up ten percent and put it on the front table. Circle of commerce.',
        'Done. If you find more, bring them by. My \'things adventurers dragged in\' section is the most popular shelf in the store. Says something about Millbrook, that.',
      ],
      farewell: [
        'Safe travels. And if the Forest Edge gives you trouble, remember: the store opens at dawn. Assuming I\'m awake.',
        'Off you go, then. Try not to die out there. It\'s terrible for repeat business.',
        'Come back soon. Or come back eventually. I\'m patient. The merchandise is patient. We\'ll be here.',
        'Stay alive. Stay solvent. Not necessarily in that order.',
        'The door works both ways. Out now, in later. That\'s the rhythm of it.',
        'Don\'t do anything I wouldn\'t do. Which leaves you quite a lot of room, honestly.',
        'Good luck. And I mean that commercially, not sentimentally.',
        'Watch yourself out there. Millbrook needs its customers alive and spending.',
        'Off into the wilds, then. Remember, anything you find out there that you don\'t want, I probably do. Probably.',
        'Take care. And if you don\'t take care, at least take supplies. Same result, different approach.',
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
        'Step inside. Mind the heat. If you can\'t handle the forge, you definitely can\'t handle what I make in it.',
        'You\'re here for steel, not conversation. Good. We understand each other. What do you need?',
        'Another one. Fine. The rack\'s on the right, the armour\'s on the left, and the prices are what they are. Don\'t haggle. I don\'t haggle. Bram doesn\'t haggle. Nobody in this town haggles.',
        'Welcome back to the forge. The heat gets worse every summer, but the iron doesn\'t complain, so neither do I.',
        'If you can hear the anvil ringing from outside, that means I\'m busy. If you came in anyway, you\'re either brave or desperate. Let\'s find out which.',
        'The forge is open. I am open to selling you things. I am not open to explaining why they cost what they cost. The metal decides the price. I just translate.',
        'Ah, a customer who survived long enough to need better equipment. That\'s progress. Let me see what I\'ve got.',
      ],
      idle: [
        'That copper dagger? Fine work, if I say so. And I do say so, because I made it. Holds an edge for about a week, which is longer than most adventurers last.',
        'If you\'re eyeing the wooden swords, those are from the carpenter, not me. I just sell them because he can\'t be bothered. And yes, before you ask, they\'re terrible. But they\'re cheap and they\'re here.',
        'See those burn marks on the wall? That\'s what happens when an apprentice tries to quench dark iron in cold water instead of oil. The apprentice is fine. The wall is not.',
        'Iron talks to you if you listen. A clear ring on the anvil means it\'s ready. A flat thud means more heat. Silence means you\'re hitting the wrong thing. Usually the anvil itself.',
        'Vesper\'s fumes keep drifting through the wall again. She says it\'s harmless. My steel says otherwise. We\'ve agreed to disagree. The wall has no opinion.',
        'I\'ve been forging since I was twelve. Burned my hands so many times the nerves gave up and stopped complaining. Best thing that ever happened to my career.',
        'That iron helm on the top rack? Took me three attempts. First one was lopsided. Second one cracked during quenching. Third one is perfect. Nobody asks about the first two, and I don\'t volunteer.',
        'Bram tried to sell \'artisanal\' swords once. Bought them from a trader out of Thornwall. They bent on first contact. He doesn\'t sell swords anymore. He sends people to me. As it should be.',
        'The anvil is older than this building. My grandmother dragged it here from the old settlement. Three hundred pounds of iron on a cart with one good wheel. She was stubborn. I inherited the anvil and the stubbornness.',
        'Every weapon on that rack has been tested. By me. On things that deserved it. If it\'s hanging there, it passed. If it didn\'t pass, it went back in the furnace. Nothing leaves this forge half-finished.',
      ],
      buy: [
        'Good steel finds good hands. Or at least it finds hands. Yours will do.',
        'Sold. If you bring it back bent, I\'ll straighten it. If you bring it back broken, I\'ll ask questions you won\'t like.',
        'There you go. Swing it before you trust it. Every blade has a personality, and some of them are disagreeable.',
        'Done. That piece has seen the furnace three times. It\'s ready for whatever you\'re not ready for.',
        'Take it. Treat it well. Oil it after rain, sharpen it after use, and for the love of iron, don\'t use it to pry open crates.',
        'Good choice. That alloy doesn\'t forgive sloppy swings, but if you hit true, nothing\'s getting back up.',
        'Yours now. And remember, a weapon is only as good as the arm behind it. So practice.',
        'Sold. Come back when you\'ve outgrown it. You will. They always do. And I\'ll have something better waiting.',
        'There. My best work for your hard-earned coin. If that\'s not a fair trade, nothing is.',
        'Take care of it and it\'ll take care of you. Neglect it and you\'ll be back here buying another one. Either way, I get paid.',
      ],
      sell: [
        'Hmm. Decent material under all that damage. I\'ll melt it down and make something better. That\'s the circle of iron.',
        'You want me to buy this? I forged this. I know exactly what it\'s worth, which is why my price is fair and your disappointment is your own problem.',
        'Salvage? Absolutely. I\'ll strip it to components. Less sentimental than selling, more useful than hoarding. Smart choice.',
        'Let me look. Hmm. The edge is gone but the core is sound. I can work with this. Fair price for fair scrap.',
        'I see what you did to this blade, and I\'m choosing not to comment. I\'ll take it. The furnace does not judge.',
        'Bringing me back my own work in this condition. Brave. But metal remembers where it came from, and the forge is always ready to start over.',
        'This has been through something. Several somethings, by the look of it. Good. Battle-tested material makes better ingots. The stress changes the grain.',
        'Not the worst I\'ve seen. Not the best either. Somewhere in the middle, like most things adventurers drag in. Price reflects that.',
        'I\'ll melt it, refine it, and forge it into something new by morning. Your junk becomes someone else\'s lifeline. That\'s the job.',
        'Worn, dented, but still holding together. That tells me the original work was solid. I should know. I did the original work.',
      ],
      farewell: [
        'Go on, then. Hit something with it. That\'s what it\'s for.',
        'Stay sharp out there. And I mean that literally. Bring a whetstone.',
        'The forge will be here when you need it. It\'s not going anywhere, and neither am I.',
        'Off with you. And if something out there puts a notch in my blade, I\'m blaming you, not the steel.',
        'Don\'t come back empty-handed. Bring ore, bring scrap, bring something I can melt. The furnace is always hungry.',
        'Keep your grip tight and your stance wide. Everything else is instinct.',
        'Go earn some stories for that weapon. Cold steel with no history is just inventory.',
        'Mind the edge. Mind your footing. And if all else fails, the pointy end goes toward the enemy. You\'d be surprised how many people forget that.',
        'Safe travels. Or dangerous ones. Either way, you\'re properly armed, and that\'s my part done.',
        'Back before sundown if you want repairs. After sundown, the forge is mine and I don\'t share.',
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
        'Come in, come in. You look like you need a warm meal and a chair that doesn\'t try to kill you. We have both.',
        'There\'s my favourite customer. Don\'t tell the others I said that. I say it to all of them. Keeps the tips coming.',
        'Rough day? I can tell. You\'ve got that look. The one where the forest won but you survived anyway. Pull up a stool.',
        'The Antler\'s been expecting you. Well, I have. The Antler is a building. But I like to think it has opinions.',
        'Welcome, welcome. The fire\'s hot, the stew\'s thick, and the gossip is fresh. What\'ll you have first?',
        'Back from the wilds? Good timing. I just finished a batch of mushroom stew that\'ll put the fight back in you. Or at least the warmth.',
        'Sit anywhere you like. Except the corner booth. That\'s Aldric\'s spot on Thursdays, and the man has very specific feelings about his booth.',
      ],
      idle: [
        'See that antler above the door? Nobody knows what it came from. Too big for a deer, too small for whatever lives past the Whispering Plains. My grandmother hung it there and told everyone to stop asking. We stopped asking.',
        'Kessa was in here last night, complaining about an apprentice who tried to forge tin without preheating the mould. Said the ingot came out looking like a very expensive potato. She was furious. It was wonderful.',
        'Bram sent over a cask of something he called \'spiced cider.\' I\'m still not sure what spice. Neither is he. But it sells, and nobody\'s died yet, so we\'ve agreed not to investigate.',
        'Adventurers always come back with the same look. Not scared, exactly. More like they\'ve realized the forest is bigger than they thought. That\'s the look. You\'ve got it right now.',
        'Captain Darrow stops by every evening after patrol. Always orders the same thing. Says nothing for twenty minutes, finishes her drink, nods, and leaves. Best customer I have. No fuss, no mess, always pays.',
        'Rowan brought me fresh herbs this morning. Wouldn\'t say where he found them. Just set them on the bar, nodded once, and walked out. The man communicates entirely through nods and plant matter. I respect it.',
        'Had a group in here last week claiming they\'d cleared the whole Forest Edge in one afternoon. Big talk, big appetites. They ordered four bowls of stew each. I didn\'t charge them for the fifth. Bravery or stupidity, either way they were hungry.',
        'That crack in the ceiling beam? Lightning, three summers ago. Hit the antler, traveled down the beam, and stopped right above where you\'re sitting. I patched it. The antler was fine. Make of that what you will.',
        'Vesper came in asking if I had any spoiled grain. Spoiled. Not fresh, not good. Spoiled. I gave her some and she looked delighted. I\'ve learned not to ask follow-up questions with that woman.',
        'You know what I love about this job? Everybody talks to the barmaid. Adventurers, merchants, guards, herbalists. They all sit down, order a drink, and tell me things they\'d never tell each other. I know everything about everyone. It\'s my retirement plan.',
      ],
      buy: [
        'Put your feet up. The stew\'s on, the fire\'s going, and nothing out there is getting in here tonight. I checked.',
        'Rest as long as you need. The Antler\'s been standing since before the first wolf pack, and it\'ll be standing after the last one. You\'re safe in here.',
        'One hot meal, coming up. You\'ve earned it. The things out there certainly don\'t cook for you.',
        'There you go. Eat slow, rest long. The world outside isn\'t going anywhere. Unfortunately.',
        'Stew and a warm seat. Simple pleasures, but out here, simple pleasures are the difference between quitting and going back out tomorrow.',
        'Enjoy. And if you need seconds, just wave. I\'ve never turned away a hungry adventurer. Bad for business, worse for karma.',
        'Here you are. Fresh bread, warm stew, and a roof that doesn\'t leak. Well, doesn\'t leak much. I\'m working on it.',
        'Drink up. You look like you\'ve been running on stubbornness and adrenaline, and both of those run out eventually. This won\'t.',
        'Food\'s ready. I put extra herbs in yours. Don\'t tell the others. Rowan brought in something special this morning and I\'m playing favourites.',
        'Settle in. The Antler takes care of its own, and if you\'re sitting at my bar, you\'re one of mine.',
      ],
      farewell: [
        'Off again? Stay sharp, stay fed, and come back with a story worth hearing. That\'s my only rule.',
        'Door\'s always open. Well, not literally. Literally it\'s closed at night. But metaphorically, always open.',
        'Be safe out there. And when you\'re not safe, be fast. And when you\'re not fast, be lucky. And when you\'re not lucky, come back here and I\'ll pour you something strong.',
        'Off you go. The forest isn\'t getting any friendlier, but you\'re getting tougher. I can tell. It\'s in the shoulders.',
        'Stay fed. I mean it. Half the adventurers who get into trouble skipped breakfast. The other half skipped everything. Don\'t be either half.',
        'Come back with stories. That\'s the price of drinking here. Gold for the ale, stories for the atmosphere.',
        'Take care of yourself. Nobody else out there is going to do it for you. Except maybe Rowan, but only if you\'re near a bush he likes.',
        'Until next time, love. The stew pot\'s always on and the fire\'s always going. That\'s my promise to Millbrook.',
        'Go on, then. The Antler will be here when you get back. Creaky floors, crooked antler, and all.',
        'Safe travels. And remember, if you hear something interesting out there, I want to hear it first. Before Aldric gets it for his reports. Information has a shelf life, and mine is a tavern.',
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
        'Oh good, you are here. I was about to test something and I needed a second opinion. Or a witness. Either works. What do you need?',
        'Come in. Watch your step. That stain on the floor is not dangerous anymore. Probably. It has been there for a week and nothing has grown from it, which I consider a success.',
        'A visitor. Wonderful. The last person who came in left very quickly after something bubbled. It was supposed to bubble. I should have mentioned that. Anyway. What can I prepare for you?',
        'Welcome to the bench. Everything you see is either a cure, a poison, or both, depending on dosage. I find that reassuring. Most people do not.',
        'You have arrived at an excellent time. I just finished a distillation cycle and the air quality is temporarily breathable. Let us take advantage of that.',
        'Ah. Your complexion tells me you have been in the Deep Forest recently. The pollen there affects the skin. I have something for that. I also have something that causes it, but that is on a different shelf.',
        'Please come in. Mind the jars. If any of them are vibrating, that is normal. If any of them are warm, please tell me immediately.',
      ],
      idle: [
        'That Minor Health Potion? Forest Sage extract, distilled twice, stabilized with a binding agent I will not name because you will stop buying them. It works. That is what matters.',
        'I have been trying to develop a reliable antivenom for spider bites for three years now. The current formula works on everything except Venomous Spiders, which is like building an umbrella that works in every weather except rain.',
        'People ask why the bench makes noises. The bench does not make noises. The compounds make noises. The bench is an innocent participant. As am I, technically.',
        'Kessa next door says my fumes are ruining the temper of her steel. I have explained, repeatedly, that correlation is not causation. She has explained, also repeatedly, that she does not care.',
        'I keep a journal of every failed experiment. It is seven volumes long. The successes fit in a pamphlet. This is normal. This is how science works. Anyone who tells you otherwise is selling something that has not been properly tested.',
        'That flask on the second shelf has been changing colour for three days. I am monitoring it. If it settles on purple, we have a breakthrough. If it settles on black, we have a problem. It is currently mauve, which is ambiguous.',
        'Maren brings me leftover stew from the tavern in exchange for headache remedies. This is the most efficient barter system in Millbrook and I refuse to monetize it. Some things are sacred.',
        'The difference between a medicine and a poison is precision. And documentation. Mostly documentation. I document everything. Kessa documents nothing. This is why her fumes are a mystery and my fumes are categorized.',
        'I once brewed a potion that made the drinker temporarily immune to rat bites. Brilliant formula. One problem: it also made the drinker irresistible to rats. The field test was memorable.',
        'Every ingredient in this shop was sourced, processed, and stored according to methods I developed myself. The methods are unconventional. The results are reliable. That is the only metric that matters in alchemy.',
      ],
      buy: [
        'Good. Drink it before you need it, not during. Potions work faster on a calm stomach. This is advice most adventurers receive once and ignore permanently.',
        'Sold. And please, for the sake of my professional reputation, do not mix it with anything. Especially not with ale. I cannot stress this enough.',
        'There you are. If you experience any unusual side effects, please come back and describe them in detail. For science. And also so I can adjust the formula.',
        'Excellent. That batch turned out particularly well. The colour is consistent, the viscosity is correct, and it only smells mildly terrible. That is the gold standard.',
        'Sold. Store it upright, keep it cool, and do not leave it in direct sunlight. Sunlight does things to the active compounds. Unpredictable things.',
        'There. If it saves your life, you are welcome. If it does not, the formula was sound and the problem was tactical. I take no responsibility for tactics.',
        'Done. And I mean this genuinely: please survive long enough to tell me how it performed. Field data is invaluable. Laboratory conditions can only simulate so much.',
        'Yours. The dosage instructions are on the label. Read them. I wrote them for a reason. The reason is that someone once drank three at once and I had to write a very detailed incident report.',
        'Good choice. That preparation has a ninety-two percent efficacy rate in controlled conditions. Field conditions are less controlled. But the formula accounts for chaos, to a degree.',
        'Sold. Drink it all in one go. Do not sip. Sipping distributes the compound unevenly, and uneven distribution leads to uneven results, and uneven results lead to interesting conversations with me afterward.',
      ],
      sell: [
        'Cave Moss? Lovely. The spore structure on these is remarkable. I can use this in at least four different preparations, three of which are legal.',
        'Forest Sage, good condition. The peppery smell means it was harvested before noon, which is when the essential oils are strongest. You have good instincts, or good luck. I will accept either.',
        'Moonpetal. Beautiful. Do you know these only bloom under indirect starlight? The active compound breaks down in direct sun. Nature\'s way of making my job harder.',
        'Oh, this is excellent. The cellular structure is intact. Whatever you did to preserve it on the way back, keep doing that.',
        'Hmm. Slightly bruised, but the essential oils are still viable. I can work with this. The distillation process is forgiving, even if I am not.',
        'Fascinating. I have not seen this particular variety in weeks. The growing conditions must have shifted. I will need to adjust my preparations accordingly. Thank you for the data point.',
        'Yes, I will take that. Do you know how long I have been waiting for someone to bring me fresh specimens? The answer is \'too long.\' The supply chain for rare ingredients is me, standing here, hoping someone walks in.',
        'Good quality. The root system is intact, which means I can extract twice the usual yield. Most gatherers snap the roots. You did not. That is either skill or accident, and I choose to believe skill.',
        'I can use this. In fact, I can use quite a lot of this. Bring more if you find it. I will pay the same rate every time, because consistency in pricing reflects consistency in standards.',
        'Wonderful. This goes directly into the evening batch. By tomorrow morning it will be something that keeps an adventurer alive three seconds longer than they would have been otherwise. Three seconds is often the difference.',
      ],
      farewell: [
        'Stay alive out there. You are one of the few customers who pays on time, and I would hate to lose that.',
        'Off you go. And remember: if it hurts, drink the red one. If it burns, drink the blue one. If it glows, run.',
        'Safe travels. And if you find any unusual flora, collect a sample. Label it. Bring it to me. I will be thrilled. Possibly dangerously thrilled.',
        'Do try not to get poisoned. My antidotes work, but prevention is cheaper and less likely to involve vomiting.',
        'Go carefully. The forest has more remedies than threats, but you have to know which is which. The distinction is not always visual.',
        'Farewell. And if you see any glowing mushrooms, do not eat them. Bring them to me. I will eat them. Under controlled conditions. With documentation.',
        'Off you go. Come back in one piece. Multiple pieces are harder to treat, and my stitching is adequate at best.',
        'Stay hydrated. Stay alert. And if anything bites you, note the colour, the size, and the number of legs. Accurate descriptions save lives. Inaccurate descriptions waste my time and my antivenom.',
        'Until next time. Bring ingredients if you can, injuries if you must, and stories if you have nothing else. I collect all three.',
        'Take care. The world outside my bench is chaotic, unpredictable, and poorly documented. Everything I dislike about it is everything you seem to enjoy. How peculiar.',
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
        'The board is current as of this morning. If something has changed since then, the board does not know and neither do I. Work with what is posted.',
        'You again. Good. Returning adventurers mean completed tasks, and completed tasks mean I can update the ledger. The ledger is the only thing in this town that never disappoints me.',
        'Welcome. I have reorganized the board by difficulty. Left side is survivable. Right side is ambitious. The middle is where I put the ones I cannot classify because the descriptions were too vague.',
        'Tasks are posted, tokens are ready, and my patience is limited. In that order. Let us begin.',
        'Ah, punctual. I appreciate punctuality. The board does not care, but I do. It is the small courtesies that hold civilization together.',
        'Another day, another batch of tasks that need doing by people who are not me. I manage the system. The system manages you. It is an elegant arrangement.',
        'The board awaits. And so does Millbrook. And so, technically, do the rats, the wolves, and whatever else is out there breeding faster than adventurers can thin them.',
      ],
      idle: [
        'Every quest on that board has been verified, categorized, and assigned a fair token reward. The system works. Slowly, and with complaints from all parties, but it works.',
        'The singing lessons advertisement? Not mine. Someone keeps pinning it back up every time I remove it. I have my suspicions, but Maren denies everything, and she does it with a straight face, which I find deeply suspicious.',
        'Weekly bounties pay better, but they require commitment. Daily tasks are smaller, faster, and less likely to get you killed. Choose according to your confidence and your schedule.',
        'I had an adventurer last week claim they killed sixty monsters in a single day. Sixty. I asked for evidence. They showed me a sack of rat tails. I counted thirty-two. We had a conversation about arithmetic.',
        'I file three copies of every completed quest. One for the board, one for the town archive, and one for my personal records. Redundancy is not paranoia. It is professionalism.',
        'Captain Darrow submitted a patrol report this morning that was, for once, legible. I nearly wept. She is the only person in this town who understands that documentation is a public service.',
        'The token system replaced the old barter method four years ago. Before that, adventurers were paid in \'gratitude\' and \'community standing.\' Neither of those bought supplies. Tokens do. Progress.',
        'Someone pinned a love letter to the board last Tuesday. It was unsigned, unaddressed, and deeply mediocre. I removed it. The board is for quests, not poetry. Especially not bad poetry.',
        'I have been administrating this board for eleven years. In that time, the rat population has remained constant, the wolf population has remained constant, and my faith in adventurer competence has declined steadily. The system endures regardless.',
        'Bram suggested I add a \'customer satisfaction\' section to the board. I suggested he mind his shop. We agreed to disagree. His suggestion went into the archive under \'rejected proposals,\' which is my favourite drawer.',
      ],
      buy: [
        'Noted. Tracked. The board knows what you owe, and so do I. Come back when it is done, and not before.',
        'Accepted. I have logged the parameters. Do not ask me to adjust them mid-task. The ledger does not appreciate corrections.',
        'Registered. The deadline is what it is. I do not extend deadlines. The deadline extends itself if you fail, which is the same as getting a new task. Think about that.',
        'Logged. Your commitment has been recorded in triplicate. I would say \'good luck,\' but luck is not a metric I track. Completion is.',
        'Task assigned. The requirements are clear, the reward is fair, and the expectations are reasonable. If you disagree with any of those, the complaints process is also on the board. Third pin from the left.',
        'Noted. I expect a full report upon completion. \'I did it\' is not a full report. Who, what, where, when, and how many. That is a full report.',
        'Accepted. You have until the posted deadline. Not a moment longer. The board resets at dawn, my patience resets never.',
        'Taken. Do try to complete it cleanly. The last adventurer who took that task came back with half the required items and a very creative excuse. The excuse did not earn tokens.',
        'Good. Your task is tracked. My ledger is open. The system proceeds. This is how Millbrook functions. Quietly, methodically, and with adequate paperwork.',
        'Assigned. And before you ask: no, you cannot take more than three active tasks at once. That is not a suggestion, it is a policy. Policies exist because people made me create them.',
      ],
      sell: [
        'Verified. Tokens awarded. Your contribution to Millbrook\'s ongoing survival has been recorded and will be forgotten by tomorrow. Such is the nature of public service.',
        'Done? Good. Cleanly done? Even better. Your tokens are here. Spend them wisely at the quest shop. Or unwisely. That is between you and your conscience.',
        'Another task completed. I will update the ledger. You know, some days I think I do more writing than the adventurers do fighting. The difference is that my work does not involve teeth.',
        'Completed and verified. Tokens transferred. The board thanks you. I thank you. Millbrook thanks you by continuing to exist. You are welcome.',
        'Satisfactory. The details match the requirements. The evidence supports the claim. Tokens awarded. If only all submissions were this straightforward.',
        'Noted and closed. Your record has been updated. You are now slightly more accomplished than you were this morning. That is progress.',
        'Well done. I have stamped it, filed it, and archived it. That task is now history, and history, in my office, is very well organized.',
        'Good work. Tokens awarded. And unlike some of your fellow adventurers, you did not try to negotiate a higher reward after the fact. I appreciate that more than you know.',
        'Verified. Clean completion. No disputes, no ambiguities, no creative interpretations of the word \'eliminate.\' A model submission.',
        'Done. Tokens here. The ledger is updated, the board is clear, and Millbrook is marginally safer. That is a good day\'s work by any metric.',
      ],
      farewell: [
        'The board updates at dawn. Try to be alive for it.',
        'Off you go. And please, if you discover anything noteworthy, report it properly. \'There was a big thing and it was angry\' is not a useful description, no matter how many times people try.',
        'Go. Complete tasks. Return. Report. This is the cycle, and the cycle works.',
        'Safe travels. And bring back evidence. I cannot award tokens on good faith alone. I tried once. It was a disaster.',
        'Off with you, then. The board will be here when you return. Freshly pinned and meticulously organized. As always.',
        'Try not to lose the task details on the way out. I am not repeating them. They are posted. Read the board.',
        'Good luck. Not that luck appears in my records. Results appear in my records. Bring me results.',
        'Return when it is done. Not when it is almost done, not when it is partially done, and definitely not when you have \'a funny feeling\' about it. Done. That is the standard.',
        'The square will be here. I will be here. The board will be here. We are all very reliable. Go do something worthy of that reliability.',
        'Farewell. And remember, if you die out there, your active tasks will be reassigned. The board is unsentimental. So am I. Stay alive.',
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
        'Ready to work? The land is. Whether you are is another question. Let us find out.',
        'You look like you have been fighting. Good exercise, but the resources do not come from combat. They come from patience. I teach patience.',
        'The nodes are out there waiting. They do not care if you are tired, hungry, or distracted. But I do. Sort yourself out, then we talk.',
        'Gathering is honest work. Swing a pick, pull a root, fell a tree. Nobody is trying to eat you. Usually. The plants, at least, are predictable.',
        'Ah, an eager one. That is fine. Eagerness fades after the first blister. What replaces it matters more. I am here to teach you what replaces it.',
        'You came to the right person. I have broken more pickaxes, dulled more axes, and stained more knees than anyone in Millbrook. That is experience, not clumsiness.',
        'Morning. The air smells like copper and pine, which means good conditions for everything. Pick your skill and I will point you in the right direction.',
      ],
      idle: [
        'I have worked every node between here and the Deep Mines. Twenty years of gathering. Still have all my fingers. That is not luck. That is technique.',
        'Bram thinks gathering is just the supply side of his business. Kessa thinks it is just the part before the forge. They are both wrong. Gathering is the part where you listen, and the Pocketrealm decides what to give you.',
        'You cannot force the land to give up what it is not ready to part with. Work steady. Pay attention. The rest is between you and the node.',
        'Every resource in the Pocketrealm started as raw material. Someone gathered it. Someone carried it back. The fighters get the glory, but the gatherers keep the economy breathing.',
        'Captain Darrow asked me once why I stand outside the gate instead of inside. I told her the gate faces the wrong direction. She did not understand. Gatherers look outward. That is the difference.',
        'Tools matter. A dull pickaxe wastes your time. A cracked axe wastes your wood. A careless hand wastes everything. Maintain your gear. The nodes deserve your best.',
        'The Forest Edge has more resources than most people realize. They walk past copper veins, oak stands, and herb patches every day without seeing them. Training changes what you see. That is half the job.',
        'Kessa and I have an arrangement. I bring her clean ore. She does not complain about the quality. It works because I never bring her dirty ore. Standards start in the field, not the forge.',
        'I do not talk much. The land does not talk much either. We get along.',
        'Vesper asked me to gather herbs under specific moonlight conditions last week. I did it. Not because I believed it mattered, but because she pays well and the forest at night is peaceful. Turns out the moonlight did matter. Vesper is always right about plants. Annoying, but useful.',
      ],
      farewell: [
        'Now go out there and practice. The nodes will not gather themselves. Well. The mushrooms might. But the ore definitely will not.',
        'Keep your tools sharp and your eyes open. The land remembers who treats it well.',
        'Go. Work a few nodes. Come back when your pack is full or your arms are tired. Either one is honest.',
        'The land is patient. Be patient with it. That is the whole lesson.',
        'Off you go. And if you find a node that seems too good, it probably is. Check your surroundings before you swing.',
        'Practice makes competent. Competent keeps you fed. Go practice.',
        'Stay low, work steady, and watch the weather. Rain changes everything when you are working stone or wood.',
        'Take what the land offers. Leave what it does not. That is gathering. Everything else is detail.',
        'Go well. And bring back what you find. Kessa needs ore, Vesper needs herbs, and Bram needs everything. Millbrook runs on what you carry home.',
        'The nodes will be there. They always are. Go find them.',
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
        'Welcome, welcome. The wheel has been waiting. It is always waiting. That is what makes it so charming. And so dangerous.',
        'Ah, you are back. The wheel remembers no one, but I remember everyone. Especially the ones who leave and come back. That is my favourite kind of customer.',
        'Step right up. The house always wins, except when it does not, which is just often enough to keep things interesting. That is not an accident.',
        'Another visitor to the table. Wonderful. The wheel does not care about your reputation, your level, or your luck. It cares about where the ball lands. Refreshingly democratic.',
        'Welcome. You look like someone who understands that risk and reward are the same word, just spelled differently. Sit down.',
        'The casino is open, the odds are posted, and your gold is exactly as heavy as your confidence. Shall we test both?',
        'Good to see you. The table has been lonely. Well, the table is always lonely. It is a table. But the wheel has been idle, and an idle wheel is a tragic thing.',
      ],
      idle: [
        'Bets are open. Fifty seconds to decide how brave you are feeling. The wheel does not judge. I, however, am taking notes.',
        'Last call. If you are going to bet, bet. If you are going to think about it, you have already lost. Indecision is the only outcome the wheel cannot produce.',
        'And the wheel decides. Remember: the wheel has no memory, no loyalty, and no sense of dramatic timing. Except when it does, which is always.',
        'I have seen adventurers walk in with nothing and leave with a fortune. I have also seen the reverse. Both make excellent stories. Only one makes me money.',
        'Some people study the wheel, looking for patterns. There are no patterns. But watching them search is half the entertainment. The other half is the wheel itself.',
        'Gavrik says gambling is a waste of discipline. I say discipline is a waste of a perfectly good evening. We respect each other\'s wrong opinions.',
        'The odds are the odds. I do not hide them, I do not change them, and I do not apologize for them. Transparency is the foundation of a good casino. That, and a very sturdy table.',
        'Every gold piece that crosses this table has a story. Most of those stories end here. Some of them continue, slightly heavier. That is the poetry of chance.',
        'Lira Caravel calls this establishment \'a monument to irrational optimism.\' I call her shop \'a monument to irrational markup.\' We get along wonderfully.',
        'The wheel spins forty-two times a day on average. I have counted. Not because it matters, but because counting things is what you do when you spend all day at a table. It passes the time between other people\'s decisions.',
      ],
      buy: [
        'Well played. Or well guessed. The difference is irrelevant when the gold is real. Congratulations.',
        'A winner. The wheel smiles upon you today. Enjoy it. The wheel\'s smile is famously unreliable.',
        'Impressive. You have beaten the odds, which is the only thing in this establishment worth beating. Your gold, as promised.',
        'Fortune favours you today. Take the gold, savour the moment, and consider whether you want to press your luck. Most people do. That is how I stay in business.',
        'There it is. The thrill of victory. Fleeting, intoxicating, and entirely responsible for every return visit. You are welcome.',
        'Congratulations. The wheel has spoken. I deliver the verdict and the gold. Today, both are in your favour.',
        'A win. Clean, decisive, and profitable. Enjoy it. The memory of this moment will bring you back, and the wheel will be waiting.',
        'Well done. You have earned the rarest thing in this establishment: someone else\'s gold that is now yours. Handle it wisely. Or gamble it again. I support both choices equally.',
        'The wheel delivers. I deliver the gold. The system works beautifully when it works in your favour. Savour that.',
        'Victorious. Take your winnings. And remember this feeling. It is the most honest advertisement I have.',
      ],
      sell: [
        'The wheel giveth, the wheel taketh. Today it taketh. My condolences, which are genuine and also free, unlike everything else here.',
        'Not your round. The beautiful thing about roulette is that there is always another round. The terrible thing about roulette is also that there is always another round.',
        'Gone. But think of it this way: you have contributed to the local economy, supported employment (mine), and gained a valuable lesson about probability. That is almost the same as winning.',
        'The wheel has spoken, and it was not kind. But it was fair. The wheel is always fair. That is the cruelest thing about it.',
        'A loss. It happens. To everyone. Even to people who insist it will not happen to them. Especially to those people.',
        'Your gold has changed hands. It does that here. Think of it as a migration. The gold is not gone; it is simply somewhere else. Specifically, here.',
        'Not this time. The wheel is indifferent to your hopes, your strategy, and your lucky charm. But it is consistent, and consistency has a value of its own.',
        'Gone, but not forgotten. By you, anyway. The wheel has already moved on. The wheel is remarkably unsentimental. I admire that.',
        'A lesson in probability, paid for with gold. Some would call that expensive. I call it education. And education, they say, is priceless.',
        'The house wins this round. I would say I am sorry, but I built my career on this exact outcome. I can, however, offer sympathy. It is complimentary.',
      ],
      farewell: [
        'Leaving? A wise choice. Knowing when to stop is the most valuable skill in this room. Second most valuable is knowing when to come back.',
        'Until next time. And there is always a next time. That is not a threat. It is a statistical certainty.',
        'Walk away while you can. Or while you choose to. The distinction matters more than you think.',
        'Go well. The wheel will be here. Spinning, waiting, indifferent. It is the most reliable thing in the Pocketrealm. After taxes.',
        'Farewell. Take your winnings, take your losses, and take the memory. The wheel trades in all three.',
        'Off you go. The world outside has risks that pay nothing when you win. The casino is more honest about its odds. Think about that.',
        'Until we meet again. And we will. Everyone comes back to the table eventually. It is not a flaw. It is human nature. I have built a business on it.',
        'Goodbye for now. The door works both ways, and the wheel never stops. You know where to find us.',
        'Safe travels. And if you find gold out there in the wilds, remember: gold is always more exciting when you put it on a number.',
        'Leaving the table is the hardest bet to make, and the one with the best odds. Well played.',
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
        'You are here. Good. The guild hall does not run on enthusiasm. It runs on discipline, coordination, and people who show up when they say they will. Which category are you?',
        'Back again. The contracts board has been refreshed. New targets, same expectations. If your guild is up to it, step forward. If not, step aside. The hall is busy.',
        'Guild hall is open. I have contracts, I have records, and I have very little patience for people who want to \'just look around.\' This is not a museum. Pick a contract or ask a question.',
        'Welcome. If you are guild leadership, the contracts are to your right. If you are new and looking to join a guild, the recruitment board is behind me. If you are lost, the door is where you left it.',
        'Another day, another adventurer wondering if they are ready for guild life. The answer is: probably not. But readiness is overrated. Willingness matters more. Are you willing?',
        'The hall has been standing since Thornwall was founded. Every guild that matters has walked through those doors. The ones that did not matter also walked through. The doors do not discriminate. I do.',
        'Guild business is serious business. If you are here to play at leadership, save us both the time. If you are here to build something, pull up a chair.',
      ],
      idle: [
        'See that board? Mob Slayer, Resource Gatherer, Pathfinder, the usual. The targets look large because they are meant for a guild, not a person. That is the point. Fifteen thousand kills sounds impossible until twenty people share the work.',
        'Specialisations unlock at guild level ten. Combat, crafting, gathering, or exploration. Pick one, commit to it. Respeccing costs two million from the treasury, which is my way of saying: pick carefully.',
        'The treasury is not a savings account. It is a war chest. Fund your projects, fuel your boosts, and for the love of all things sharp, do not let the officers spend it on decorations. I have seen it happen. Twice.',
        'I lost this hand to a Death Knight in the Haunted Marsh. Three of us went in. Two came out. The third one\'s name is on the memorial wall behind you. Guilds exist because nobody should face that alone.',
        'A guild is only as strong as its weakest member\'s willingness to improve. Talent is useful. Stubbornness is better. I have built more on stubbornness than talent ever provided.',
        'The memorial wall has forty-seven names. Every one of them fought for something bigger than themselves. That is what guilds are for. Not the XP, not the treasury. The names on that wall.',
        'Officers handle the daily work. Leaders handle the vision. And I handle the paperwork that keeps both of them honest. It is thankless, necessary work. My favourite kind.',
        'Lira sends supplies through the Forge District every week. The guilds that maintain good relationships with the Supply Depot eat better, gear faster, and complain less. Logistics wins wars. Remember that.',
        'I have seen guilds rise and fall in a single season. The ones that fall always have the same problem: too many chiefs, not enough people willing to do the boring work. The boring work is the foundation. Everything else is decoration.',
        'Some guilds compete. Some cooperate. The smart ones do both, depending on the contract. Flexibility is a discipline. Most people think it is the opposite. Most people are wrong.',
      ],
      buy: [
        'Noted. The contract runs until the week ends or your guild finishes it, whichever comes first. Do not come back early to complain about the targets. I set them. I know what they are.',
        'Accepted. Your guild\'s contribution is tracked collectively. Every kill, every gather, every craft counts. The board does not care who does the most. The treasury does not care either. I, personally, do care, but that is between me and the ledger.',
        'Contract taken. The targets are firm, the deadline is real, and the reward is fair. Everything else is up to your guild. That is the arrangement.',
        'Logged. Your guild has committed. Commitment means completion. Partial credit is not something I award. Partial credit is for academics, not guilds.',
        'Done. The contract is active. Rally your members, divide the work, and get it done. The hall expects results, not excuses.',
        'Accepted. I have seen your guild\'s record. It is adequate. Make it better than adequate with this one.',
        'Taken. The board has been updated. Your guild\'s name is on it now, which means your reputation is on it too. Treat that seriously.',
        'Registered. The contract is yours. The clock starts now. Not tomorrow, not \'when everyone is ready.\' Now.',
        'Good. Your guild picked a contract that matches its strength. That is either wisdom or luck. Either way, I approve. Get to work.',
        'Noted and assigned. This contract has been completed by twelve guilds before you. All twelve managed it. The thirteenth will too, or I will want to know why not.',
      ],
      sell: [
        'Done. Guild XP awarded. Treasury funded. Your guild just proved it can work together, which is more than most organisations manage. Well done.',
        'Contract fulfilled. I have updated the records. Aldric Voss in Millbrook would approve of my filing system, though he would never admit it. We use the same ink supplier.',
        'Completed. The numbers check out. Your guild delivered. That is all I ask, and it is more than many provide.',
        'Verified and recorded. Guild XP distributed, treasury funded, and your guild\'s reputation just improved. That last one does not show on a ledger, but it matters more.',
        'Well done. Clean completion. Your guild worked as a unit, which is the point. The reward is secondary to the proof that you can function together.',
        'Contract closed. The Pocketrealm is marginally safer because your guild did its job. That is worth more than the tokens, though the tokens are also nice.',
        'Fulfilled. I will update the rankings. Your guild moved up. Not by much, but movement is movement. Consistency builds standings. One contract at a time.',
        'Done and dusted. The hall recognizes your guild\'s contribution. Formally, with records. Informally, with my respect. Both are earned.',
        'Good work. The memorial wall stays the same length because guilds like yours do the work that keeps people off it. Remember that when the contracts feel routine.',
        'Contract completed. Treasury rewarded. Your guild is stronger today than it was last week. That is the only metric I care about. Growth through service.',
      ],
      farewell: [
        'Go. Build something that lasts. The Pocketrealm tears down everything eventually, but a good guild makes it work harder.',
        'The hall is always open. Guilds do not keep business hours, and neither do I.',
        'Dismissed. Come back with results, or come back with questions. Both are welcome. Excuses are not.',
        'Go rally your guild. The contracts will not complete themselves, and neither will I. That is your job.',
        'Strength in numbers. Remember that out there. The lone wolf dies. The pack survives. I did not make the rules. I just enforce them.',
        'The hall will be here. It has been here longer than any guild, and it will be here after. But a good guild leaves its mark on these walls. Go earn yours.',
        'Safe travels. And if your guild needs guidance, you know where to find me. Standing here. As always. It is not glamorous, but it is necessary.',
        'Go do good work. The Pocketrealm needs guilds that function. Not guilds that boast. Functioning. There is a difference, and I can see it from here.',
        'Off with you. And tell your guildmates that Gavrik says hello. And also that their last contract was adequate. Adequate is my version of praise. They should know that by now.',
        'Until next time. Keep your guild tight, your treasury funded, and your officers honest. Everything else sorts itself out.',
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

  // =========================================================================
  // Skill-specific NPC variants
  // Same NPC, different lines depending on which crafting/gathering skill
  // =========================================================================

  'kessa-weaponsmithing': {
    name: 'Kessa Ironweld',
    location: 'The Forge, Crafting Quarter',
    personality: 'Direct, proud, and perpetually overheated.',
    lines: {
      greeting: [
        'Weapons, is it? Good. That is what I do best. Everything else is just practice for this.',
        'You want a blade? Tell me what you are fighting and I will tell you what you need. Skip that step and you get what you deserve.',
      ],
      idle: [
        'A sword is just a conversation between steel and stone. My job is to make sure the steel wins.',
        'Every weapon has a weak point. The trick is knowing where it is before your enemy does. I build mine so only I know.',
        'The difference between a good blade and a great one is about two hundred hammer strikes. Most smiths stop at a hundred and fifty.',
      ],
      buy: [
        'Good steel finds good hands. Or at least it finds hands. Yours will do.',
        'There you go. Swing it before you trust it. Every blade has a personality, and some of them are disagreeable.',
      ],
      farewell: [
        'Go on, then. Hit something with it. That is what it is for.',
        'Stay sharp out there. And I mean that literally. Bring a whetstone.',
      ],
    },
  },

  'kessa-armorsmithing': {
    name: 'Kessa Ironweld',
    location: 'The Forge, Crafting Quarter',
    personality: 'Direct, proud, and perpetually overheated.',
    lines: {
      greeting: [
        'Armour? Smart. Most people come in wanting something pointy. The clever ones ask for something that stops pointy things.',
        'You want to survive out there? Good priorities. Let me see what I can hammer out for you.',
      ],
      idle: [
        'The best armour is the kind you forget you are wearing. Until something hits you and you remember why you paid for it.',
        'Plate, chain, scale. Each has a purpose. Plate stops the big hits. Chain handles the slashes. Scale is for people who want to look impressive while doing both poorly.',
        'I test every piece myself. If it dents when I hit it, it is not ready. If it dents when the Forest Edge hits it, that is your problem. But it will not dent when I hit it.',
      ],
      buy: [
        'Wear it in. Walk around town for a day before you go out there. New armour needs to learn your shape.',
        'Sold. If something gets through that, it was not the armour\'s fault.',
      ],
      farewell: [
        'Keep your guard up. The armour does its job; make sure you do yours.',
        'Try not to come back with too many new dents. I charge for straightening.',
      ],
    },
  },

  'kessa-refining': {
    name: 'Kessa Ironweld',
    location: 'The Forge, Crafting Quarter',
    personality: 'Direct, proud, and perpetually overheated.',
    lines: {
      greeting: [
        'Refining? The foundation of everything I do. Bring me raw ore and I will show you what is hiding inside it.',
        'Good. Nobody appreciates the refiner until they run out of ingots. Then suddenly everyone wants to be your friend.',
      ],
      idle: [
        'Copper melts at a gentle heat. Iron takes commitment. Dark iron takes stubbornness and a furnace that wants to cooperate. Mine does not.',
        'You can tell the quality of an ingot by the sound it makes when you tap it. Clear ring means clean metal. Dull thud means impurities. Silence means you are tapping a rock.',
        'Refining is patience. The ore does not care about your schedule. It melts when it is ready, and not a moment before.',
      ],
      buy: [
        'Clean bars, good weight. That is what comes out when you do not rush the process.',
        'There you go. Every ingot I produce is worth the wait. Ask anyone. Or don\'t. I know I am right.',
      ],
      farewell: [
        'Keep bringing me ore. The furnace gets lonely.',
        'Off you go. Try to bring back something worth smelting this time.',
      ],
    },
  },

  'rowan-mining': {
    name: 'Rowan Delk',
    location: 'Just outside Millbrook\'s gate',
    personality: 'Weathered, terse, and quietly competent.',
    lines: {
      greeting: [
        'Mining, eh? Good. The veins in these hills have been generous this season. Just follow the colour in the rock and swing steady.',
        'You want to pull copper out of stone? I can teach you that. The trick is knowing which stone to hit and which one to leave alone.',
      ],
      idle: [
        'A copper vein looks like a green stain in grey rock. Iron shows as dark streaks with a reddish tint. Learn the colours and the pickaxe does the rest.',
        'The Deep Mines have ore you have never seen. Dark iron, mythril, things that glow when you hit them. But the caves down there have other things too. Hungrier things.',
        'Most miners swing too hard. The rock does not care how strong you are. It cares about where you hit it. Find the grain, follow the seam.',
      ],
      farewell: [
        'Keep your pickaxe sharp and your lantern lit. Veins do not announce themselves in the dark.',
        'Off to the mines? Watch your footing. The ore will wait. The floor might not.',
      ],
    },
  },

  'rowan-woodcutting': {
    name: 'Rowan Delk',
    location: 'Just outside Millbrook\'s gate',
    personality: 'Weathered, terse, and quietly competent.',
    lines: {
      greeting: [
        'Woodcutting? Right. Grab an axe, find an oak, and remember: you are not fighting the tree. You are negotiating.',
        'The forests around Millbrook grow fast and thick. Good timber if you know where to look. I know where to look.',
      ],
      idle: [
        'Oak is reliable. Willow is flexible. Darkwood is stubborn and will ruin your axe if you come at it wrong. Respect the grain.',
        'Millbrook\'s bowyer gets his best wood from the trees at the Forest Edge, where the soil is richer. The deep forest trees grow harder but more brittle. Different wood for different work.',
        'A clean cut heals. The tree grows back. A ragged cut rots, and then you have a dead tree and a dull axe. Take your time.',
      ],
      farewell: [
        'Swing with the grain, not against it. The forest will teach you the rest.',
        'Keep your axe oiled and your back straight. Woodcutting is a young person\'s game until it is not.',
      ],
    },
  },

  'rowan-foraging': {
    name: 'Rowan Delk',
    location: 'Just outside Millbrook\'s gate',
    personality: 'Weathered, terse, and quietly competent.',
    lines: {
      greeting: [
        'Foraging? Good eye. Most people walk right past what the land is offering. Herbs, mushrooms, roots. It is all there if you know how to look.',
        'The forest floor has more to give than the trees above it. You just need to get your knees dirty.',
      ],
      idle: [
        'Forest Sage grows in patches where the canopy thins. The peppery smell gives it away before you see it. Follow your nose.',
        'Mushrooms after rain. Herbs at dawn. Roots in autumn. Everything has a season. Learn the rhythm and the land provides.',
        'Vesper keeps asking me to find her specific herbs in specific conditions. "Morning-harvested Moonpetal only, Rowan." As if the Moonpetal cares what time I pick it. It does, apparently. She tested.',
      ],
      farewell: [
        'Watch where you step. The best finds are always right where someone is about to put their boot.',
        'Take only what you need. The forest remembers greed.',
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
