// Checking requirements and preferences, and applying an event's outcome to the tributes.

import { ITEMS, WEAPON_IDS, bestWeapon, itemLabel } from '../data/items.js';
import { PROFILES } from '../data/districts.js';
import { clamp, count, isArmed, isHurt, combatScore } from './tributes.js';
import { addBond, formAlliance, leaveAlliance, sameAlliance } from './alliances.js';
import { DAMAGE_SCALE } from './balance.js';

// ---------------------------------------------------------------- requirements

/** Hard requirement for one tribute (pair requirements are checked in casting). */
export function meetsRequirement(G, r, t) {
  switch (r.type) {
    case 'cond':
      if (r.cond === 'hurt') return isHurt(t);
      return !!t.conds[r.cond];
    case 'has':
      return count(t, r.item) > 0;
    case 'hasWeapon':
      return isArmed(t);
    case 'hasOneOf':
      return r.items.some((i) => count(t, i) > 0);
    case 'hunger':
      return t.hunger >= r.min;
    case 'thirst':
      return t.thirst >= r.min;
    case 'healthBelow':
      return t.health < r.max;
    case 'inAlliance':
      return !!t.allianceId;
    default:
      return true; // pair requirements handled elsewhere
  }
}

/** Soft preference multiplier for one tribute. */
export function prefFactor(G, p, t, spec) {
  switch (p.type) {
    case 'has':
      return count(t, p.item) > 0 ? p.yes : p.no;
    case 'hasAny':
      return Object.values(t.inventory).some((n) => n > 0) ? p.yes : p.no;
    case 'hasOneOf':
      return p.items.some((i) => count(t, i) > 0) ? p.yes : p.no;
    case 'hasWeapon':
      return isArmed(t) ? p.yes : p.no;
    case 'hungry':
      return 0.35 + Math.min(t.hunger, 5) * 0.8;
    case 'thirsty':
      return 0.35 + Math.min(t.thirst, 5) * 0.9;
    case 'noShelter':
      return count(t, 'campGear') ? 0.25 : 2;
    case 'badlyHurt':
      return t.health < 40 ? 4 : t.conds.injured || t.conds.infected ? 1.5 : 0.12;
    case 'combat':
      return combatScore(G, t) / 10;
    case 'distressed':
      return distressFactor(G, t);
    case 'sponsor':
      return (0.2 + t.popularity / 30) * needMatch(G, t, spec, p.who);
    default:
      return 1; // relation-level prefs are applied in casting
  }
}

/** Fear and grief hit hardest when things are already going badly. */
function distressFactor(G, t) {
  let f = 0.5;
  if (t.health < 60) f += 0.6;
  if (t.hunger >= 2) f += 0.4;
  if (t.thirst >= 2) f += 0.4;
  if (t.conds.injured || t.conds.infected) f += 0.4;
  if (!t.allianceId) f += 0.3;
  if (G.state.tributes.some((o) => o !== t && o.district === t.district && !o.alive)) f += 0.6;
  return Math.min(f, 3);
}

/** Sponsors send what a tribute needs: boost gifts that match a need. */
function needMatch(G, t, spec, who) {
  const gains = spec.effects.filter((e) => e.t === 'gain' && e.who === who).map((e) => e.item);
  if (!gains.length) return 1;
  let best = 0.8;
  for (const g of gains) {
    const kind = ITEMS[g]?.kind;
    if (kind === 'food' && t.hunger >= 1) best = Math.max(best, 1 + t.hunger);
    if (kind === 'water' && t.thirst >= 1) best = Math.max(best, 1 + t.thirst * 1.2);
    if (kind === 'medical' && isHurt(t)) best = Math.max(best, 3);
    if ((kind === 'weapon' || kind === 'explosive') && !isArmed(t)) best = Math.max(best, 2.5);
  }
  return best;
}

// ---------------------------------------------------------------- items

const RANDOM_POOLS = {
  bloodbath: [['food', 22], ['water', 20], ['medkit', 10], ['campGear', 10], ['rope', 6], ['weapon', 26], ['fireStarter', 6]],
  feast: [['food', 25], ['water', 20], ['medkit', 25], ['campGear', 8], ['weapon', 17], ['explosives', 5]],
  default: [['food', 28], ['water', 24], ['medkit', 14], ['campGear', 10], ['rope', 6], ['weapon', 14], ['fireStarter', 4]],
};
const RANDOM_WEAPONS = ['knife', 'sword', 'spear', 'axe', 'hatchet', 'mace', 'machete', 'sickle', 'bow', 'trident', 'slingshot'];

function rollItem(G, rng, phaseKind, t) {
  const pool = RANDOM_POOLS[phaseKind] || RANDOM_POOLS.default;
  const pick = rng.weighted(pool, (x) => x[1])[0];
  if (pick !== 'weapon') return pick;
  // District favourite weapons turn up a little more often in their hands.
  const fav = PROFILES[G.state.districts[t.district].profile]?.weapon;
  if (fav && WEAPON_IDS.includes(fav) && rng.chance(0.25)) return fav;
  return rng.pick(RANDOM_WEAPONS);
}

function addItem(t, item, n, chips, verb = '+') {
  t.inventory[item] = (t.inventory[item] || 0) + n;
  if (ITEMS[item]?.kind === 'weapon' || ITEMS[item]?.kind === 'explosive') t.everArmed = true;
  chips.push({ kind: 'good', text: `${verb}${itemLabel(item)}${n > 1 ? ` ×${n}` : ''}` });
}

function removeItem(t, item, n = 1) {
  const have = t.inventory[item] || 0;
  const take = Math.min(have, n);
  if (take <= 0) return 0;
  if (have - take <= 0) delete t.inventory[item];
  else t.inventory[item] = have - take;
  return take;
}

function randomOwnedItem(t, rng) {
  const owned = Object.entries(t.inventory).filter(([, n]) => n > 0).map(([id]) => id);
  return owned.length ? rng.pick(owned) : null;
}

// ---------------------------------------------------------------- outcome

/**
 * Apply an event. Returns per-tribute change chips for the UI.
 * @param {object} G  game context {state, rng, byId, phaseKind}
 * @param {object} ev
 * @param {object} spec  from tagEvent
 * @param {object[]} cast  tributes, cast[0] is Player1
 * @param {string} label  phase label for death records ("Day 2")
 */
export function applyOutcome(G, ev, spec, cast, label) {
  const rng = G.rng;
  const changes = {};
  const chip = (t, c) => (changes[t.id] ||= []).push(c);
  const P = (n) => cast[n - 1];

  // 1. Deaths
  const killers = cast.filter((_, i) => spec.roles[i] === 'killer');
  const dying = cast.filter((_, i) => spec.roles[i] === 'victim' || spec.roles[i] === 'self');
  // Note betrayals and the victims' alliances before anyone dies (dying can dissolve an alliance).
  const betrayers = new Set(killers.filter((k) => dying.some((d) => sameAlliance(G, k.id, d.id))).map((k) => k.id));
  const victimAllies = new Set();
  for (const d of dying) if (d.allianceId) for (const t of G.state.tributes) if (t.alive && t.allianceId === d.allianceId && t.id !== d.id) victimAllies.add(t.id);
  for (const v of dying) {
    killTribute(G, v, killers, label, ev);
    chip(v, { kind: 'dead', text: 'Eliminated' });
  }
  if (killers.length && dying.length) {
    for (const k of killers) {
      k.kills += dying.length;
      k.victims.push(...dying.map((d) => d.id));
      const popGain = 6 * dying.length + (dying.length > 1 ? 4 : 0);
      k.popularity = clamp(k.popularity + popGain, 0, 100);
      chip(k, { kind: 'good', text: dying.length > 1 ? `+${dying.length} kills` : '+1 kill' });
      if (betrayers.has(k.id)) {
        chip(k, { kind: 'bad', text: 'Betrayed an ally' });
        if (k.allianceId) leaveAlliance(G, k.id, 'betrayed');
      }
      // Survivors who were allied to a victim now hate the killer.
      for (const other of victimAllies) if (other !== k.id && G.byId[other].alive) addBond(G, other, k.id, -40);
    }
    // The first killer loots the victims.
    const looter = killers[0];
    if (looter.alive) for (const d of dying) loot(G, looter, d, chip);
  }

  // 2. Event effects
  for (const e of spec.effects) applyEffect(G, e, P, chip, rng);

  // 3. Bookkeeping
  for (const t of cast) if (t.alive && isArmed(t)) t.lastArmedPhase = G.state.phases.length;
  return changes;
}

function loot(G, looter, victim, chip) {
  const lw = bestWeapon(looter.inventory).power;
  const vw = bestWeapon(victim.inventory);
  if (vw.id && vw.power > lw && removeItem(victim, vw.id, 1)) {
    looter.inventory[vw.id] = (looter.inventory[vw.id] || 0) + 1;
    looter.everArmed = true;
    chip(looter, { kind: 'good', text: `Looted ${itemLabel(vw.id)}` });
  }
  for (const item of ['food', 'water', 'medkit', 'explosives']) {
    const n = victim.inventory[item] || 0;
    if (n > 0 && G.rng.chance(0.6)) {
      removeItem(victim, item, n);
      looter.inventory[item] = (looter.inventory[item] || 0) + n;
      chip(looter, { kind: 'good', text: `Looted ${itemLabel(item)}` });
    }
  }
}

function applyEffect(G, e, P, chip, rng) {
  const who = typeof e.who === 'number' ? P(e.who) : null;
  if (who && !who.alive && e.t !== 'pop') return;
  switch (e.t) {
    case 'gain':
      addItem(who, e.item, e.n || 1, { push: (c) => chip(who, c) });
      break;
    case 'ensureItem':
      // Picked up on the spot (Cornucopia events) if they did not already have it.
      if (!count(who, e.item)) addItem(who, e.item, 1, { push: (c) => chip(who, c) });
      break;
    case 'gainRandom': {
      const n = e.n || 1;
      for (let i = 0; i < n; i++) addItem(who, rollItem(G, rng, G.phaseKind, who), 1, { push: (c) => chip(who, c) });
      break;
    }
    case 'lose':
    case 'consume':
      if (removeItem(who, e.item, e.n || 1) && e.t === 'lose') chip(who, { kind: 'bad', text: `−${itemLabel(e.item)}` });
      break;
    case 'loseWeapon': {
      const w = bestWeapon(who.inventory).id;
      if (w && removeItem(who, w, 1)) chip(who, { kind: 'bad', text: `−${itemLabel(w)}` });
      break;
    }
    case 'loseSupplies': {
      let lost = 0;
      for (const item of ['food', 'water', 'medkit', 'campGear', 'fireStarter', 'rope']) lost += removeItem(who, item, 99);
      if (lost) chip(who, { kind: 'bad', text: 'Lost supplies' });
      break;
    }
    case 'transfer': {
      const from = P(e.from);
      const to = P(e.to);
      if (!from?.alive || !to?.alive) break;
      let item = e.item;
      if (item === 'random') item = randomOwnedItem(from, rng);
      else if (item === 'weapon') item = bestWeapon(from.inventory).id;
      if (!item || !removeItem(from, item, 1)) break;
      to.inventory[item] = (to.inventory[item] || 0) + 1;
      if (ITEMS[item]?.kind === 'weapon') to.everArmed = true;
      chip(to, { kind: 'good', text: `+${itemLabel(item)}` });
      chip(from, { kind: 'bad', text: `−${itemLabel(item)}` });
      break;
    }
    case 'hp': {
      const before = who.health;
      const d0 = e.d < 0 ? Math.round(e.d * DAMAGE_SCALE) : e.d;
      // Non-fatal events never kill: the text would not match.
      who.health = clamp(who.health + d0, 1, 100);
      const d = who.health - before;
      if (d) chip(who, { kind: d > 0 ? 'good' : 'bad', text: `${d > 0 ? '+' : '−'}${Math.abs(d)} health${e.reason === 'shaken' ? ' (shaken)' : ''}` });
      break;
    }
    case 'cond':
      if (who.conds[e.cond] !== e.on) {
        who.conds[e.cond] = e.on;
        chip(who, { kind: e.on ? 'bad' : 'good', text: e.on ? capitalize(e.cond) : `No longer ${e.cond}` });
      }
      break;
    case 'cure':
      if (who.conds[e.cond] && rng.chance(e.chance ?? 1)) {
        who.conds[e.cond] = false;
        chip(who, { kind: 'good', text: `No longer ${e.cond}` });
      }
      break;
    case 'eat':
      if (rng.chance(e.chance ?? 1)) {
        if (who.hunger > 0) chip(who, { kind: 'good', text: 'Fed' });
        who.hunger = 0;
        who.ateToday = true;
      }
      break;
    case 'drink':
      if (rng.chance(e.chance ?? 1)) {
        if (who.thirst > 0) chip(who, { kind: 'good', text: 'Found water' });
        who.thirst = 0;
        who.drankToday = true;
      }
      break;
    case 'pop': {
      const before = who.popularity;
      who.popularity = clamp(who.popularity + e.d, 0, 100);
      if (who.alive && who.popularity - before >= 4) chip(who, { kind: 'good', text: 'Crowd favourite ↑' });
      break;
    }
    case 'bond': {
      const a = P(e.a);
      const b = P(e.b);
      if (!a?.alive || !b?.alive) break;
      for (const n of addBond(G, a.id, b.id, e.d)) chip(G.byId[n.id], { kind: 'ally', text: n.text });
      break;
    }
    case 'ally': {
      const ids = e.who.map((n) => P(n)).filter((t) => t?.alive).map((t) => t.id);
      for (const n of formAlliance(G, ids)) chip(G.byId[n.id], { kind: 'ally', text: n.text });
      break;
    }
    case 'leave':
      for (const n of leaveAlliance(G, who.id, 'left')) chip(who, { kind: 'bad', text: n.text });
      break;
    case 'betray': {
      const target = P(e.target);
      if (target && sameAlliance(G, who.id, target.id)) for (const n of leaveAlliance(G, who.id, 'betrayed')) chip(who, { kind: 'bad', text: n.text });
      if (target) addBond(G, who.id, target.id, -60);
      break;
    }
    default:
      break;
  }
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Mark a tribute dead and record how. */
export function killTribute(G, t, killers, label, ev, cause) {
  if (!t.alive) return;
  t.formerAlliance = t.allianceId;
  t.healthAtDeath = t.health;
  t.alive = false;
  t.health = 0;
  t.deathPhase = G.state.phases.length - 1; // the phase being run is already in the list
  t.deathLabel = label;
  t.killedBy = killers.map((k) => k.id);
  t.cause = cause || '';
  t.eventId = ev?.id || null;
  const aliveBefore = G.state.tributes.filter((x) => x.alive).length + 1;
  t.placement = aliveBefore;
  if (t.allianceId) leaveAlliance(G, t.id, 'died');
  G.state.deathsToday += 1;
}
