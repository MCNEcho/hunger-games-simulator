// Reads an event's wording and works out what it means for the tributes involved:
// which items change hands, who gets hurt or healed, who bonds or betrays, what an
// event needs to make sense (hard requirements) and who it suits (soft preferences).
//
// The result ("spec") is pure data, computed once per event and cached.
//   roles[i]   'killer' | 'victim' | 'self' (dies with no killer) | 'neutral'  for Player i+1
//   requires   hard requirements: the event is never cast unless they hold
//   prefs      soft preferences: multiply how likely a tribute is to be cast
//   effects    state changes applied after the event happens
//   tags       Set of strings: coop, hostile, sponsor, forage, ambush, strength, ...

import { parseRequires, parseEffects } from './dsl.js';
import { DESPAIR_HEALTH } from './balance.js';

export const STARVE_DAYS = 4; // "dies from hunger" needs this many days without food
export const DEHYDRATE_DAYS = 3; // "dies from thirst" needs this many days without water

/** Template -> lower-case text with @N for players and #a1/#b1/#c1/#d1 for pronouns. */
export function normalize(text) {
  return String(text)
    .replace(/\(Player(\d+)\)/g, '@$1')
    .replace(/\(([^()]*\/[^()]*?)(\d+)\)/g, (_, forms) => forms.split('/')[0])
    .replace(/\[(?:type|Type)([A-D])(\d+)\]/g, (_, l, n) => `#${l.toLowerCase()}${n}`)
    .toLowerCase();
}

// Order matters: more specific words first.
const LEXICON = [
  [/crossbow/, 'crossbow'],
  [/\bbows?\b|\barchery\b/, 'bow'],
  [/throwing knives|\bknives\b|\bknife\b/, 'knife'],
  [/wooden spear/, 'crudeSpear'],
  [/\bspears?\b/, 'spear'],
  [/trident/, 'trident'],
  [/\bmace\b/, 'mace'],
  [/\baxe\b/, 'axe'],
  [/hatchet/, 'hatchet'],
  [/machete/, 'machete'],
  [/sickle/, 'sickle'],
  [/\bsais\b/, 'sais'],
  [/slingshot/, 'slingshot'],
  [/blowgun|blow ?darts?/, 'blowgun'],
  [/\bwhip\b/, 'whip'],
  [/brass knuckles/, 'knuckles'],
  [/shovel/, 'shovel'],
  [/\bstaff\b/, 'staff'],
  [/\bswords?\b/, 'sword'],
  [/shield/, 'shield'],
  [/explosives?|\bbombs?\b/, 'explosives'],
  [/alcohol and a rag|molotov/, 'molotov'],
  [/first aid|medical supplies|medkit|medicine|painkillers|bandages/, 'medkit'],
  [/canteen|\bwater\b|iodine/, 'water'],
  [/\bfood\b|bread|fruit|\bnuts\b|apples|\bmeat\b|soup|chocolate|\bmeal\b|grape|rations|dried/, 'food'],
  [/camping equipment|\btent\b|sleeping bag|blanket|\bcoat\b|dry clothing|boots/, 'campGear'],
  [/\brope\b|\bwire\b/, 'rope'],
  [/lighter|matches/, 'fireStarter'],
  [/fishing|hooks|\bnet\b/, 'fishingGear'],
  [/goggles/, 'goggles'],
  [/climbing gear/, 'climbingGear'],
  [/\bmap\b/, 'map'],
];

const CONTAINER_RE = /^\s*(?:a|an|the|two|three|some|#c\d|@\d's)?\s*(?:[\w-]+\s+){0,2}?(backpacks?|bags?|crates?|supplies|stash of supplies|everything|sponsor gift|gift)\b/;
const ACQUIRE_RE = /\b(grabs?|takes?|finds?|snatch(?:es)?|retrieves?|clutch(?:es)?|gets?|receives?|stuffs?|snags?|pulls?|wrestles?|rips?|collects?|gathers?|claims?)\b|\bruns (?:away|off) with\b|\bescapes with\b/g;
const CRAFT_RE = /\b(makes?|builds?|whittles?|constructs?)\s+(?:a|an)\s+(wooden spear|slingshot|bow)\b/g;
const CLAUSE_END_RE = /[.;!?]| but | while | before | then | that turns| not realizing/;
const NEGATION_RE = /\b(empty|full of rocks|too heavy|catches nothing|rip it in half|exactly what they needed)\b/;

// A weapon named in an event, and the items that count as having it.
const FATAL_WEAPONS = [
  [/crossbow/, ['crossbow']],
  [/\barrows?\b|archery/, ['bow']],
  [/throws a knife|knife|knives/, ['knife']],
  [/\bswords?\b|decapitates/, ['sword']],
  [/\bspears @|\bspear\b/, ['spear', 'crudeSpear']],
  [/trident/, ['trident']],
  [/\bmace\b/, ['mace']],
  [/hatchet/, ['hatchet', 'axe']],
  [/\baxe\b/, ['axe']],
  [/machete/, ['machete']],
  [/sickle/, ['sickle']],
  [/\bsais\b/, ['sais']],
  [/slingshot/, ['slingshot']],
  [/blow ?dart|blowgun/, ['blowgun']],
  [/shovel/, ['shovel']],
  [/with a rope/, ['rope']],
];

const STEALTH_RE = /sneak|silently|ambush|while #a\d is (?:resting|sleeping|asleep)|sleeping|back is turned|off guard|trap|poisons|taints|rigs|snipe|stalk|from a tree|from the treeline|smothers|in the dark|pretends|lures|tricks/;
const STRENGTH_RE = /fight|overpowers|strangles|bashes|duel|tackles|wrestl|fist|snaps|decapitates|crushes|pushes|shoves|throws @|smash|holds @\d down|drowns|gang up|corner|topples|cracks @/;
const RANGED_RE = /arrow|shoots|throws a|snipe|crossbow|slingshot|blow ?dart|from across/;

const COOP_RE = /tell stories|huddle|hold hands|snuggle|truce|\bshares?\b|heart-to-heart|stargaze|keeps? watch while|lets @\d into|tells @\d a secret|trades|teaches|helps @\d up|rescues|pulls @\d out|gives @\d|covers @\d with|covers #b\d with|split a pile|discuss the games|talk about the tributes|whisper about|ghost stories|\bsing songs|rock-paper-scissors|build a fort|split up to search|make eye contact|hold a meeting|debate whether|back to back|brace each other|work together|team up|tends to @|bandages @|comforts @|promise to protect|sleep in shifts|hunt for other tributes|form an alliance|alliance|together|keep each other warm|spend the day spying|whispers to @/;
const ALLY_RE = /form an alliance|agree to team up|claim the cornucopia as their territory|work together|\bteam up\b|promise to protect each other|hunt for other tributes|sleep in shifts|share everything|stand back to back|hold a meeting/;
const HOSTILE_RE = /betray|attacks|stalks|chases|scares|runs away from|steals|diverts|destroys|\bfight\b(?! off)|spies on|pelts|throws a rock|challenges|laughs at|follows @\d's footprints|tracks @|ambush|raid|to confuse|knocks @|shoves @|trips @|dodges a spear thrown by|running away from|defeats|breaks @|hides from|alerting|spying on|catches @\d in a trap|steps on a twig|argue|abandons|sneaks into @|sneaks a peek|staring at|spots @|steal/;
const MEMORABLE_RE = /squirrel|duck|statue|single grape|full of rocks|rabbit hole|wonderland|pillow|delicate dessert|in circles|melted chocolate|picks flowers|ghost stories|\bsings?\b|dances|constellations|snoring|sleepwalks|talks in #c\d sleep/;

const CLAUSE_START_RE = /(?:^|[.;!?]\s+|,?\s+(?:while|but|as|so|then|before|after|until|when)\s+)/g;

function chainAt(text) {
  // "@1, @2, and @3 ..." -> [1, 2, 3]; "#a2 ..." -> [2]; otherwise null
  const m = /^\s*((?:@\d+(?:,\s*and\s+|,\s*|\s+and\s+))*@\d+)/.exec(text);
  if (m) return [...m[1].matchAll(/@(\d+)/g)].map((x) => +x[1]);
  const p = /^\s*#a(\d+)/.exec(text);
  return p ? [+p[1]] : null;
}

/** Who performs the verb at idx: the tribute(s) at the start of its clause. */
function subjectGroupBefore(norm, idx) {
  const before = norm.slice(0, idx);
  let start = 0;
  CLAUSE_START_RE.lastIndex = 0;
  let m;
  while ((m = CLAUSE_START_RE.exec(before))) {
    if (m[0].length === 0) {
      CLAUSE_START_RE.lastIndex++;
      continue;
    }
    // only accept a boundary if a subject follows it
    if (chainAt(before.slice(m.index + m[0].length))) start = m.index + m[0].length;
  }
  const chain = chainAt(before.slice(start));
  if (chain) return chain;
  const first = /@(\d+)/.exec(before);
  return [first ? +first[1] : 1];
}

function clauseAfter(norm, idx) {
  const rest = norm.slice(idx);
  const m = CLAUSE_END_RE.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
}

function itemsIn(clause) {
  const found = [];
  const text = clause.replace(/smoke bomb/g, '');
  for (const [re, id] of LEXICON) if (re.test(text) && !found.includes(id)) found.push(id);
  // "bow" also matches inside "crossbow" lexicon order: drop bow if crossbow found and no other bow word
  if (found.includes('crossbow') && found.includes('bow') && !/\bbows?\b|archery/.test(text.replace(/crossbow/g, ''))) found.splice(found.indexOf('bow'), 1);
  if (found.includes('crudeSpear') && found.includes('spear') && !/\bspears?\b/.test(text.replace(/wooden spear/g, ''))) found.splice(found.indexOf('spear'), 1);
  return found;
}

function amountFor(clause) {
  if (/\b(two|both)\b/.test(clause)) return 2;
  if (/\bthree\b/.test(clause)) return 3;
  if (/as much|bundle|basket|crate|bag full|backpack full|handful/.test(clause)) return 2;
  return 1;
}

/**
 * @param {{text: string, count: number, fatal: boolean, killers: number[], killed: number[], phase: string, requiresRaw?: string, effectsRaw?: string}} ev
 */
export function tagEvent(ev) {
  const norm = normalize(ev.text);
  const n = ev.count;
  const all = Array.from({ length: n }, (_, i) => i + 1);
  const roles = all.map((p) => {
    if (!ev.fatal) return 'neutral';
    if (ev.killers.includes(p)) return 'killer';
    if (ev.killed.includes(p)) return ev.killers.length ? 'victim' : 'self';
    return 'neutral';
  });
  const spec = { roles, requires: [], prefs: [], effects: [], tags: new Set(), errors: [] };
  const eff = (e) => spec.effects.push(e);
  const pref = (p) => spec.prefs.push(p);
  const req = (r) => spec.requires.push(r);
  const tag = (t) => spec.tags.add(t);
  const killers = all.filter((p) => roles[p - 1] === 'killer');
  const firstKiller = killers[0];
  // At the Bloodbath and the Feast the weapons are lying at the Cornucopia: whoever uses one picks it up.
  // Anywhere else, an event that names a weapon only happens to someone who actually has it.
  const atCornucopia = ev.phase === 'bloodbath' || ev.phase === 'feast';
  const needItem = (who, items) => {
    if (atCornucopia) {
      pref({ type: 'hasOneOf', who, items, yes: 3, no: 1 });
      eff({ t: 'ensureItem', who, item: items[0] });
    } else req({ type: 'hasOneOf', who, items });
  };
  const negated = NEGATION_RE.test(norm);

  // ---------- Items gained ----------
  let acquired = false;
  const special = specialCases(norm, { eff, pref, req, tag });
  if (!special.skipAcquire && !negated) {
    ACQUIRE_RE.lastIndex = 0;
    let m;
    while ((m = ACQUIRE_RE.exec(norm))) {
      const verb = m[0];
      if (verb.startsWith('steal')) continue;
      const clause = clauseAfter(norm, m.index + verb.length);
      if (/^\s*(@\d|lost|advantage|stuck|caught|sunburn|nasty|to the|up |a peek)/.test(clause)) continue;
      let items = itemsIn(clause);
      const butNo = /but no (\w+)/.exec(norm.slice(m.index));
      if (butNo) items = items.filter((id) => !itemsIn(butNo[1]).includes(id));
      if (items.includes('bow') && /but no arrows/.test(norm)) items = items.filter((x) => x !== 'bow');
      const subjects = subjectGroupBefore(norm, m.index);
      const amount = amountFor(clause);
      if (items.length) {
        for (const who of subjects) for (const item of items) eff({ t: 'gain', who, item, n: ['food', 'water'].includes(item) ? amount : 1 });
        acquired = true;
        // "rips a mace out of @2's hands" / "wrestles a crossbow away from @2"
        const from = /(?:out of|away from) @(\d)/.exec(clause);
        if (from) for (const item of items) eff({ t: 'lose', who: +from[1], item, n: 1 });
      } else if (CONTAINER_RE.test(clause)) {
        for (const who of subjects) eff({ t: 'gainRandom', who, n: /everything|two bags|three bags/.test(clause) ? 3 : amount });
        acquired = true;
      }
    }
    CRAFT_RE.lastIndex = 0;
    while ((m = CRAFT_RE.exec(norm))) {
      const who = subjectGroupBefore(norm, m.index)[0];
      eff({ t: 'gain', who, item: m[2] === 'wooden spear' ? 'crudeSpear' : m[2] === 'bow' ? 'bow' : 'slingshot', n: 1 });
      acquired = true;
    }
  }
  if (acquired) tag('loot');

  // ---------- Stealing / destroying ----------
  let m;
  const stealRe = /@(\d) steals? (?:from @(\d)|@(\d)'s ([a-z -]+?))(?=\s+(?:while|right|and|before|from)|[.,]|$)/g;
  while ((m = stealRe.exec(norm))) {
    const to = +m[1];
    const from = +(m[2] || m[3]);
    const noun = m[4] || '';
    let item = 'random';
    if (/weapon/.test(noun)) item = 'weapon';
    else if (noun) {
      const ids = itemsIn(noun);
      if (ids.length) item = ids[0];
      else if (!/backpack|bag|supplies/.test(noun)) item = null; // e.g. memoirs: flavour only
    }
    if (item) eff({ t: 'transfer', from, to, item });
    eff({ t: 'bond', a: to, b: from, d: -20 });
    if (item === 'weapon') req({ type: 'hasWeapon', who: from });
    else if (item && item !== 'random' && !atCornucopia) req({ type: 'has', who: from, item });
    else pref({ type: 'hasAny', who: from, yes: 1.6, no: 0.5 });
  }
  if ((m = /@(\d) (?:sneaks into @\d's camp and )?steals #c(\d) (food|water|supplies|weapon)/.exec(norm))) {
    const item = m[3] === 'supplies' ? 'random' : m[3];
    eff({ t: 'transfer', from: +m[2], to: +m[1], item });
    eff({ t: 'bond', a: +m[1], b: +m[2], d: -20 });
    if (m[3] === 'weapon') req({ type: 'hasWeapon', who: +m[2] });
    else if (m[3] !== 'supplies') req({ type: 'has', who: +m[2], item: m[3] });
    else pref({ type: 'hasAny', who: +m[2], yes: 3, no: 0.3 });
  }
  if (/realizes #c\d supplies have been stolen/.test(norm)) {
    eff({ t: 'loseSupplies', who: 1 });
    pref({ type: 'hasAny', who: 1, yes: 2, no: 0.2 });
  }
  if ((m = /covers #b(\d) with a blanket/.exec(norm))) eff({ t: 'hp', who: +m[1], d: 3 });
  if ((m = /@(\d) destroys @(\d)'s supplies/.exec(norm))) {
    eff({ t: 'loseSupplies', who: +m[2] });
    eff({ t: 'bond', a: +m[1], b: +m[2], d: -25 });
  }
  if ((m = /raids? @(\d)'s camp/.exec(norm))) {
    const victim = +m[1];
    eff({ t: 'loseSupplies', who: victim });
    for (const p of all) if (p !== victim) eff({ t: 'gainRandom', who: p, n: 1 });
    tag('loot');
  }
  if ((m = /@(\d) abandons @(\d)/.exec(norm))) {
    eff({ t: 'transfer', from: +m[2], to: +m[1], item: 'random' });
    eff({ t: 'betray', who: +m[1], target: +m[2] });
  }

  // ---------- Food, water, rest ----------
  const forageRe = /goes hunting|\bfish(?:es)?\b(?! for)|catches a rabbit|collects fruit|cracks open a coconut|edible mushrooms|full of eggs|eats some mystery berries|eats it on the spot|take down a wild boar|\bcooks\b|last bit of food|picking berries|snare and catches/;
  if (forageRe.test(norm) && !/catches nothing|empty/.test(norm)) {
    const idx = norm.search(forageRe);
    const group = /share their last bit of food|take down a wild boar/.test(norm) ? all : subjectGroupBefore(norm, idx);
    for (const who of group) eff({ t: 'eat', who });
    tag('forage');
    pref({ type: 'hungry', who: group[0] });
  }
  if (/gives @(\d) some of #c\d food/.test(norm)) {
    const g = /gives @(\d)/.exec(norm);
    eff({ t: 'eat', who: +g[1] });
    eff({ t: 'consume', who: 1, item: 'food' });
    req({ type: 'has', who: 1, item: 'food' });
    pref({ type: 'hungry', who: +g[1] });
  }
  const waterRe = /water source|discovers a river|fresh water spring|bathes in the river|\bdrinks\b(?! from a contaminated)|rainwater/;
  if (waterRe.test(norm) && !ev.fatal) {
    const who = subjectGroupBefore(norm, norm.search(waterRe))[0];
    eff({ t: 'drink', who, chance: /searches for/.test(norm) ? 0.6 : 1 });
    tag('water');
    pref({ type: 'thirsty', who });
  }
  if (/sets up camp|goes to sleep|climbs a tree to rest|tries to sleep|builds a shelter|constructs a shack|discovers a cave|build a fort|starts a fire|huddle|sleep in shifts|wraps #d\d in leaves|snow cave/.test(norm) && !ev.fatal) {
    for (const who of all) eff({ t: 'hp', who, d: 4 });
    tag('rest');
  }
  if (/unable to start a fire and sleeps without warmth|unable to stop shivering/.test(norm)) {
    eff({ t: 'hp', who: 1, d: -5 });
    pref({ type: 'noShelter', who: 1 });
  }

  // ---------- Injuries ----------
  const hurtRules = [
    [/@(\d) injures #d\d/, -15, true],
    [/@(\d) sprains #c\d ankle/, -10, true],
    [/@(\d) is pricked by thorns/, -5, false],
    [/@(\d) is stung by a wasp/, -6, false],
    [/@(\d) gets a nasty sunburn/, -3, false],
    [/@(\d) falls into a shallow pit/, -6, false],
    [/breaks @(\d)'s nose/, -15, false],
    [/defeats @(\d) in a fight, but spares/, -25, true],
    [/attacks @(\d), but #a\d manages to escape/, -10, false],
    [/@(\d) is grazed by a thrown knife/, -8, false],
    [/@(\d) ambushes @\d, but #a\d fights #b\d off/, -10, false],
    [/@(\d) gets stuck in quicksand/, -5, false],
    [/@(\d) loses a shoe/, -3, false],
    [/@(\d) tries to fish in the dark and falls/, -3, false],
    [/@(\d) passes out from exhaustion/, -5, false],
    [/pelts @(\d) with pinecones/, -2, false],
    [/throws a rock at @(\d)/, -4, false],
    [/knocks @(\d) flat/, -5, false],
    [/@\d trips @(\d),/, -3, false],
    [/@(\d) falls into a pit, but/, -5, false],
    [/@(\d) gets caught in @\d's snare/, -6, false],
    [/catches @(\d) in a trap/, -6, false],
  ];
  for (const [re, d, injure] of hurtRules) {
    const h = re.exec(norm);
    if (h) {
      eff({ t: 'hp', who: +h[1], d });
      if (injure) eff({ t: 'cond', who: +h[1], cond: 'injured', on: true });
      tag('hurt');
    }
  }
  if ((m = /@(\d) defeats @(\d) in a fight, but spares/.exec(norm))) {
    eff({ t: 'pop', who: +m[1], d: 8 });
    pref({ type: 'combat', who: +m[1] });
    tag('memorable');
  }

  // ---------- Mental strain: fear, grief and lost sleep cost health ----------
  const distressRules = [
    [/@(\d) questions #c\d sanity/, -6],
    [/@(\d) is awoken by nightmares/, -5],
    [/@(\d) begs for @\d to kill #b\d\. #a\d refuses/, -5],
    [/@(\d) cries #d\d to sleep/, -4],
    [/@(\d) screams for help/, -4],
    [/@(\d) sobs while gripping/, -4],
    [/@(\d) lies awake thinking about everyone/, -4],
    [/@(\d) is kept awake by howling/, -3],
    [/@(\d) stays awake all night/, -3],
    [/@(\d) writes a goodbye letter/, -3],
    [/@(\d) sees a pair of glowing eyes/, -3],
    [/@(\d) panics and runs/, -3],
    [/hears @(\d) crying/, -3],
    [/@(\d) watches the faces of the fallen/, -2],
    [/@(\d) counts the faces in the sky/, -2],
    [/@(\d) loses sight of where/, -2],
  ];
  let distressed = false;
  for (const [re, d] of distressRules) {
    const h = re.exec(norm);
    if (h) {
      eff({ t: 'hp', who: +h[1], d, reason: 'shaken' });
      pref({ type: 'distressed', who: +h[1] });
      distressed = true;
    }
  }
  // Events from other lists that mention the same kinds of distress.
  const generic = /@(\d)[^.]*?\b(sanity|nightmares?|panic attack|breaks? down|breakdown|hysterical|loses #c\d mind|goes insane|traumati[sz]ed)\b/.exec(norm);
  if (!distressed && !ev.fatal && generic) {
    eff({ t: 'hp', who: +generic[1], d: -4, reason: 'shaken' });
    pref({ type: 'distressed', who: +generic[1] });
    distressed = true;
  }
  if (distressed) tag('distress');

  // ---------- Healing ----------
  if ((m = /(?:tends to|cleans and bandages) @(\d)'s wounds/.exec(norm))) {
    const w = +m[1];
    req({ type: 'cond', who: w, cond: 'hurt' });
    eff({ t: 'hp', who: w, d: 25 });
    eff({ t: 'cond', who: w, cond: 'injured', on: false });
    tag('heal');
  }
  if (/tends to #c\d wounds/.test(norm)) {
    req({ type: 'cond', who: 1, cond: 'hurt' });
    eff({ t: 'hp', who: 1, d: 15 });
    eff({ t: 'cure', who: 1, cond: 'injured', chance: 0.5 });
    tag('heal');
  }
  if (/treat #c\d infection/.test(norm)) {
    req({ type: 'cond', who: 1, cond: 'infected' });
    eff({ t: 'cure', who: 1, cond: 'infected', chance: 0.6 });
    tag('heal');
  }
  if ((m = /pulls the stingers out of @(\d)/.exec(norm))) eff({ t: 'hp', who: +m[1], d: 10 });

  // ---------- Environment deaths and other state-driven events ----------
  if (ev.fatal) {
    if (/dies from hunger|starv/.test(norm)) req({ type: 'hunger', who: 1, min: STARVE_DAYS });
    if (/dies from thirst|dehydrat/.test(norm)) req({ type: 'thirst', who: 1, min: DEHYDRATE_DAYS });
    if (/from an infection/.test(norm)) req({ type: 'cond', who: 1, cond: 'infected' });
    if (/bleeds out|untreated injuries/.test(norm)) req({ type: 'cond', who: 1, cond: 'injured' });
    if (/hypothermia|freezes to death in #c\d sleep/.test(norm)) pref({ type: 'noShelter', who: 1 });
    if (/toxic berries|poisonous mushroom/.test(norm)) pref({ type: 'hungry', who: 1 });
    if (/contaminated stream|dysentery/.test(norm)) pref({ type: 'thirsty', who: 1 });
    if (/trying to arm it/.test(norm)) {
      needItem(1, ['explosives']);
      eff({ t: 'consume', who: 1, item: 'explosives' });
    }
  }
  if (/begs for @\d to kill #b\d/.test(norm)) pref({ type: 'badlyHurt', who: 1 });
  if (/turn on their ally @(\d)/.test(norm)) {
    const t = +/turn on their ally @(\d)/.exec(norm)[1];
    for (const k of killers) req({ type: 'allied', who: t, other: k });
    tag('betrayal');
  }

  // ---------- Despair: taking one's own life (or asking to be killed) needs low health ----------
  const despairRe = /suicide|takes? #c\d own life|ends? #c\d (?:own )?life|kills? #d\d\b|begs for @\d to kill #b\d|agree to die|decide to run into the cloud together/;
  if (despairRe.test(norm)) {
    tag('despair');
    let who;
    if ((m = /@(\d) begs for @\d to kill/.exec(norm))) who = [+m[1]];
    else if (/agree to die|decide to run into/.test(norm)) who = all;
    else {
      who = all.filter((p) => roles[p - 1] === 'self' || roles[p - 1] === 'victim');
      if (!who.length) who = [1];
    }
    for (const p of who) req({ type: 'healthBelow', who: p, max: DESPAIR_HEALTH });
  }

  // ---------- Weapons used in fights ----------
  if (ev.fatal && firstKiller) {
    if (/explosive|\bbomb\b/.test(norm) && !/trying to arm/.test(norm)) {
      needItem(firstKiller, ['explosives']);
      eff({ t: 'consume', who: firstKiller, item: 'explosives' });
      tag('explosive');
    } else if (/molotov/.test(norm)) {
      needItem(firstKiller, ['molotov']);
      eff({ t: 'consume', who: firstKiller, item: 'molotov' });
    } else if (!/own weapon|own spear/.test(norm)) {
      for (const [re, items] of FATAL_WEAPONS) {
        if (re.test(norm)) {
          needItem(firstKiller, items);
          break;
        }
      }
    }
    if (STEALTH_RE.test(norm)) tag('ambush');
    if (STRENGTH_RE.test(norm)) tag('strength');
    if (RANGED_RE.test(norm)) tag('ranged');
  } else if (!ev.fatal && !acquired) {
    // Using a weapon in a regular event ("practices archery", "spear fish with a trident").
    if (/practices #c\d archery/.test(norm)) needItem(1, ['bow']);
    else if (/spear fish with a trident/.test(norm)) needItem(1, ['trident']);
    else if (/practices throwing knives/.test(norm)) needItem(1, ['knife']);
  }
  // Events about "their weapon" need one.
  if (/sharpen(?:s|ing) #c\d weapon|loses #c\d weapon|(?:dips|flails) #c\d weapon/.test(norm)) req({ type: 'hasWeapon', who: 1 });
  if ((m = /with #c(\d) own (?:weapon|spear)/.exec(norm))) req({ type: 'hasWeapon', who: +m[1] });
  if (/loses #c\d weapon/.test(norm)) eff({ t: 'loseWeapon', who: 1 });
  if (/(?:uses|guards|hacks)/.test(norm) && ev.fatal) tag('strength');

  // ---------- Alliances and relationships ----------
  if (n >= 2 && COOP_RE.test(norm) && !ev.fatal) tag('coop');
  if (n >= 2 && HOSTILE_RE.test(norm) && !ev.fatal) tag('hostile');
  if (spec.tags.has('coop') && spec.tags.has('hostile')) {
    // Mixed events ("@1 whispers to @2 about a plan to betray @3") are handled by specific rules.
    spec.tags.delete('coop');
    spec.tags.delete('hostile');
    tag('mixed');
  }
  if (!ev.fatal && n >= 2) {
    if (/join #c\d alliance\. #a2 agrees/.test(norm)) eff({ t: 'ally', who: [1, 2] });
    else if (/join #c\d alliance\. #a2 refuses/.test(norm)) eff({ t: 'bond', a: 1, b: 2, d: -12 });
    else if ((m = /kick @(\d) out of their alliance/.exec(norm))) {
      const out = +m[1];
      eff({ t: 'ally', who: all.filter((p) => p !== out) });
      eff({ t: 'leave', who: out });
      for (const p of all) if (p !== out) eff({ t: 'bond', a: p, b: out, d: -30 });
      for (const p of all) if (p !== out) req({ type: 'allied', who: out, other: p });
    } else if ((m = /spying on @(\d)/.exec(norm))) {
      const target = +m[1];
      eff({ t: 'ally', who: all.filter((p) => p !== target) });
    } else if (ALLY_RE.test(norm)) eff({ t: 'ally', who: all });
    else if (spec.tags.has('coop')) {
      for (let a = 1; a <= n; a++) for (let b = a + 1; b <= n; b++) eff({ t: 'bond', a, b, d: 10 });
    } else if (spec.tags.has('hostile')) {
      eff({ t: 'bond', a: 1, b: 2, d: -10 });
    }
  }
  if ((m = /@(\d) sneaks away from #c\d alliance/.exec(norm))) {
    eff({ t: 'leave', who: +m[1] });
    req({ type: 'inAlliance', who: +m[1] });
  }
  if (/debate whether it's time to break up the alliance/.test(norm)) for (const p of all) req({ type: 'allied', who: 1, other: p });
  if ((m = /spying on @(\d)'s alliance/.exec(norm))) req({ type: 'inAlliance', who: +m[1] });
  if ((m = /whispers to @(\d) about a plan to betray @(\d)/.exec(norm))) {
    eff({ t: 'bond', a: 1, b: +m[1], d: 10 });
    eff({ t: 'bond', a: 1, b: +m[2], d: -15 });
  }
  if ((m = /@(\d) hears @(\d) and @(\d) plotting against/.exec(norm))) {
    eff({ t: 'bond', a: +m[1], b: +m[2], d: -20 });
    eff({ t: 'bond', a: +m[1], b: +m[3], d: -20 });
  }
  if ((m = /rumor that @(\d) is planning to betray @(\d)/.exec(norm))) eff({ t: 'bond', a: +m[1], b: +m[2], d: -20 });
  if (/argue/.test(norm) && n >= 2) for (let a = 2; a <= n; a++) eff({ t: 'bond', a: 1, b: a, d: -10 });
  if (ev.fatal && killers.length >= 2) {
    tag('teamKill');
    if (/track down|ambush|gang up|corner|work together|turn on|raid|camp out|push @|hold|sneak into/.test(norm)) eff({ t: 'ally', who: killers });
  }

  // ---------- Popularity ----------
  if (/cameras|for the cameras|flexing|dances for|dance for/.test(norm)) {
    eff({ t: 'pop', who: 1, d: 6 });
    tag('camera');
  }
  const heroIdx = norm.search(/rescues|pulls @\d out|protects|saves|comforts|sacrifices/);
  if (heroIdx >= 0) eff({ t: 'pop', who: subjectGroupBefore(norm, heroIdx)[0], d: 4 });
  if (/triumphantly/.test(norm) && firstKiller) eff({ t: 'pop', who: firstKiller, d: 4 });
  if (MEMORABLE_RE.test(norm)) {
    tag('memorable');
    for (const p of all) if (roles[p - 1] !== 'victim' && roles[p - 1] !== 'self') eff({ t: 'pop', who: p, d: 2 });
  }
  if (/receives .*sponsor|sponsor (?:gift|parachute)|parachute/.test(norm)) {
    tag('sponsor');
    pref({ type: 'sponsor', who: special.sponsorWho || 1 });
    eff({ t: 'pop', who: special.sponsorWho || 1, d: 1 });
  }

  // ---------- Explicit Requires:/Effects: lines override the guesses ----------
  if (ev.requiresRaw) {
    const r = parseRequires(ev.requiresRaw);
    spec.errors.push(...r.errors);
    spec.requires = r.requires;
  }
  if (ev.effectsRaw) {
    const e = parseEffects(ev.effectsRaw);
    spec.errors.push(...e.errors);
    spec.effects = e.effects;
  }
  // Safety: drop anything that refers to a player outside the event.
  const okWho = (w) => w === undefined || (Number.isInteger(w) && w >= 1 && w <= n);
  spec.effects = spec.effects.filter((e) => okWho(e.who && !Array.isArray(e.who) ? e.who : undefined) && okWho(e.a) && okWho(e.b) && okWho(e.from) && okWho(e.to) && okWho(e.target) && (!Array.isArray(e.who) || e.who.every(okWho)));
  spec.requires = spec.requires.filter((r) => okWho(r.who) && okWho(r.other));
  spec.prefs = spec.prefs.filter((p) => okWho(p.who));
  return spec;
}

/** Hand-written readings for phrasings the general rules would get wrong. */
function specialCases(norm, { eff }) {
  const out = { skipAcquire: false, sponsorWho: null };
  let m;
  if ((m = /@(\d) receives a sponsor gift, but @(\d) snatches it/.exec(norm))) {
    eff({ t: 'gainRandom', who: +m[2], n: 1 });
    out.skipAcquire = true;
    out.sponsorWho = +m[1];
  }
  if (/stays at the cornucopia for resources|work together to get as many supplies|team up to grab food, supplies, weapons/.test(norm)) {
    // handled by container rule ("supplies") or here for the cornucopia line
    if (/stays at the cornucopia/.test(norm)) eff({ t: 'gainRandom', who: 1, n: 2 });
  }
  if (/share everything they gathered/.test(norm)) out.skipAcquire = true;
  if ((m = /fight over raw meat, but @(\d) gives up/.exec(norm))) {
    eff({ t: 'gain', who: +m[1] === 1 ? 2 : 1, item: 'food', n: 1 });
    out.skipAcquire = true;
  }
  if (/team up to grab food, supplies, weapons/.test(norm)) {
    for (let p = 1; p <= 4; p++) eff({ t: 'gainRandom', who: p, n: 2 });
    out.skipAcquire = true;
  }
  if ((m = /steals two bags and gives one to @(\d)/.exec(norm))) {
    eff({ t: 'gainRandom', who: 1, n: 1 });
    eff({ t: 'gainRandom', who: +m[1], n: 1 });
    eff({ t: 'bond', a: 1, b: +m[1], d: 15 });
    out.skipAcquire = true;
  }
  if ((m = /grabs a bag of medicine and sprints back to @(\d)/.exec(norm))) {
    eff({ t: 'gain', who: +m[1], item: 'medkit', n: 1 });
    eff({ t: 'bond', a: 1, b: +m[1], d: 15 });
    out.skipAcquire = true;
  }
  if ((m = /shares #c\d last canteen with @(\d)/.exec(norm))) {
    eff({ t: 'drink', who: 1 });
    eff({ t: 'drink', who: +m[1] });
  }
  if (/finds a letter from home|receives a note from home|mysterious key|mysterious locked box|single grape/.test(norm)) {
    out.skipAcquire = true;
  }
  return out;
}
