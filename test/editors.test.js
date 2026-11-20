import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/ui/editors.js';
import { parseCast, exportCast, countTributes } from '../src/io/castFormat.js';
import { parseEvents, exportEvents, countEvents } from '../src/io/eventsFormat.js';
import { CAST36, EVENTS } from './helpers.js';
import { Game } from '../src/engine/game.js';

const total = (c) => c.districts.reduce((n, d) => n + d.tributes.length, 0);

test('blank cast: districts x tributes, alternating pronouns, valid BrantSteele text', () => {
  const c = E.createBlankCast(5, 3);
  assert.equal(c.districts.length, 5);
  assert.equal(total(c), 15);
  assert.deepEqual(c.districts[0].tributes.map((t) => t.gender), [1, 0, 1]);
  const again = parseCast(exportCast(E.finalizeCast(c)));
  assert.equal(countTributes(again), 15);
  assert.deepEqual(again.warnings, []);
  assert.equal(E.createBlankCast(999, 99).districts.length, E.CAST_LIMITS.maxDistricts);
  assert.equal(E.createBlankCast(0, 0).districts[0].tributes.length, 1);
});

test('resize keeps existing tributes and reports how many are removed', () => {
  const draft = E.castToDraft(CAST36);
  const bigger = E.resizeCast(draft, 20, 3);
  assert.equal(bigger.removed, 0);
  assert.equal(bigger.draft.districts.length, 20);
  assert.equal(total(bigger.draft), 60);
  assert.equal(bigger.draft.districts[0].tributes[0].name, CAST36.districts[0].tributes[0].name);
  assert.equal(bigger.draft.districts[19].name, 'District 20');
  const smaller = E.resizeCast(draft, 12, 1);
  assert.equal(smaller.removed, 24);
  assert.equal(total(smaller.draft), 12);
  assert.equal(smaller.draft.districts[11].tributes[0].name, CAST36.districts[11].tributes[0].name);
  assert.equal(total(draft), 36, 'input untouched');
});

test('add/remove/move districts and tributes respect limits', () => {
  let d = E.createBlankCast(2, 2);
  d = E.addDistrict(d, 3);
  assert.equal(d.districts.length, 3);
  assert.equal(d.districts[2].tributes.length, 3);
  d = E.addTribute(d, 0);
  assert.equal(d.districts[0].tributes.length, 3);
  d = E.removeTribute(d, 0, 0);
  assert.equal(d.districts[0].tributes.length, 2);
  d = E.moveTribute(d, 2, 0, 1);
  assert.equal(d.districts[1].tributes.length, 3);
  assert.equal(d.districts[2].tributes.length, 2);
  d = E.removeDistrict(d, 2);
  assert.equal(d.districts.length, 2);
  let one = E.createBlankCast(1, 1);
  one = E.removeTribute(one, 0, 0);
  one = E.removeDistrict(one, 0);
  assert.equal(total(one), 1, 'never removes the last tribute or district');
  let full = E.createBlankCast(1, E.CAST_LIMITS.maxPerDistrict);
  full = E.addTribute(full, 0);
  assert.equal(full.districts[0].tributes.length, E.CAST_LIMITS.maxPerDistrict);
});

test('checkCast catches missing names and too few tributes; warns on duplicates', () => {
  const d = E.createBlankCast(2, 2);
  assert.deepEqual(E.checkCast(d).errors, []);
  d.districts[0].tributes[0].name = '  ';
  d.districts[1].name = '';
  assert.equal(E.checkCast(d).errors.length, 2);
  const dup = E.createBlankCast(1, 2);
  dup.districts[0].tributes[1].name = dup.districts[0].tributes[0].name;
  assert.equal(E.checkCast(dup).warnings.length, 1);
  assert.equal(E.checkCast(E.createBlankCast(1, 1)).errors.length, 1);
});

test('finalize fills nicknames and normalises colours; photos follow names', () => {
  const d = E.createBlankCast(1, 2);
  d.districts[0].color = '#ff8800';
  d.districts[0].tributes[0] = { ...d.districts[0].tributes[0], name: ' Ana Lee ', nickname: '', photo: 'data:image/jpeg;base64,AAA' };
  const f = E.finalizeCast(d);
  assert.equal(f.districts[0].tributes[0].name, 'Ana Lee');
  assert.equal(f.districts[0].tributes[0].nickname, 'Ana');
  assert.equal(f.districts[0].color, '#FF8800 0 0');
  assert.equal(E.normalizeColorLine('#abcdef 1 2'), '#ABCDEF 1 2');
  assert.equal(E.normalizeColorLine('red'), '#FFFFFF 0 0');
  assert.deepEqual(E.photosFromDraft(f), { 'Ana Lee': 'data:image/jpeg;base64,AAA' });
  assert.equal(E.colorInputValue('#FFFFFF 0 0'), '#ffffff');
});

test('a custom cast of odd shape plays a full game', () => {
  let d = E.createBlankCast(3, 3);
  d = E.addDistrict(d, 1);
  d = E.addTribute(d, 3);
  d = E.removeTribute(d, 0, 2);
  const cast = parseCast(exportCast(E.finalizeCast(d)));
  const g = new Game({ cast, events: EVENTS, seed: 'CUSTOM' });
  g.runToEnd();
  assert.ok(g.state.finished);
  assert.equal(g.state.tributes.length, 10);
});

test('event form: builds, validates and describes events', () => {
  const base = E.newEvent('day', false);
  const ok = E.eventFromForm(base, { text: '(Player1) (grabs/grabs/grabs/grabs/grab1) a sword while (Player2) (watches/watches/watches/watches/watch2).', count: 2 });
  assert.deepEqual(ok.errors, []);
  assert.ok(E.describeSpec(ok.spec).includes('Player1 gets sword'));
  assert.match(E.previewText(ok.ev), /^Ana grabs a sword while Ben watches\.$/);
  const bad = E.eventFromForm(base, { text: '(Player1) hugs (Player3).', count: 2 });
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /Player3/);
  const unnamed = E.eventFromForm(base, { text: '(Player1) waves.', count: 2 });
  assert.match(unnamed.errors[0], /Player2/);
  const fatal = E.newEvent('night', true);
  const noVictim = E.eventFromForm(fatal, { text: '(Player1) (kills/kills/kills/kills/kill1) (Player2).', count: 2, killers: [1], killed: [] });
  assert.match(noVictim.errors[0], /nobody killed/);
  const both = E.eventFromForm(fatal, { text: '(Player1) (kills/kills/kills/kills/kill1) (Player2).', count: 2, killers: [1], killed: [1, 2] });
  assert.match(both.errors[0], /both killer and killed/);
  const good = E.eventFromForm(fatal, { text: '(Player1) (kills/kills/kills/kills/kill1) (Player2) with a mace.', count: 2, killers: ['1'], killed: ['2', '5'] });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.ev.killed, [2], 'players outside the count are dropped');
  assert.ok(E.describeSpec(good.spec).some((s) => /mace/.test(s)));
  const dsl = E.eventFromForm(base, { text: '(Player1) (rests/rests/rests/rests/rest1).', count: 1, effectsRaw: 'Player1 +laser' });
  assert.equal(dsl.errors.length, 1);
  const multiline = E.eventFromForm(base, { text: '(Player1)\nwaves.', count: 1 });
  assert.equal(multiline.ev.text, '(Player1) waves.');
});

test('endgame form validation', () => {
  const b = E.newEndgame();
  assert.deepEqual(E.endgameFromForm(b, { text: '[Players] hold hands.', winText: 'Win', loseText: 'Lose', chance: 140 }).ev.chance, 1);
  assert.equal(E.endgameFromForm(b, { text: '(Player1) waves.', winText: 'W', loseText: 'L', chance: 50 }).errors.length, 1);
  assert.equal(E.endgameFromForm(b, { text: '', winText: '', loseText: 'L', chance: 50 }).errors.length, 2);
});

test('an edited events draft round-trips through the BrantSteele format', () => {
  const draft = JSON.parse(JSON.stringify(EVENTS));
  const before = countEvents(draft);
  const added = E.eventFromForm(E.newEvent('day', false), { text: '(Player1) (paints/paints/paints/paints/paint1) a portrait of (Player2).', count: 2 }).ev;
  E.categoryList(draft, 'day:normal').push(added);
  E.categoryList(draft, 'night:fatal').splice(0, 1);
  const arena = E.newArena();
  E.categoryList(draft, 'arena').push(arena);
  E.categoryList(draft, 'endgame').push(E.newEndgame());
  const { events, warnings } = parseEvents(exportEvents(draft));
  assert.deepEqual(warnings, []);
  const after = countEvents(events);
  assert.equal(after.normal, before.normal + 1);
  assert.equal(after.fatal, before.fatal - 1);
  assert.equal(after.arena, before.arena + 1);
  assert.equal(after.endgame, before.endgame + 1);
  assert.ok(events.day.normal.some((e) => e.text.includes('paints')));
  assert.equal(E.CATEGORIES.length, 10);
  assert.equal(E.eventsCount(events), after.normal + after.fatal + after.arena + after.endgame);
});
