// Bonds (-100..100 between any two tributes) and alliances (groups of 2-6 living tributes).
// Allies rarely attack each other, tend to act together, and share in each other's odds.

import { clamp } from './tributes.js';

export const MAX_ALLIANCE = 6;
export const ALLY_THRESHOLD = 60;
export const BREAK_THRESHOLD = -25;
const COLORS = ['#e4572e', '#29a3a3', '#f2a541', '#7b6cf6', '#4caf50', '#e85d9c', '#3d8bfd', '#c49a3a', '#9c6644', '#58b368'];

function key(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getBond(G, a, b) {
  if (a === b) return 100;
  return G.state.bonds[key(a, b)] || 0;
}

export function sameAlliance(G, a, b) {
  const ta = byId(G, a);
  const tb = byId(G, b);
  return !!(ta && tb && ta.allianceId && ta.allianceId === tb.allianceId);
}

function byId(G, id) {
  return G.byId[id];
}

/** Change a bond; may form or break an alliance as a result. Returns notes for the UI. */
export function addBond(G, a, b, d) {
  if (a === b) return [];
  const k = key(a, b);
  G.state.bonds[k] = clamp((G.state.bonds[k] || 0) + d, -100, 100);
  const v = G.state.bonds[k];
  const notes = [];
  const ta = byId(G, a);
  const tb = byId(G, b);
  if (!ta?.alive || !tb?.alive) return notes;
  if (v >= ALLY_THRESHOLD && !sameAlliance(G, a, b)) notes.push(...formAlliance(G, [a, b]));
  else if (v <= BREAK_THRESHOLD && sameAlliance(G, a, b)) {
    // The one who likes the group less walks away.
    const leaver = groupLoyalty(G, ta) <= groupLoyalty(G, tb) ? ta : tb;
    notes.push(...leaveAlliance(G, leaver.id, 'left'));
  }
  return notes;
}

function groupLoyalty(G, t) {
  const a = G.state.alliances.find((x) => x.id === t.allianceId);
  if (!a) return 0;
  return a.members.filter((m) => m !== t.id).reduce((s, m) => s + getBond(G, t.id, m), 0);
}

/**
 * Put the given living tributes into one alliance (joining the biggest existing one among them).
 * @returns {{id: string, text: string}[]} notes per tribute
 */
export function formAlliance(G, ids) {
  const living = [...new Set(ids)].filter((id) => byId(G, id)?.alive);
  if (living.length < 2) return [];
  const notes = [];
  // Target: the largest alliance any of them already belongs to, if it has room.
  const existing = [...new Set(living.map((id) => byId(G, id).allianceId).filter(Boolean))]
    .map((aid) => G.state.alliances.find((x) => x.id === aid))
    .filter(Boolean)
    .sort((x, y) => y.members.length - x.members.length);
  let target = existing.find((a) => a.members.length < MAX_ALLIANCE) || null;
  if (!target) {
    target = { id: `a${++G.state.allianceSeq}`, name: `Alliance ${G.state.allianceSeq}`, color: COLORS[(G.state.allianceSeq - 1) % COLORS.length], members: [], formedPhase: G.state.phases.length };
    G.state.alliances.push(target);
  }
  for (const id of living) {
    const t = byId(G, id);
    if (t.allianceId === target.id) continue;
    if (target.members.length >= MAX_ALLIANCE) break;
    if (t.allianceId) {
      // Leave the old group without tidying up yet: tidying now could drop the new, still-small target.
      const old = G.state.alliances.find((x) => x.id === t.allianceId);
      if (old) old.members = old.members.filter((m) => m !== id);
    }
    target.members.push(id);
    t.allianceId = target.id;
    notes.push({ id, text: `Joined ${target.name}` });
  }
  for (const a of living) for (const b of living) if (a < b && target.members.includes(a) && target.members.includes(b)) {
    const k = key(a, b);
    G.state.bonds[k] = Math.max(G.state.bonds[k] || 0, 50);
  }
  cleanupAlliances(G);
  return notes;
}

/** Remove a tribute from their alliance. reason: 'left' | 'betrayed' | 'died' | 'switched' | 'disbanded' */
export function leaveAlliance(G, id, reason = 'left') {
  const t = byId(G, id);
  if (!t?.allianceId) return [];
  const a = G.state.alliances.find((x) => x.id === t.allianceId);
  t.allianceId = null;
  if (!a) return [];
  a.members = a.members.filter((m) => m !== id);
  const notes = reason === 'died' || reason === 'switched' ? [] : [{ id, text: reason === 'betrayed' ? `Betrayed ${a.name}` : `Left ${a.name}` }];
  if (reason === 'betrayed') for (const m of a.members) addBondRaw(G, id, m, -60);
  cleanupAlliances(G);
  return notes;
}

function addBondRaw(G, a, b, d) {
  const k = key(a, b);
  G.state.bonds[k] = clamp((G.state.bonds[k] || 0) + d, -100, 100);
}

/** Drop dead members and alliances with fewer than two members. */
export function cleanupAlliances(G) {
  for (const a of G.state.alliances) {
    a.members = a.members.filter((m) => byId(G, m)?.alive && byId(G, m).allianceId === a.id);
  }
  for (const a of G.state.alliances) {
    if (a.members.length < 2) {
      for (const m of a.members) byId(G, m).allianceId = null;
      a.members = [];
    }
  }
  G.state.alliances = G.state.alliances.filter((a) => a.members.length >= 2);
}

/**
 * Late in the games, alliances crack. Called once per night.
 * @returns {{id: string, text: string}[]}
 */
export function endgameStrain(G, rng) {
  const alive = G.state.tributes.filter((t) => t.alive);
  const notes = [];
  for (const a of [...G.state.alliances]) {
    // An alliance that contains everyone left must break: only one can win.
    const everyone = a.members.length >= alive.length;
    const p = everyone ? 1 : alive.length <= 3 ? 0.6 : alive.length <= 5 ? 0.3 : alive.length <= 8 ? 0.08 : 0;
    if (p > 0 && rng.chance(p)) {
      const members = [...a.members];
      for (const m of members) {
        leaveAlliance(G, m, 'disbanded');
        notes.push({ id: m, text: `${a.name} broke up` });
      }
      for (const x of members) for (const y of members) if (x < y) addBondRaw(G, x, y, -30);
    }
  }
  cleanupAlliances(G);
  return notes;
}
