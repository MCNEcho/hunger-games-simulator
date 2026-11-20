// Win odds: every living tribute gets a strength score from fighting power, survival
// skills, supplies, condition, allies and popularity. Odds are each score's share
// (a softmax), so they always add up to 100%.

import { combatScore, count, allianceSize } from './tributes.js';

// Weights fitted on ~8,500 snapshots from 800 simulated games (tools/fit-odds.mjs), so a
// tribute shown at 10% really does win about one game in ten. Refit after balance changes.
const W = {
  combat: 0.084,
  survival: 0.095,
  stealth: 0.131,
  food: 0.215,
  water: 0.226,
  medkit: 0.193,
  health: 0.918,
  injured: -0.87,
  infected: -2.19,
  hunger: -0.354,
  thirst: -0.246,
  allies: 0.058,
  popularity: 0.156,
};

export function powerScore(G, t) {
  return (
    W.combat * combatScore(G, t) +
    W.survival * t.traits.survival +
    W.stealth * t.traits.stealth +
    W.food * Math.min(count(t, 'food'), 3) +
    W.water * Math.min(count(t, 'water'), 3) +
    W.medkit * Math.min(count(t, 'medkit'), 2) +
    W.health * (t.health / 100) +
    (t.conds.injured ? W.injured : 0) +
    (t.conds.infected ? W.infected : 0) +
    W.hunger * Math.max(0, t.hunger - 2) +
    W.thirst * Math.max(0, t.thirst - 1) +
    W.allies * (allianceSize(G, t) - 1) +
    W.popularity * (t.popularity / 100)
  );
}

/** Update every tribute's odds and append a point to their history. */
export function updateOdds(G) {
  const alive = G.state.tributes.filter((t) => t.alive);
  const scores = alive.map((t) => powerScore(G, t));
  const max = Math.max(...scores, 0);
  const exps = scores.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  const phase = G.state.phases.length;
  for (const t of G.state.tributes) {
    const i = alive.indexOf(t);
    t.odds = i >= 0 ? exps[i] / total : 0;
    const last = t.oddsHistory[t.oddsHistory.length - 1];
    if (!last || last[0] !== phase) t.oddsHistory.push([phase, round4(t.odds)]);
    else last[1] = round4(t.odds);
  }
  if (alive.length === 1) alive[0].odds = 1;
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

/** "12%" and "7–1" style labels. */
export function oddsLabel(p) {
  if (p >= 0.995) return '100%';
  if (p <= 0) return '—';
  const pct = p * 100;
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

export function bettingLine(p) {
  if (p <= 0) return '';
  if (p >= 0.5) return 'Favourite';
  const against = Math.max(1, Math.round((1 - p) / p));
  return `${against}–1`;
}
