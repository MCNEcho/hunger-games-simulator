import { newGame } from '../test/helpers.js';
import { PROFILES } from '../src/data/districts.js';
const N = +(process.argv[2] || 400);
let topQuartileWins = 0, brier = 0, brierUniform = 0, careerWins = 0, careerCount = 0, total = 0;
let winnerPreOdds = 0;
const bins = Array.from({ length: 6 }, () => ({ p: 0, w: 0, n: 0 }));
let popHi = { g: 0, n: 0 }, popLo = { g: 0, n: 0 };
let allyKills = 0, kills = 0;
const profileWins = {};
const profileCount = {};
for (let i = 0; i < N; i++) {
  const g = newGame(`C${i}`);
  const pre = g.state.tributes.map(t => ({ id: t.id, odds: t.odds }));
  pre.sort((a, b) => b.odds - a.odds);
  g.runToEnd();
  const s = g.state;
  const w = s.winners[0];
  if (!w) continue;
  total++;
  const rank = pre.findIndex(p => p.id === w);
  if (rank < pre.length / 4) topQuartileWins++;
  winnerPreOdds += pre[rank].odds;
  for (const p of pre) { const y = p.id === w ? 1 : 0; brier += (p.odds - y) ** 2; brierUniform += (1 / pre.length - y) ** 2; const b = Math.min(5, Math.floor(p.odds * 100 / 2)); bins[b].p += p.odds; bins[b].w += y; bins[b].n++; }
  for (const t of s.tributes) {
    const prof = s.districts[t.district].profile;
    profileCount[prof] = (profileCount[prof] || 0) + 1;
    if (t.id === w) profileWins[prof] = (profileWins[prof] || 0) + 1;
    const startPop = t.oddsHistory.length ? null : null;
    (t.popularity >= 50 ? popHi : popLo).g += t.sponsorGifts; (t.popularity >= 50 ? popHi : popLo).n++;
  }
  // allied kills: from chips
  for (const ph of s.phases) for (const e of ph.entries) for (const cs of Object.values(e.changes)) for (const c of cs) { if (c.text === 'Betrayed an ally') allyKills++; if (/kill/.test(c.text)) kills++; }
}
console.log(`games ${total}`);
console.log(`winner was in pre-game top quarter: ${(100 * topQuartileWins / total).toFixed(1)}% (random would be 25%)`);
console.log(`avg pre-game odds of eventual winner: ${(100 * winnerPreOdds / total).toFixed(2)}% vs uniform ${(100 / 36).toFixed(2)}%`);
console.log(`Brier score ${(brier / total).toFixed(4)} vs uniform ${(brierUniform / total).toFixed(4)} (lower is better)`);
console.log('calibration bins (pre-game odds -> actual win rate):');
for (const b of bins) if (b.n) console.log(`   predicted ${(100 * b.p / b.n).toFixed(1)}%  actual ${(100 * b.w / b.n).toFixed(1)}%  (n=${b.n})`);
console.log('win rate per tribute by district profile:');
for (const k of Object.keys(profileCount)) console.log(`   ${k.padEnd(15)} ${(100 * (profileWins[k] || 0) / profileCount[k] * 1).toFixed(1)}% (uniform 2.8%)`);
console.log(`sponsor gifts per tribute: popularity>=50: ${(popHi.g / popHi.n).toFixed(2)}, <50: ${(popLo.g / popLo.n).toFixed(2)}`);
console.log(`kills that betrayed an ally: ${allyKills}/${kills} = ${(100 * allyKills / kills).toFixed(1)}%`);
