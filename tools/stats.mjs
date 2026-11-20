import { newGame, checkInvariants, CAST24, ORIGINAL_EVENTS, smallCast } from '../test/helpers.js';
const N = +(process.argv[2] || 200);
const t0 = Date.now();
let errs = [], lengths = {}, overUnder = {}, bbDeaths = 0, allianceCount = 0, betrayals = 0, kills = 0, sponsor = 0, maxPhases = 0;
const used = new Set();
for (let i = 0; i < N; i++) {
  const g = newGame(`S${i}`);
  g.runToEnd();
  errs.push(...checkInvariants(g));
  const s = g.state;
  lengths[s.day] = (lengths[s.day] || 0) + 1;
  const diff = s.day - s.targetDays; overUnder[diff] = (overUnder[diff] || 0) + 1;
  bbDeaths += s.tributes.filter(t => t.deathPhase === 0).length;
  allianceCount += s.allianceSeq;
  for (const ph of s.phases) for (const e of ph.entries) { if (e.eventId) used.add(e.eventId); for (const cs of Object.values(e.changes)) for (const c of cs) if (c.text === 'Betrayed an ally') betrayals++; }
  kills += s.tributes.reduce((n, t) => n + t.kills, 0);
  sponsor += s.tributes.reduce((n, t) => n + t.sponsorGifts, 0);
  maxPhases = Math.max(maxPhases, s.phases.length);
}
const ms = (Date.now() - t0) / N;
console.log({ games: N, msPerGame: ms.toFixed(1), errors: errs.length, firstErrors: errs.slice(0, 8), endDay: lengths, dayMinusTarget: overUnder, avgBloodbathDeaths: (bbDeaths / N).toFixed(1), alliancesPerGame: (allianceCount / N).toFixed(1), betrayalsPerGame: (betrayals / N).toFixed(2), killsPerGame: (kills / N).toFixed(1), sponsorGiftsPerGame: (sponsor/N).toFixed(1), maxPhases });
const g0 = newGame('X');
const all = [];
for (const p of ['bloodbath','day','night','feast']) all.push(...g0.events[p].normal, ...g0.events[p].fatal);
for (const a of g0.events.arena) all.push(...a.survive, ...a.fatal);
const unused = all.filter(e => !used.has(e.id));
console.log(`events used ${all.length - unused.length}/${all.length}`);
console.log(unused.slice(0, 40).map(e => `  ${e.phase}${e.fatal?' F':''}: ${e.text.slice(0, 90)}`).join('\n'));
