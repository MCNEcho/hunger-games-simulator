// Fills a phase: every living tribute appears in exactly one event.
//
// For each tribute still waiting (the "focus"), we decide whether their event is fatal
// (driven by the pacing target), pick an event that suits them, then cast the other
// roles from the tributes still waiting, weighted by stats, items, alliances and bonds.

import { combatScore, vulnerability, accidentProneness, isArmed } from './tributes.js';
import { hasRanged } from '../data/items.js';
import { meetsRequirement, prefFactor } from './effects.js';
import { getBond, sameAlliance } from './alliances.js';
import { PROFILES } from '../data/districts.js';
import { ITEMS } from '../data/items.js';

const ROLE_ORDER = { killer: 0, victim: 1, self: 1, neutral: 2 };

/** How well tribute t suits role r of an event, ignoring who else is in it. 0 = impossible. */
export function roleFit(G, spec, r, t) {
  const who = r + 1;
  for (const q of spec.requires) if (q.who === who && !meetsRequirement(G, q, t)) return 0;
  let w = 1;
  for (const p of spec.prefs) if (p.who === who) w *= prefFactor(G, p, t, spec);
  const role = spec.roles[r];
  if (role === 'killer') {
    w *= Math.pow(combatScore(G, t) / 10, 1.6);
    if (spec.tags.has('ambush')) w *= t.traits.stealth / 5;
    if (spec.tags.has('strength')) w *= Math.pow(t.traits.strength / 5, 1.2);
    if (spec.tags.has('ranged')) w *= hasRanged(t.inventory) ? 1.8 : 0.7;
    if (spec.tags.has('explosive')) w *= t.traits.stealth / 6 + 0.4;
  } else if (role === 'victim') {
    w *= vulnerability(G, t);
  } else if (role === 'self') {
    w *= accidentProneness(t);
  }
  // District favourite weapons: more likely to pick up the weapon you are trained with.
  const fav = PROFILES[G.state.districts[t.district].profile]?.weapon;
  if (fav && spec.effects.some((e) => e.t === 'gain' && e.who === who && e.item === fav)) w *= 2.2;
  // Unarmed tributes go for weapons, starving ones for food.
  if (spec.effects.some((e) => e.t === 'gain' && e.who === who && ITEMS[e.item]?.kind === 'weapon')) w *= isArmed(t) ? 0.7 : 1.4;
  return w;
}

/** How likely t is to be in role r given the tributes already cast. */
function relationFactor(G, spec, r, t, cast) {
  const role = spec.roles[r];
  const aliveCount = G.aliveCount;
  const coop = spec.tags.has('coop') || spec.effects.some((e) => e.t === 'ally');
  const hostile = spec.tags.has('hostile');
  let w = 1;
  for (let i = 0; i < cast.length; i++) {
    const c = cast[i];
    if (!c) continue;
    const rc = spec.roles[i];
    const allied = sameAlliance(G, t.id, c.id);
    const bond = getBond(G, t.id, c.id);
    const opposed = (role === 'killer' && (rc === 'victim')) || (role === 'victim' && rc === 'killer');
    if (opposed) {
      if (allied) w *= aliveCount <= 3 ? 0.7 : aliveCount <= 6 ? 0.25 : 0.04;
      else if (bond > 30) w *= 0.35;
      else if (bond < -20) w *= 1.8;
    } else if (role === 'killer' && rc === 'killer') {
      w *= allied ? 5 : bond > 20 ? 2 : 0.5;
    } else if ((role === 'victim' || role === 'self') && (rc === 'victim' || rc === 'self')) {
      w *= allied ? 2 : 1;
    } else if (role === 'neutral' && rc === 'neutral') {
      if (coop) w *= allied ? 6 : Math.max(0.25, 1 + bond / 35);
      else if (hostile) w *= allied ? 0.12 : bond < -10 ? 2 : 1;
      else w *= allied ? 1.6 : 1;
    }
  }
  for (const p of spec.prefs) {
    if (p.who !== r + 1) continue;
    if (p.type === 'alliedWithKillers') {
      const ks = cast.filter((c, i) => c && spec.roles[i] === 'killer');
      w *= ks.some((k) => sameAlliance(G, k.id, t.id)) ? 8 : 0.1;
    } else if (p.type === 'allied') {
      const others = p.others.map((n) => cast[n - 1]).filter(Boolean);
      if (others.length) w *= others.every((o) => sameAlliance(G, o.id, t.id)) ? 8 : 0.05;
    }
  }
  for (const q of spec.requires) {
    if ((q.type === 'allied' || q.type === 'notAllied') && (q.who === r + 1 || q.other === r + 1)) {
      const otherIdx = (q.who === r + 1 ? q.other : q.who) - 1;
      const other = cast[otherIdx];
      if (other) {
        const a = sameAlliance(G, t.id, other.id);
        if ((q.type === 'allied') !== a) return 0;
      }
    }
  }
  return w;
}

/**
 * Try to cast an event with `focus` in it. Returns the cast array or null.
 * @param {object[]} available  tributes still waiting this phase (includes focus)
 */
export function castEvent(G, ev, spec, focus, available, rng) {
  const n = ev.count;
  if (n > available.length) return null;
  const cast = new Array(n).fill(null);
  const focusRole = rng.weighted(
    Array.from({ length: n }, (_, r) => r),
    (r) => roleFit(G, spec, r, focus),
  );
  if (focusRole === undefined) return null;
  cast[focusRole] = focus;
  const order = Array.from({ length: n }, (_, r) => r)
    .filter((r) => r !== focusRole)
    .sort((a, b) => ROLE_ORDER[spec.roles[a]] - ROLE_ORDER[spec.roles[b]]);
  const used = new Set([focus.id]);
  for (const r of order) {
    const pool = available.filter((t) => !used.has(t.id));
    const pick = rng.weighted(pool, (t) => roleFit(G, spec, r, t) * relationFactor(G, spec, r, t, cast));
    if (!pick) return null;
    cast[r] = pick;
    used.add(pick.id);
  }
  // Focus's own relation check now that everyone is cast (e.g. an ally cast as their victim).
  const focusRel = relationFactor(G, spec, focusRole, focus, cast.map((c, i) => (i === focusRole ? null : c)));
  if (focusRel <= 0) return null;
  if (focusRel < 1 && rng.next() > focusRel) return null;
  return cast;
}

/** Base weight of an event for this focus before casting. */
export function eventWeight(G, ev, spec, focus, opts) {
  let w = 1;
  if (ev.count > 4) w *= 0.55;
  if (ev.count > 1 && opts.available < ev.count) return 0;
  // Variety: events already used this game become less likely.
  const used = G.state.eventUse[ev.id] || 0;
  w *= Math.pow(0.55, used);
  if (ev.fatal) {
    const deaths = ev.killed.length;
    if (deaths >= G.aliveCount) return 0; // somebody must survive
    const need = Math.max(1, opts.need);
    if (deaths > need) w *= Math.pow(0.2, deaths - need);
    if (deaths > 1) w *= 0.7;
  }
  // Events that need something specific of their focus: check quickly.
  if (spec.requires.length || spec.prefs.length) {
    let best = 0;
    for (let r = 0; r < ev.count; r++) best = Math.max(best, roleFit(G, spec, r, focus));
    w *= ev.fatal ? Math.min(best, 3) : Math.min(best, 6);
    // Due events (a starving tribute's "dies from hunger") should actually happen.
    if (spec.requires.length && best > 0) w *= ev.fatal ? 3 : 2.5;
  }
  return w;
}
