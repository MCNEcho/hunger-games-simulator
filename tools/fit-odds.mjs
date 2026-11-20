// Fits the win-odds weights (conditional logit) on simulated games.
import { newGame } from '../test/helpers.js';
import { combatScore, count, allianceSize } from '../src/engine/tributes.js';
import { Game } from '../src/engine/game.js';

export const FEATURES = ['combat', 'survival', 'stealth', 'food', 'water', 'medkit', 'health', 'injured', 'infected', 'hunger', 'thirst', 'allies', 'popularity', 'kills'];
function feats(G, t) {
  return [combatScore(G, t), t.traits.survival, t.traits.stealth, Math.min(count(t, 'food'), 3), Math.min(count(t, 'water'), 3), Math.min(count(t, 'medkit'), 2), t.health / 100, t.conds.injured ? 1 : 0, t.conds.infected ? 1 : 0, Math.max(0, t.hunger - 2), Math.max(0, t.thirst - 1), allianceSize(G, t) - 1, t.popularity / 100, Math.min(t.kills, 6)];
}
const N = +(process.argv[2] || 800);
const samples = []; // {X: [][], y: index}
for (let i = 0; i < N; i++) {
  const g = newGame(`F${i}`);
  const snaps = [];
  const snap = () => { const alive = g.alive(); if (alive.length > 1) snaps.push({ ids: alive.map(t => t.id), X: alive.map(t => feats(g, t)) }); };
  snap();
  while (!g.state.finished) { g.advance(); if (g.rng.chance(0.35)) snap(); }
  const w = g.state.winners;
  if (w.length !== 1) continue;
  for (const s of snaps) samples.push({ X: s.X, y: s.ids.indexOf(w[0]) });
}
// standardize
const D = FEATURES.length;
const mean = Array(D).fill(0), sd = Array(D).fill(0); let cnt = 0;
for (const s of samples) for (const x of s.X) { cnt++; for (let d = 0; d < D; d++) mean[d] += x[d]; }
for (let d = 0; d < D; d++) mean[d] /= cnt;
for (const s of samples) for (const x of s.X) for (let d = 0; d < D; d++) sd[d] += (x[d] - mean[d]) ** 2;
for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d] / cnt) || 1;
const Z = samples.map(s => ({ y: s.y, X: s.X.map(x => x.map((v, d) => (v - mean[d]) / sd[d])) }));
let w = Array(D).fill(0);
const ll = (w) => { let L = 0; for (const s of Z) { const sc = s.X.map(x => x.reduce((a, v, d) => a + v * w[d], 0)); const m = Math.max(...sc); const lse = m + Math.log(sc.reduce((a, v) => a + Math.exp(v - m), 0)); L += sc[s.y] - lse; } return L / Z.length; };
const base = ll(w);
for (let it = 0; it < 300; it++) {
  const g = Array(D).fill(0);
  for (const s of Z) { const sc = s.X.map(x => x.reduce((a, v, d) => a + v * w[d], 0)); const m = Math.max(...sc); const e = sc.map(v => Math.exp(v - m)); const tot = e.reduce((a, b) => a + b, 0);
    for (let j = 0; j < s.X.length; j++) { const p = e[j] / tot; const coef = (j === s.y ? 1 : 0) - p; for (let d = 0; d < D; d++) g[d] += coef * s.X[j][d]; } }
  for (let d = 0; d < D; d++) w[d] += 0.6 * g[d] / Z.length - 0.002 * w[d];
}
console.log(`samples ${Z.length}; avg log-lik uniform ${base.toFixed(4)} -> fitted ${ll(w).toFixed(4)}`);
// convert back to raw-scale weights: score = sum (w_d / sd_d) * x_d  (+const)
const raw = w.map((v, d) => v / sd[d]);
console.log(JSON.stringify(Object.fromEntries(FEATURES.map((f, d) => [f, +raw[d].toFixed(4)]))));
