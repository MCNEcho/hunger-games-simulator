import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, checkInvariants, CAST24, ORIGINAL_EVENTS, EVENTS, smallCast } from './helpers.js';
import { Game } from '../src/engine/game.js';
import { tagEvent, normalize } from '../src/engine/tagger.js';
import { meetsRequirement } from '../src/engine/effects.js';
import { parseEvents } from '../src/io/eventsFormat.js';
import { Rng } from '../src/core/rng.js';

function runMany(n, prefix, opts) {
  const problems = [];
  const games = [];
  for (let i = 0; i < n; i++) {
    const g = newGame(`${prefix}${i}`, opts);
    g.runToEnd();
    problems.push(...checkInvariants(g));
    games.push(g);
  }
  return { problems, games };
}

test('500 games with the 36-person cast obey every rule', () => {
  const { problems } = runMany(500, 'A');
  assert.deepEqual(problems.slice(0, 10), []);
});

test('games end in 7-10 days for the standard length (at least 93%)', () => {
  const { games } = runMany(300, 'L');
  const inRange = games.filter((g) => g.state.day >= 7 && g.state.day <= 10).length;
  assert.ok(inRange / games.length >= 0.93, `only ${inRange}/${games.length} in range`);
  assert.ok(games.every((g) => g.state.day <= 14));
});

test('short and long lengths shift the game length', () => {
  const short = runMany(100, 'SH', { settings: { length: 'short' } }).games.map((g) => g.state.day);
  const long = runMany(100, 'LG', { settings: { length: 'long' } }).games.map((g) => g.state.day);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(short) >= 3.5 && avg(short) <= 7, `short avg ${avg(short)}`);
  assert.ok(avg(long) >= 10.5 && avg(long) <= 15, `long avg ${avg(long)}`);
});

test('the original BrantSteele cast and event files work', () => {
  const { problems } = runMany(150, 'O', { cast: CAST24, events: ORIGINAL_EVENTS });
  assert.deepEqual(problems.slice(0, 10), []);
});

test('tiny casts (2 to 5 tributes) and odd numbers finish correctly', () => {
  for (const n of [2, 3, 4, 5, 7]) {
    const { problems } = runMany(40, `T${n}-`, { cast: smallCast(n) });
    assert.deepEqual(problems.slice(0, 5), [], `cast of ${n}`);
  }
});

test('a cast of 60 works', () => {
  const { problems } = runMany(20, 'BIG', { cast: smallCast(60) });
  assert.deepEqual(problems.slice(0, 5), []);
});

test('works with an events file containing only one section', () => {
  const { events } = parseEvents('Day Events\n(Player1) (waves/waves/waves/waves/wave1).\n1\n');
  const { problems } = runMany(30, 'MIN', { events });
  assert.deepEqual(problems.slice(0, 5), []);
});

test('settings: arena events off, feast off, endgame off', () => {
  const { games, problems } = runMany(60, 'SET', { settings: { arenaFrequency: 'off', feast: false, endgame: false } });
  assert.deepEqual(problems.slice(0, 5), []);
  for (const g of games) {
    assert.ok(!g.state.phases.some((p) => p.kind === 'arena' || p.kind === 'feast' || p.kind === 'endgame'));
    assert.equal(g.state.winners.length, 1);
  }
});

test('arena events happen with default settings, and more often on "often"', () => {
  const count = (games) => games.reduce((n, g) => n + g.state.phases.filter((p) => p.kind === 'arena').length, 0) / games.length;
  const normal = count(runMany(80, 'AR', {}).games);
  const often = count(runMany(80, 'AO', { settings: { arenaFrequency: 'often' } }).games);
  assert.ok(normal >= 1, `normal ${normal}`);
  assert.ok(often > normal, `often ${often} vs ${normal}`);
});

test('the same game code gives the same game', () => {
  const a = newGame('SAME-1');
  const b = newGame('SAME-1');
  a.runToEnd();
  b.runToEnd();
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  const c = newGame('SAME-2');
  c.runToEnd();
  assert.notEqual(JSON.stringify(c.state.phases), JSON.stringify(a.state.phases));
});

test('saving and loading mid-game continues identically', () => {
  for (const seed of ['SAVE-1', 'SAVE-2', 'SAVE-3']) {
    const a = newGame(seed);
    const b = newGame(seed);
    for (let i = 0; i < 7; i++) {
      a.advance();
      b.advance();
    }
    const restored = Game.fromSave(b.toSave());
    a.runToEnd();
    restored.runToEnd();
    assert.equal(JSON.stringify(restored.state), JSON.stringify(a.state), seed);
  }
  assert.throws(() => Game.fromSave('{"v":99}'));
});

test('odds always add up to 100% and dead tributes have 0', () => {
  const g = newGame('ODDS');
  const sum = () => g.state.tributes.reduce((n, t) => n + t.odds, 0);
  assert.ok(Math.abs(sum() - 1) < 1e-9);
  while (!g.state.finished) {
    g.advance();
    // Odds add up to 100% while anyone is alive (an endgame loss can leave nobody).
    if (g.aliveCount) assert.ok(Math.abs(sum() - 1) < 1e-6, `sum ${sum()}`);
    else assert.equal(sum(), 0);
    for (const t of g.state.tributes) if (!t.alive) assert.equal(t.odds, 0);
  }
});

test('stats matter: the pre-game top quarter wins well above 25% of games', () => {
  let top = 0;
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const g = newGame(`Q${i}`);
    const ranked = [...g.state.tributes].sort((a, b) => b.odds - a.odds).map((t) => t.id);
    g.runToEnd();
    if (g.state.winners.length !== 1) continue;
    n++;
    if (ranked.indexOf(g.state.winners[0]) < ranked.length / 4) top++;
  }
  assert.ok(top / n > 0.32, `top quarter won ${top}/${n}`);
});

test('allies rarely kill each other and alliances do form', () => {
  const { games } = runMany(150, 'AL');
  let betrayals = 0;
  let kills = 0;
  let alliances = 0;
  for (const g of games) {
    alliances += g.state.allianceSeq;
    kills += g.state.tributes.reduce((n, t) => n + t.kills, 0);
    for (const ph of g.state.phases) for (const e of ph.entries) for (const cs of Object.values(e.changes)) for (const c of cs) if (c.text === 'Betrayed an ally') betrayals++;
  }
  assert.ok(alliances / games.length >= 3, `alliances per game ${alliances / games.length}`);
  assert.ok(betrayals / kills < 0.05, `betrayal share ${betrayals / kills}`);
});

test('popular tributes get more sponsor gifts', () => {
  const { games } = runMany(150, 'POP');
  const hi = { g: 0, n: 0 };
  const lo = { g: 0, n: 0 };
  for (const g of games) for (const t of g.state.tributes) {
    const b = t.popularity >= 50 ? hi : lo;
    b.g += t.sponsorGifts;
    b.n++;
  }
  assert.ok(hi.g / hi.n > 2 * (lo.g / lo.n), `${hi.g / hi.n} vs ${lo.g / lo.n}`);
});

test('Gamemaker: disaster, feast and gift', () => {
  const g = newGame('GM');
  assert.throws(() => g.queueDisaster('random'), /Bloodbath/);
  assert.throws(() => g.sendGift('t0', 'food'));
  g.advance(); // bloodbath
  g.queueDisaster(g.events.arena[3].id);
  assert.equal(g.nextPhaseInfo().kind, 'arena');
  const p1 = g.advance();
  assert.equal(p1.kind, 'arena');
  assert.equal(p1.arenaId, g.events.arena[3].id);
  assert.ok(p1.gamemaker);
  g.queueFeast();
  const p2 = g.advance();
  assert.equal(p2.kind, 'feast');
  const living = g.alive()[0];
  const before = living.inventory.medkit || 0;
  const entry = g.sendGift(living.id, 'medkit');
  assert.equal(living.inventory.medkit, before + 1);
  assert.equal(entry.kind, 'gamemaker');
  assert.equal(g.state.phases[g.state.phases.length - 1].entries.at(-1), entry);
  const deadOne = g.state.tributes.find((t) => !t.alive);
  if (deadOne) assert.throws(() => g.sendGift(deadOne.id, 'food'), /not alive/);
  assert.throws(() => g.sendGift(living.id, 'laser'), /Unknown item/);
  g.queueDisaster('random');
  g.cancelPending('disaster');
  assert.notEqual(g.nextPhaseInfo().kind, 'arena');
  g.runToEnd();
  assert.deepEqual(checkInvariants(g), []);
  assert.throws(() => g.queueFeast());
});

test('Gamemaker spam (disaster every phase) still ends cleanly', () => {
  for (let i = 0; i < 20; i++) {
    const g = newGame(`SPAM${i}`);
    g.advance();
    let guard = 0;
    while (!g.state.finished && guard++ < 200) {
      if (guard % 2) g.queueDisaster('random');
      else g.queueFeast();
      const alive = g.alive();
      if (alive.length) g.sendGift(alive[guard % alive.length].id, 'explosives');
      g.advance();
    }
    assert.ok(g.state.finished);
    assert.deepEqual(checkInvariants(g), []);
  }
});

test('reaping: traits follow district profiles, rerolls and edits work', () => {
  const g = newGame('REAP');
  const prof = (k) => g.state.tributes.filter((t) => g.state.districts[t.district].profile === k);
  const avg = (ts, trait) => ts.reduce((n, t) => n + t.traits[trait], 0) / ts.length;
  // With 36 tributes the samples are small; compare over many reaping seeds instead.
  let masonryStr = 0;
  let techStr = 0;
  for (let i = 0; i < 60; i++) {
    const h = newGame(`RP${i}`);
    const m = h.state.tributes.filter((t) => h.state.districts[t.district].profile === 'masonry');
    const te = h.state.tributes.filter((t) => h.state.districts[t.district].profile === 'technology');
    masonryStr += avg(m, 'strength');
    techStr += avg(te, 'strength');
  }
  assert.ok(masonryStr / 60 > techStr / 60 + 2, `${masonryStr / 60} vs ${techStr / 60}`);
  assert.ok(prof('masonry').length === 2);
  for (const t of g.state.tributes) {
    for (const v of Object.values(t.traits)) assert.ok(v >= 1 && v <= 10);
    assert.ok(t.training >= 1 && t.training <= 12);
  }
  const t0 = g.state.tributes[0];
  g.setTraits(t0.id, { strength: 10, stealth: 10, survival: 10, charisma: 10 });
  assert.equal(t0.traits.strength, 10);
  assert.ok(t0.training >= 10);
  g.setTraits(t0.id, { strength: 99, stealth: -5, survival: 5, charisma: 5 }, 40);
  assert.equal(t0.traits.strength, 10);
  assert.equal(t0.traits.stealth, 1);
  assert.equal(t0.training, 12);
  const before = JSON.stringify(g.state.tributes.map((t) => t.traits));
  g.rerollTraits();
  assert.notEqual(JSON.stringify(g.state.tributes.map((t) => t.traits)), before);
  g.setDistrictProfile(17, 'masonry');
  assert.equal(g.state.districts[17].profile, 'masonry');
  assert.throws(() => g.setDistrictProfile(0, 'nope'));
  g.advance();
  assert.throws(() => g.rerollTraits(), /already started/);
});

test('districts beyond 13 default to Outlying, 1-13 to the canon industries', () => {
  const g = newGame('DIST');
  assert.equal(g.state.districts[0].profile, 'luxury');
  assert.equal(g.state.districts[3].profile, 'fishing');
  assert.equal(g.state.districts[12].profile, 'graphite');
  assert.equal(g.state.districts[13].profile, 'outlying');
});

test('tagger: key readings', () => {
  const ev = (text, count, extra = {}) => ({ text, count, fatal: false, killers: [], killed: [], phase: 'day', ...extra });
  const s1 = tagEvent(ev('(Player1) (shoves/shoves/shoves/shoves/shove1) (Player2) out of the way to grab a machete.', 2));
  assert.deepEqual(s1.effects.find((e) => e.t === 'gain'), { t: 'gain', who: 1, item: 'machete', n: 1 });
  const s2 = tagEvent(ev("(Player1) (tends/tends/tends/tends/tend1) to (Player2)'s wounds.", 2));
  assert.deepEqual(s2.requires, [{ type: 'cond', who: 2, cond: 'hurt' }]);
  const s3 = tagEvent(ev('(Player1) (dies/dies/dies/dies/die1) from hunger.', 1, { fatal: true, killed: [1] }));
  assert.deepEqual(s3.requires, [{ type: 'hunger', who: 1, min: 4 }]);
  assert.deepEqual(s3.roles, ['self']);
  const s4 = tagEvent(ev('(Player1) (grabs/grabs/grabs/grabs/grab1) a backpack, not realizing it is empty.', 1));
  assert.equal(s4.effects.length, 0);
  const s5 = tagEvent(ev('(Player1) (finds/finds/finds/finds/find1) a bow, but no arrows.', 1));
  assert.equal(s5.effects.filter((e) => e.t === 'gain').length, 0);
  const s6 = tagEvent(ev('(Player1), (Player2), and (Player3) form an alliance in the middle of the chaos.', 3));
  assert.deepEqual(s6.effects, [{ t: 'ally', who: [1, 2, 3] }]);
  const s7 = tagEvent(ev('(Player1) (decapitates/decapitates/decapitates/decapitates/decapitate1) (Player2) with a sword.', 2, { fatal: true, killers: [1], killed: [2] }));
  assert.equal(s7.prefs[0].item, 'sword');
  assert.deepEqual(s7.roles, ['killer', 'victim']);
  const s8 = tagEvent(ev('(Player1) (grabs/grabs/grabs/grabs/grab1) a jar of fishing bait while (Player2) (gets/gets/gets/gets/get2) fishing gear.', 2));
  assert.deepEqual(s8.effects.filter((e) => e.t === 'gain').map((e) => e.who), [1, 2]);
  assert.equal(normalize('[TypeA2] (is/is/are/is/are2)'), '#a2 is');
});

test('tagger: explicit Requires/Effects lines override guesses', () => {
  const s = tagEvent({ text: '(Player1) (hums/hums/hums/hums/hum1).', count: 1, fatal: false, killers: [], killed: [], phase: 'day', requiresRaw: 'Player1 has medkit', effectsRaw: 'Player1 +sword; Player1 heal 20; Player1 -injured' });
  assert.deepEqual(s.requires, [{ type: 'has', who: 1, item: 'medkit' }]);
  assert.deepEqual(s.effects, [{ t: 'gain', who: 1, item: 'sword', n: 1 }, { t: 'hp', who: 1, d: 20 }, { t: 'cond', who: 1, cond: 'injured', on: false }]);
  const bad = tagEvent({ text: '(Player1) x.', count: 1, fatal: false, killers: [], killed: [], phase: 'day', effectsRaw: 'Player9 +sword; Player1 +laser' });
  assert.equal(bad.effects.length, 0);
  assert.equal(bad.errors.length, 1);
});

test('every event in both files can be tagged without errors', () => {
  for (const events of [EVENTS, ORIGINAL_EVENTS]) {
    const all = [];
    for (const p of ['bloodbath', 'day', 'night', 'feast']) all.push(...events[p].normal, ...events[p].fatal);
    for (const a of events.arena) all.push(...a.survive, ...a.fatal);
    for (const e of all) {
      const s = tagEvent(e);
      assert.deepEqual(s.errors, []);
      assert.equal(s.roles.length, e.count);
    }
  }
});

test('requirements: a "tends to wounds" event only casts a hurt patient', () => {
  const g = newGame('REQ');
  const t = g.state.tributes[0];
  const r = { type: 'cond', who: 2, cond: 'hurt' };
  assert.equal(meetsRequirement(g, r, t), false);
  t.health = 60;
  assert.equal(meetsRequirement(g, r, t), true);
});

test('rng: weighted never picks zero-weight items and is reproducible', () => {
  const r = new Rng('x');
  for (let i = 0; i < 1000; i++) assert.notEqual(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1)), 'b');
  assert.equal(r.weighted(['a'], () => 0), undefined);
  const a = new Rng('seed');
  const b = new Rng('seed', a.getState());
  assert.equal(a.next(), b.next());
});

test('shuffling: traits belong to the person and their district, not to the slot', async () => {
  const { shuffleCast } = await import('../src/io/castFormat.js');
  const { CAST36: cast } = await import('./helpers.js');
  const shuffled = shuffleCast(cast, new Rng('mix'));
  const a = new Game({ cast, events: EVENTS, seed: 'SAME' });
  const b = new Game({ cast: shuffled, events: EVENTS, seed: 'SAME' });
  const byName = (g) => Object.fromEntries(g.state.tributes.map((t) => [t.name, t]));
  const A = byName(a);
  const B = byName(b);
  let sameProfileChecked = 0;
  for (const name of Object.keys(A)) {
    const pa = a.state.districts[A[name].district].profile;
    const pb = b.state.districts[B[name].district].profile;
    if (pa === pb) {
      assert.deepEqual(B[name].traits, A[name].traits, `${name} keeps traits in an equivalent district`);
      sameProfileChecked++;
    }
  }
  assert.ok(sameProfileChecked > 0);
  // Slots no longer hand their stat line to whoever moves in.
  const slotTraits = (g) => g.state.tributes.map((t) => JSON.stringify(t.traits));
  const same = slotTraits(a).filter((x, i) => x === slotTraits(b)[i]).length;
  assert.ok(same < 30, `${same} of 36 slots kept identical traits`);
  b.runToEnd();
  assert.deepEqual(checkInvariants(b), []);
});

test('mental strain: sanity, nightmares and grief cost health and suit struggling tributes', async () => {
  const ev = (text, count = 1) => tagEvent({ text, count, fatal: false, killers: [], killed: [], phase: 'night' });
  const cases = [
    ['(Player1) (questions/questions/questions/questions/question1) [typeC1] sanity.', -6],
    ['(Player1) (is/is/is/is/are1) awoken by nightmares.', -5],
    ['(Player1) (cries/cries/cries/cries/cry1) [typeD1] to sleep.', -4],
    ['(Player1) (stays/stays/stays/stays/stay1) awake all night.', -3],
    ['(Player1) (has/has/have/has/have1) a panic attack.', -4],
  ];
  for (const [text, d] of cases) {
    const s = ev(text);
    assert.deepEqual(s.effects.filter((e) => e.t === 'hp'), [{ t: 'hp', who: 1, d, reason: 'shaken' }], text);
    assert.ok(s.tags.has('distress'));
  }
  const hears = ev('(Player1) (hears/hears/hears/hears/hear1) (Player2) crying in the distance.', 2);
  assert.equal(hears.effects.find((e) => e.t === 'hp').who, 2, 'the one crying is shaken, not the listener');
  assert.equal(ev('(Player1) (thinks/thinks/thinks/thinks/think1) about home.').effects.length, 0);
  // Applying it: health drops (never to zero), with a "shaken" chip.
  const g = newGame('SHAKEN');
  g.advance();
  const t = g.alive()[0];
  const before = t.health;
  const { applyOutcome } = await import('../src/engine/effects.js');
  const qe = { id: 'x', text: cases[0][0], count: 1, fatal: false, killers: [], killed: [], phase: 'night' };
  const ch = applyOutcome(g, qe, tagEvent(qe), [t], 'Night 1');
  assert.equal(t.health, Math.max(1, before - 6));
  assert.match(ch[t.id][0].text, /health \(shaken\)/);
  // Struggling tributes are more likely to be cast in these events.
  const { prefFactor } = await import('../src/engine/effects.js');
  const p = { type: 'distressed', who: 1 };
  const calm = prefFactor(g, p, { ...t, health: 100, hunger: 0, thirst: 0, conds: {}, allianceId: 'a1', district: t.district }, null);
  const rough = prefFactor(g, p, { ...t, health: 40, hunger: 3, thirst: 2, conds: { injured: true }, allianceId: null, district: t.district }, null);
  assert.ok(rough > calm * 2, `${rough} vs ${calm}`);
});
