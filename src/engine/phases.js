// Running each kind of phase. Every function appends one phase record to state.phases
// (or adds entries to the latest one) and returns it.

import { renderSegments } from '../core/grammar.js';
import { BUILTIN, ATTRITION_TEXT, SPONSOR_TEXT } from '../data/builtinEvents.js';
import { ITEMS, itemLabel, GIFTABLE } from '../data/items.js';
import { castEvent, eventWeight } from './casting.js';
import { applyOutcome, killTribute } from './effects.js';
import { phaseTarget } from './pacing.js';
import { endgameStrain } from './alliances.js';
import { count, isArmed, mostNeeded, clamp } from './tributes.js';

export function speaker(t) {
  return { id: t.id, name: t.nickname || t.name, gender: t.gender };
}

function newPhase(G, kind, title, intro = '') {
  const phase = { index: G.state.phases.length, kind, day: G.state.day, title, intro, entries: [] };
  G.state.phases.push(phase);
  return phase;
}

function record(G, phase, ev, cast, changes, kind = 'event') {
  const { segments } = renderSegments(ev.text, cast.map(speaker));
  const deaths = cast.filter((t) => !t.alive && t.deathPhase === phase.index).map((t) => t.id);
  const entry = { kind, eventId: ev.id || null, cast: cast.map((t) => t.id), segments, deaths, changes: changes || {} };
  phase.entries.push(entry);
  const entryIndex = phase.entries.length - 1;
  for (const t of cast) t.history.push([phase.index, entryIndex]);
  return entry;
}

/** Fill a phase with events for every participant. */
function runCasting(G, phase, pool, participants, target, opts = {}) {
  const rng = G.rng;
  let waiting = rng.shuffle(participants.filter((t) => t.alive));
  let deaths = 0;
  while (waiting.length) {
    const focus = waiting[0];
    let choice = null;
    const pre = opts.preFiller ? opts.preFiller(focus) : null;
    if (pre) choice = { ev: pre, cast: [focus] };
    else {
      const need = target - deaths;
      const pFatal = need > 0 ? Math.min(0.95, (1.4 * need) / waiting.length) : 0;
      let wantFatal = pool.fatal.length > 0 && rng.chance(pFatal);
      const tried = new Set();
      for (let attempt = 0; attempt < 40 && !choice; attempt++) {
        const list = (wantFatal ? pool.fatal : pool.normal).filter((e) => !tried.has(e.id));
        const ev = rng.weighted(list, (e) => eventWeight(G, e, G.spec(e), focus, { available: waiting.length, need }));
        if (!ev) {
          if (wantFatal) {
            wantFatal = false;
            continue;
          }
          break;
        }
        tried.add(ev.id);
        const cast = castEvent(G, ev, G.spec(ev), focus, waiting, rng);
        if (cast) choice = { ev, cast };
      }
    }
    if (!choice) choice = { ev: opts.filler, cast: [focus] };
    const { ev, cast } = choice;
    const changes = applyOutcome(G, ev, G.spec(ev), cast, phase.title);
    record(G, phase, ev, cast, changes);
    G.state.eventUse[ev.id] = (G.state.eventUse[ev.id] || 0) + 1;
    deaths += cast.filter((t) => !t.alive).length;
    const castIds = new Set(cast.map((t) => t.id));
    waiting = waiting.filter((t) => !castIds.has(t.id) && t.alive);
  }
  return deaths;
}

export function runBloodbath(G) {
  const phase = newPhase(G, 'bloodbath', 'The Bloodbath', 'As the tributes stand on their podiums, the horn sounds.');
  G.phaseKind = 'bloodbath';
  const alive = G.alive();
  const target = phaseTarget(G, 'bloodbath', alive.length);
  const runRate = G.state.settings.cornucopiaRate === 'decreased' ? 0.1 : 0.2;
  runCasting(G, phase, G.events.bloodbath, alive, target, {
    filler: BUILTIN.filler.bloodbath,
    // Some tributes flee without grabbing anything; stealthy and weaker tributes more often.
    preFiller: (t) => (G.rng.chance(runRate * ((t.traits.stealth + 4) / (t.traits.strength + 4))) ? BUILTIN.runAway : null),
  });
  return phase;
}

export function runDayOrNight(G, kind) {
  const title = `${kind === 'day' ? 'Day' : 'Night'} ${G.state.day}`;
  const phase = newPhase(G, kind, title);
  G.phaseKind = kind;
  const alive = G.alive();
  const target = phaseTarget(G, kind, alive.length);
  runCasting(G, phase, G.events[kind], alive, target, { filler: BUILTIN.filler[kind] });
  if (kind === 'night') {
    sponsorDrops(G, phase);
    upkeep(G, phase);
    for (const n of endgameStrain(G, G.rng)) addNote(phase, n.id, { kind: 'bad', text: n.text });
  }
  return phase;
}

function addNote(phase, id, chip) {
  // Alliance break-ups etc. are shown as a small line at the end of the phase.
  let entry = phase.entries.find((e) => e.kind === 'notes');
  if (!entry) {
    entry = { kind: 'notes', cast: [], segments: [], deaths: [], changes: {} };
    phase.entries.push(entry);
  }
  if (!entry.cast.includes(id)) entry.cast.push(id);
  (entry.changes[id] ||= []).push(chip);
}

export function runFeast(G, opts = {}) {
  const phase = newPhase(G, 'feast', 'The Feast', 'The cornucopia is replenished with food, supplies, weapons, and memoirs from the tributes\' families.');
  G.phaseKind = 'feast';
  const alive = G.alive();
  const lowerRate = G.state.settings.cornucopiaRate === 'decreased';
  const attending = [];
  const staying = [];
  for (const t of alive) {
    const need = (t.hunger >= 1 ? 0.15 : 0) + (t.thirst >= 1 ? 0.15 : 0) + (t.conds.injured || t.conds.infected ? 0.2 : 0) + (isArmed(t) ? 0 : 0.1);
    const bold = (t.traits.strength - 5) * 0.03;
    const p = clamp(0.4 + need + bold + (lowerRate ? 0.2 : 0), 0.15, 0.95);
    (G.rng.chance(p) ? attending : staying).push(t);
  }
  if (attending.length === 0 && alive.length) attending.push(staying.shift());
  for (const t of staying) {
    const changes = applyOutcome(G, BUILTIN.skipFeast, G.spec(BUILTIN.skipFeast), [t], phase.title);
    record(G, phase, BUILTIN.skipFeast, [t], changes);
  }
  const target = phaseTarget(G, 'feast', attending.length, opts);
  runCasting(G, phase, G.events.feast, attending, target, { filler: BUILTIN.filler.feast });
  return phase;
}

/** @param {object} arena  parsed arena event {title, survive, fatal} */
export function runArena(G, arena, opts = {}) {
  const phase = newPhase(G, 'arena', 'Arena Event', arena.title);
  phase.arenaId = arena.id;
  G.phaseKind = 'arena';
  const alive = G.alive();
  const target = phaseTarget(G, 'arena', alive.length, opts);
  runCasting(G, phase, { normal: arena.survive, fatal: arena.fatal }, alive, target, { filler: BUILTIN.filler.arena });
  for (const t of G.alive()) t.popularity = clamp(t.popularity + 1, 0, 100);
  return phase;
}

export function runFallen(G) {
  const since = G.state.lastRecap;
  const fallen = G.state.tributes.filter((t) => !t.alive && t.deathPhase >= since).sort((a, b) => b.placement - a.placement);
  const n = fallen.length;
  const phase = newPhase(G, 'fallen', 'Fallen Tributes', `${n} cannon shot${n === 1 ? '' : 's'} can be heard in the distance.`);
  for (const t of fallen) phase.entries.push({ kind: 'fallen', cast: [t.id], segments: [], deaths: [t.id], changes: {} });
  G.state.lastRecap = phase.index;
  return phase;
}

/** Popular tributes get silver parachutes with what they need most. */
function sponsorDrops(G, phase) {
  for (const t of G.alive()) {
    const p = Math.max(0, (t.popularity - 25) / 100) * 0.3;
    if (!G.rng.chance(p)) continue;
    const need = mostNeeded(t);
    const item = need === 'weapon' ? G.rng.pick(['knife', 'sword', 'spear', 'bow', 'axe']) : need;
    t.inventory[item] = (t.inventory[item] || 0) + 1;
    if (ITEMS[item].kind === 'weapon') t.everArmed = true;
    t.sponsorGifts += 1;
    const ev = { id: 'builtin:sponsor', text: SPONSOR_TEXT };
    record(G, phase, ev, [t], { [t.id]: [{ kind: 'good', text: `Sponsor gift: ${itemLabel(item)}` }] }, 'sponsor');
  }
}

/**
 * End of each night: eat and drink from supplies, hunger and thirst build up, wounds fester,
 * medical kits get used. Deaths here only happen after several days without supplies.
 */
function upkeep(G, phase) {
  const rng = G.rng;
  const report = [];
  for (const t of G.alive()) {
    const chips = [];
    if (!t.ateToday) {
      if (count(t, 'food') > 0) {
        t.inventory.food -= 1;
        if (!t.inventory.food) delete t.inventory.food;
        t.hunger = 0;
      } else if (!rng.chance(t.traits.survival * 0.045)) t.hunger += 1;
      else t.hunger = Math.max(0, t.hunger - 1);
    }
    if (!t.drankToday) {
      if (count(t, 'water') > 0) {
        t.inventory.water -= 1;
        if (!t.inventory.water) delete t.inventory.water;
        t.thirst = 0;
      } else if (!rng.chance(0.15 + t.traits.survival * 0.04)) t.thirst += 1;
      else t.thirst = 0;
    }
    let dmg = 0;
    if (t.hunger >= 3) dmg += (t.hunger - 2) * 7;
    if (t.thirst >= 2) dmg += (t.thirst - 1) * 10;
    if (t.conds.infected) dmg += 9;
    if (t.conds.injured) {
      dmg += 3;
      if (!count(t, 'medkit') && rng.chance(0.15)) {
        t.conds.infected = true;
        chips.push({ kind: 'bad', text: 'Wound infected' });
      }
    }
    if ((t.conds.injured || t.conds.infected || t.health - dmg < 45) && count(t, 'medkit') > 0) {
      t.inventory.medkit -= 1;
      if (!t.inventory.medkit) delete t.inventory.medkit;
      t.conds.injured = false;
      t.conds.infected = false;
      t.health = clamp(t.health + 30, 1, 100);
      chips.push({ kind: 'good', text: 'Used medical kit' });
    }
    if (dmg) chips.push({ kind: 'bad', text: `−${dmg} health` });
    if (t.hunger >= 3) chips.push({ kind: 'bad', text: `Starving (${t.hunger} days)` });
    if (t.thirst >= 2) chips.push({ kind: 'bad', text: `Dehydrated (${t.thirst} days)` });
    t.health -= dmg;
    if (!dmg && !t.hunger && !t.thirst && !t.conds.injured && !t.conds.infected) t.health = Math.min(100, t.health + 8 + (count(t, 'campGear') ? 3 : 0));
    t.ateToday = false;
    t.drankToday = false;
    report.push({ t, chips });
  }
  // Deaths, weakest first, never killing the last tribute standing.
  const dying = report.filter((r) => r.t.health <= 0).sort((a, b) => a.t.health - b.t.health);
  for (const r of dying) {
    if (G.aliveCount <= 1) {
      r.t.health = 1;
      continue;
    }
    const t = r.t;
    const cause = t.thirst >= 2 && t.thirst * 10 >= t.hunger * 7 ? 'thirst' : t.hunger >= 3 ? 'hunger' : t.conds.infected ? 'infection' : 'wounds';
    killTribute(G, t, [], phase.title, { id: `builtin:attrition-${cause}` }, cause);
    record(G, phase, { id: `builtin:attrition-${cause}`, text: ATTRITION_TEXT[cause] }, [t], { [t.id]: [{ kind: 'dead', text: 'Eliminated' }] }, 'attrition');
  }
  for (const r of report) {
    if (!r.t.alive) continue;
    r.t.health = clamp(r.t.health, 1, 100);
    for (const c of r.chips) addNote(phase, r.t.id, c);
  }
}

/** District partners (or anyone, by setting) are the last ones left. */
export function endgameApplies(G) {
  const s = G.state;
  if (!s.settings.endgame || !G.events.endgame.length) return false;
  const alive = G.alive();
  if (alive.length < 2) return false;
  if (s.settings.endgameTrigger === 'anyone') return alive.length <= 2;
  return alive.every((t) => t.district === alive[0].district);
}

export function runEndgame(G) {
  const phase = newPhase(G, 'endgame', 'The Finale');
  const alive = G.alive();
  const ev = G.rng.pick(G.events.endgame);
  const { segments } = renderSegments(ev.text, alive.map(speaker));
  const win = G.rng.chance(ev.chance);
  phase.entries.push({ kind: 'endgame', eventId: ev.id, cast: alive.map((t) => t.id), segments, deaths: [], changes: {} });
  phase.entries.push({ kind: 'endgameResult', cast: alive.map((t) => t.id), segments: [{ type: 'text', text: win ? ev.winText : ev.loseText }], deaths: [], changes: {} });
  for (const t of alive) t.history.push([phase.index, 0]);
  if (!win) {
    // Everyone dies together: no victor this year.
    for (const t of alive) killTribute(G, t, [], phase.title, ev, 'endgame');
    phase.entries[1].deaths = alive.map((t) => t.id);
    return { phase, winners: [] };
  }
  return { phase, winners: alive };
}

export function giftableItems() {
  return GIFTABLE.map((id) => ({ id, label: itemLabel(id) }));
}
