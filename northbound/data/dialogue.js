// NORTHBOUND — people you meet, and what they say.
//
// `biome` and `kind` narrow where a line can appear; null on either means
// anywhere. `kind` matches the landmark's kind field, so 'town', 'landmark',
// 'ford', 'pass' and 'terminus' are all valid, and null fits any of them.
//
// Voice: dry, warm, specific. Everyone out here is mid-conversation with
// somebody else and you have just walked into it.

export const TALK = [
  // --- desert ---------------------------------------------------------------
  { biome: 'desert', kind: null, speaker: 'A sunburnt southbounder', line: 'Cache at mile 91 is dry. Has been for a week. Do not plan on it and do not believe the app.' },
  { biome: 'desert', kind: null, speaker: 'A woman with a sun umbrella', line: 'Everybody laughs at the umbrella for about four days. Then everybody buys one.' },
  { biome: 'desert', kind: null, speaker: 'A guy taping his feet', line: 'It is not the miles that get you out here. It is the sand in the socks doing the miles for you.' },
  { biome: 'desert', kind: null, speaker: 'A hiker eating cold ramen', line: 'I stopped carrying a stove in Warner Springs. I have not had a hot meal since and I have not missed one.' },
  { biome: 'desert', kind: null, speaker: 'A retired firefighter', line: 'Walk before six, sleep from eleven to four, walk till dark. The desert is a night shift. People forget that.' },
  { biome: 'desert', kind: null, speaker: 'A kid on his first thru', line: 'I mailed my ice axe to Kennedy Meadows. I have no idea if that was smart.' },
  { biome: 'desert', kind: null, speaker: 'A woman with a sleeping mule', line: 'She will carry ninety pounds all day and then refuse to cross a puddle. That is a mule.' },
  { biome: 'desert', kind: null, speaker: 'A day hiker with a small dog', line: 'You are going to Canada? On foot? Starting from here?' },
  { biome: 'desert', kind: null, speaker: 'A trail angel by a folding table', line: 'Take two. If you take one I have to carry the rest of it back down and my knees are done.' },
  { biome: 'desert', kind: 'landmark', speaker: 'Somebody signing the register', line: 'Read back four pages. Half these people are already off trail and it is May.' },
  { biome: 'desert', kind: 'town', speaker: 'The clerk at the counter', line: 'Boxes are in the back. If it is not there it is in Idaho. It is always Idaho.' },

  // --- chaparral ------------------------------------------------------------
  { biome: 'chaparral', kind: null, speaker: 'A hiker scratching both forearms', line: 'Poodle dog bush. Do not touch it, do not brush it, do not put your pack down in it. Ask me how I know.' },
  { biome: 'chaparral', kind: null, speaker: 'An older man with two poles', line: 'There is a spring a half mile off trail at the saddle. It is not on any list. Tell nobody.' },
  { biome: 'chaparral', kind: null, speaker: 'A woman coming down fast', line: 'Cloud is sitting on San Jacinto and it is thirty-eight degrees up there. I turned around. No shame in it.' },
  { biome: 'chaparral', kind: null, speaker: 'A hiker with a broken pole', line: 'Aluminum bends. Carbon explodes. I learned that lesson at a hundred and eighty dollars.' },
  { biome: 'chaparral', kind: null, speaker: 'A local out for the morning', line: 'That rock over there looks exactly like an eagle from the far side. Nobody believes it until they see it.' },
  { biome: 'chaparral', kind: 'town', speaker: 'The woman running the hostel', line: 'Laundry is free, showers are five minutes, and the couch has already been claimed by three people.' },
  { biome: 'chaparral', kind: 'town', speaker: 'A hiker on his fourth burger', line: 'The trick is to order the second one before you finish the first. Momentum.' },

  // --- sierra ---------------------------------------------------------------
  { biome: 'sierra', kind: null, speaker: 'A ranger with a very dirty pack', line: 'Everything is a week later than last year. Ford in the morning, camp low, and do not be a hero at Bear Creek.' },
  { biome: 'sierra', kind: null, speaker: 'A JMT hiker going the other way', line: 'You have four passes in five days and every one of them is worth the whole trip.' },
  { biome: 'sierra', kind: null, speaker: 'A man repacking a bear can', line: 'It does not all fit. It never all fits. You eat the difference standing at the trailhead.' },
  { biome: 'sierra', kind: null, speaker: 'A woman drying socks on a rock', line: 'Nine crossings today. My feet have not been dry since Crabtree and I have stopped caring.' },
  { biome: 'sierra', kind: null, speaker: 'A fisherman at the outlet', line: 'Golden trout. They put them up here a century ago and now nobody can agree whether that was a crime.' },
  { biome: 'sierra', kind: null, speaker: 'A hiker with a sunburnt nose', line: 'Snow reflects. You will burn the underside of your chin and you will not understand how.' },
  { biome: 'sierra', kind: null, speaker: 'A packer leading three mules', line: 'Loads even, loads high, check the girth at every break. Do that and she will walk anywhere you will.' },
  { biome: 'sierra', kind: 'ford', speaker: 'Somebody drying off on the far bank', line: 'Go a hundred yards upstream where it braids. Half the depth, twice the width. Nobody does it and everybody should.' },
  { biome: 'sierra', kind: 'ford', speaker: 'A woman with wet shorts', line: 'Unbuckle the hip belt. If it takes you, you want to be able to get out of the pack.' },
  { biome: 'sierra', kind: 'town', speaker: 'The man behind the store counter', line: 'You want the resupply shelf or the ice cream? Everybody says resupply and everybody means ice cream.' },

  // --- alpine ---------------------------------------------------------------
  { biome: 'alpine', kind: null, speaker: 'A climber coming off the ridge', line: 'Two hundred yards of hard snow on the north side. Go at seven, not at eleven. At eleven it is soup.' },
  { biome: 'alpine', kind: null, speaker: 'A woman gasping at a switchback', line: 'Thirteen thousand feet. My legs are fine. My lungs have filed a complaint.' },
  { biome: 'alpine', kind: null, speaker: 'A hiker eating lunch on a rock', line: 'Storms build by noon up here all summer. If you are still climbing at one you have made a decision.' },
  { biome: 'alpine', kind: null, speaker: 'A trail runner with a tiny vest', line: 'I have four hundred calories and a windbreaker and I will be at the car by dark. Do not do what I do.' },
  { biome: 'alpine', kind: 'pass', speaker: 'Somebody catching their breath', line: 'Look back before you go over. You will not see it from the other side.' },
  { biome: 'alpine', kind: 'pass', speaker: 'A man in an enormous parka', line: 'Wind gets funneled through the notch. Put the layer on before you top out, not after.' },
  { biome: 'alpine', kind: null, speaker: 'A hiker with a cracked lip', line: 'Drink more than you think. Up here you lose it breathing and never notice.' },

  // --- forest ---------------------------------------------------------------
  { biome: 'forest', kind: null, speaker: 'A woman with a saw on her pack', line: 'Trail crew. Two hundred and sixty blowdowns between here and the road, and we have cleared eleven.' },
  { biome: 'forest', kind: null, speaker: 'A hiker slapping his neck', line: 'Head net. Buy one. Wear it at dinner. I do not care how you look, nobody here does.' },
  { biome: 'forest', kind: null, speaker: 'An old man with a fishing rod', line: 'I have camped at that lake every August since 1974. It has never once been the same twice.' },
  { biome: 'forest', kind: null, speaker: 'A section hiker with new shoes', line: 'Four days out and I have already learned more about my feet than I wanted to.' },
  { biome: 'forest', kind: null, speaker: 'A hiker with purple hands', line: 'Huckleberries all along the north slope. I made two miles today. Zero regrets.' },
  { biome: 'forest', kind: null, speaker: 'A woman studying a paper map', line: 'The phone died at the pass. This is a nineteen ninety-one forest service map and it is doing fine.' },
  { biome: 'forest', kind: null, speaker: 'A quiet man tending a small fire', line: 'The smoke is west of here for now. Wind is supposed to swing tomorrow. Then we will see.' },
  { biome: 'forest', kind: 'town', speaker: 'A cook leaning out the kitchen door', line: 'Nobody finishes the pancakes. One man did it in 2016 and we still talk about him like a ghost.' },
  { biome: 'forest', kind: 'town', speaker: 'A hiker guarding a laundry machine', line: 'Twenty-two minutes left. I am not moving. You can sit but you cannot have the chair.' },
  { biome: 'forest', kind: 'landmark', speaker: 'Someone standing at the monument', line: 'Halfway. I have been walking since April and I am exactly nowhere.' },

  // --- volcanic -------------------------------------------------------------
  { biome: 'volcanic', kind: null, speaker: 'A hiker inspecting a shredded sole', line: 'The lava took a hundred miles off these shoes in four. It is like walking on broken bottles.' },
  { biome: 'volcanic', kind: null, speaker: 'A woman filling four liters', line: 'No water on the rim for twenty-seven miles. Carry it all. There is no clever way around it.' },
  { biome: 'volcanic', kind: null, speaker: 'A geologist on vacation', line: 'That mountain was twelve thousand feet tall and it fell into itself in an afternoon. What you are looking at is the hole.' },
  { biome: 'volcanic', kind: null, speaker: 'A hiker with ash on his calves', line: 'The pumice is like walking in flour. Two steps up, one step back, all afternoon.' },
  { biome: 'volcanic', kind: 'landmark', speaker: 'A tourist in flip flops', line: 'Where did you park? Oh. Oh, you did not park.' },
  { biome: 'volcanic', kind: 'town', speaker: 'A server carrying six plates', line: 'The buffet closes at ten thirty. I have watched hikers do things at that buffet I will never unsee.' },

  // --- rainforest -----------------------------------------------------------
  { biome: 'rainforest', kind: null, speaker: 'A soaked northbounder', line: 'Nine days. It has rained nine days. I have started putting the wet socks on without even flinching.' },
  { biome: 'rainforest', kind: null, speaker: 'A woman wringing out a shirt', line: 'You do not dry out up here. You just get less wet for an hour at a time.' },
  { biome: 'rainforest', kind: null, speaker: 'A ranger at a trailhead board', line: 'The log over the Suiattle went out in the spring melt. It is a ford now, and it is a real one.' },
  { biome: 'rainforest', kind: null, speaker: 'A hiker with duct-taped gaiters', line: 'Devil\'s club. Do not grab anything you have not looked at. Everything here has spines and a grudge.' },
  { biome: 'rainforest', kind: null, speaker: 'A man watching the north sky', line: 'First snow at Rainy Pass was September twenty-first last year. Count backwards from that and hike accordingly.' },
  { biome: 'rainforest', kind: null, speaker: 'A woman on the bus down', line: 'Take the shuttle to the bakery. I know you are in a hurry. Take the shuttle to the bakery.' },
  { biome: 'rainforest', kind: 'ford', speaker: 'A hiker lacing shoes on the bank', line: 'Grey water means you cannot see the bottom. Poles first, feet second, and never cross your legs.' },
  { biome: 'rainforest', kind: 'town', speaker: 'The motel owner at the desk', line: 'Six of you in one room is fine. Six of you and two mules is a conversation.' },

  // --- anywhere -------------------------------------------------------------
  { biome: null, kind: null, speaker: 'A hiker adjusting a hip belt', line: 'Weigh everything at home and then leave a third of it in the hiker box in Mount Laguna like the rest of us did.' },
  { biome: null, kind: null, speaker: 'A woman with a very old pack', line: 'This thing has been to Canada twice. It has more miles than my truck.' },
  { biome: null, kind: null, speaker: 'A man eating out of a jar', line: 'Cold soak. No stove, no fuel, no cleanup. Dinner is sad but breakfast is instant and I am always first out of camp.' },
  { biome: null, kind: null, speaker: 'A hiker with a homemade pack', line: 'I sewed it in my kitchen. Nine ounces. It has failed twice and I have fixed it twice, which is the whole point.' },
  { biome: null, kind: null, speaker: 'Somebody who has clearly not slept', line: 'There was something outside the tent. I am not saying it was a bear. I am saying I did not look.' },
  { biome: null, kind: null, speaker: 'A woman with a notebook', line: 'I write down one thing a day. Some days it is a whole page. Yesterday it was the word "wind".' },
  { biome: null, kind: null, speaker: 'A hiker checking a weather radio', line: 'Front coming through Thursday. Get over the high stuff Wednesday or sit for two days. Your call.' },
  { biome: null, kind: null, speaker: 'A man with a tiny folding chair', line: 'Everybody laughs at the chair. Everybody asks to sit in the chair.' },
  { biome: null, kind: null, speaker: 'A hiker with a taped-up shoe', line: 'Four hundred and eighty miles on these. I am going to get five hundred if it kills the shoe and possibly me.' },
  { biome: null, kind: null, speaker: 'A very cheerful older woman', line: 'I started at sixty-three. I am slow, I am here, and I have passed nine people who started faster.' },
  { biome: null, kind: null, speaker: 'A hiker who will not stop moving', line: 'Twelve minute breaks. Any longer and the legs go cold and you pay for it on the next climb.' },
  { biome: null, kind: null, speaker: 'A man staring at his food bag', line: 'Six days of food for a four day carry. I do this every single time and I have made peace with it.' },
  { biome: null, kind: null, speaker: 'A woman with an enormous smile', line: 'I quit a job I hated on a Tuesday and started walking on the Friday. Best decision anyone in my family has ever made.' },
  { biome: null, kind: null, speaker: 'A hiker rubbing a knee', line: 'Downhill is what gets you. Everyone trains for the up. Nobody trains for the down.' },
  { biome: null, kind: null, speaker: 'A quiet teenager with a good camera', line: 'I have four thousand photographs and the only one I like is of my dad\'s boots.' },
  { biome: null, kind: null, speaker: 'A man with a permit clipped to his pack', line: 'Carry the paper copy. The one time a ranger asks is the one day the phone is dead.' },
  { biome: null, kind: null, speaker: 'A hiker splitting a candy bar', line: 'Half. Take it. Somebody did this for me at mile two hundred and I have been paying it forward ever since.' },
  { biome: null, kind: null, speaker: 'A woman lacing up in the dark', line: 'Out by five, done by two, whole afternoon in the shade. It is not a race but it is definitely a schedule.' },
  { biome: null, kind: null, speaker: 'A man who has clearly been alone a while', line: 'You are the first people I have spoken to in three days. Sorry in advance. I am going to talk a lot.' },
  { biome: null, kind: null, speaker: 'A hiker with a bandaged hand', line: 'Blowdown. Fell off it. It was two feet high and I have never been so thoroughly beaten by a log.' },
  { biome: null, kind: 'town', speaker: 'A hiker at the end of a zero', line: 'One night turns into three. Every time. The bed is the enemy and the bed always wins.' },
  { biome: null, kind: 'town', speaker: 'A woman sorting a resupply on the floor', line: 'Four days of food for five people. I have done this nine times and I still cannot make it fit.' },
  { biome: null, kind: 'town', speaker: 'A man at the hardware counter', line: 'You want the two-part epoxy, not the tape. Tape is for getting to town. Epoxy is for leaving it.' },
  { biome: null, kind: 'town', speaker: 'A local buying milk', line: 'We get about a thousand of you through here a year. Best months of the season, honestly.' },
  { biome: null, kind: 'town', speaker: 'A hiker hovering by the hiker box', line: 'Somebody left a whole unopened jar of peanut butter in there. I am watching it. I am waiting.' },
  { biome: null, kind: 'ford', speaker: 'A man scouting the bank', line: 'Wait for morning. It drops six inches overnight and six inches is the whole argument.' },
  { biome: null, kind: 'ford', speaker: 'A woman pointing downstream', line: 'Look at where you would wash out to. If the answer is a log jam, do not cross here.' },
  { biome: null, kind: 'landmark', speaker: 'Someone sitting with their back to a post', line: 'I thought I would feel something bigger. Mostly I want a sandwich.' },
  { biome: null, kind: 'terminus', speaker: 'A person who just finished', line: 'It takes about a week to stop waking up at five. The legs take a month. The rest of it never quite goes.' },
  { biome: null, kind: 'pass', speaker: 'A hiker eating a bar very slowly', line: 'Fifteen minutes up here. That is the rule. Any longer and you will not want to go down.' },
];

/** Landmark-specific counter talk, keyed by landmark id. */
export const STORE_GREETINGS = {
  campo: 'Everything you carry out that door, you carry to Canada or you throw away in Warner Springs. Choose accordingly.',
  'warner-springs': 'Bucket showers are round the back, hot dogs are two dollars, and the box shelf is alphabetical by trail name, which helps nobody.',
  idyllwild: 'If you are going up San Jacinto today, take the layer. I have had four people come back down without one and all four looked terrible.',
  'big-bear': 'Resupply is aisle two, ice cream is by the register, and no, we cannot hold a mule in the parking lot.',
  wrightwood: 'The hardware store will lend you tools if you ask nicely and bring them back. That is the whole system and it has worked for forty years.',
  'agua-dulce': 'Everything on the shelf came off a truck this morning. Everything in the cooler came off that same truck and is already gone.',
  tehachapi: 'Free camping in the park, half price at the motel if you say you are hiking. The town likes you. Do not make us reconsider.',
  'kennedy-meadows': 'You are about to carry more weight than you ever have. There is a scale by the door and everybody uses it and everybody lies about the number.',
  'tuolumne-meadows': 'Post office is the tent, it shuts at four, and the grill line is forty minutes. Get in the grill line first.',
  'south-lake-tahoe': 'Real gear shop, real prices. If you have been putting off replacing something, this is the last easy place to do it for six hundred miles.',
  'sierra-city': 'The burger across the street is one pound of beef. People buy it to be polite and then find out.',
  'burney-falls': 'Camp store prices, sorry. You are paying for the fact that we are the only door for forty miles.',
  'seiad-valley': 'Pancakes are on the wall, the challenge is on the wall, and the people who beat it are also on the wall. Small wall.',
  'crater-lake': 'There is no water on the rim. I say that eleven times a day and I will say it again on your way out.',
  'timberline-lodge': 'Buffet is until ten thirty. There is no limit. There has never been a limit. Please do not make us invent one.',
  'cascade-locks': 'Bridge toll is fifty cents on foot and they do take it seriously. Welcome to the last state.',
  'white-pass': 'Boxes in the back, beer in the cooler, and a hiker box by the door that is ninety percent instant potatoes.',
  'snoqualmie-pass': 'Everything from here to Stehekin is remote and wet. Buy the fuel now. Buy more fuel than that.',
  stehekin: 'It all came up the lake on a barge, which is why the granola is nine dollars. The bakery is worth the shuttle. Everything is worth the shuttle.',
};

function matches(entry, biome, kind) {
  if (entry.biome && entry.biome !== biome) return false;
  if (entry.kind && entry.kind !== kind) return false;
  return true;
}

/**
 * A line that fits where you are standing. Prefers lines tagged for this
 * biome and landmark kind, then anything generic. Never returns null.
 */
export function talkLine(landmark, rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const biome = landmark?.biome ?? null;
  const kind = landmark?.kind ?? null;

  const specific = TALK.filter((t) => (t.biome || t.kind) && matches(t, biome, kind));
  const generic = TALK.filter((t) => !t.biome && !t.kind);

  // Two thirds of the time take a fitted line if one exists.
  const pool = specific.length && (roll() < 0.66 || !generic.length) ? specific : generic.length ? generic : TALK;
  return pool[Math.floor(roll() * pool.length)];
}

export function storeGreeting(landmark) {
  const id = typeof landmark === 'string' ? landmark : landmark?.id;
  return STORE_GREETINGS[id] || 'Shelves are what they are. Cash or card, and the box shelf is behind you.';
}
