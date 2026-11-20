import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCast, exportCast, countTributes } from '../src/io/castFormat.js';
import { parseEvents, exportEvents, countEvents } from '../src/io/eventsFormat.js';
import { renderPlain } from '../src/core/grammar.js';

const castTxt = readFileSync(new URL('../data/cast.txt', import.meta.url), 'utf8');
const eventsTxt = readFileSync(new URL('../data/events.txt', import.meta.url), 'utf8');
const origEventsTxt = readFileSync(new URL('../data/original-events.txt', import.meta.url), 'utf8');
const templateCast = readFileSync(new URL('../data/original-cast.txt', import.meta.url), 'utf8');

test('parses the default cast: the 74th Hunger Games', () => {
  const c = parseCast(castTxt);
  assert.deepEqual(c.warnings, []);
  assert.equal(c.title, 'The Hunger Games');
  assert.equal(c.districts.length, 12);
  assert.equal(countTributes(c), 24);
  assert.equal(c.districts[0].tributes[0].name, 'Marvel');
  assert.equal(c.districts[0].tributes[1].gender, 0);
  assert.equal(c.districts[4].tributes[1].name, 'Foxface');
  assert.equal(c.districts[11].tributes[1].name, 'Katniss Everdeen');
  assert.equal(c.districts[11].tributes[1].nickname, 'Katniss');
  assert.ok(c.districts.every((d) => d.tributes.length === 2));
});

test('parses the original BrantSteele template cast (CRLF tolerant)', () => {
  const c = parseCast(templateCast.replace(/\r?\n/g, '\r\n'));
  assert.deepEqual(c.warnings, []);
  assert.equal(countTributes(c), 24);
  assert.equal(c.districts[11].tributes[1].name, 'Katniss');
});

test('cast export round-trips', () => {
  const c = parseCast(castTxt);
  const again = parseCast(exportCast(c));
  assert.deepEqual(again.districts, c.districts);
  assert.equal(exportCast(again), exportCast(c));
});

test('cast parser tolerates messy input', () => {
  const messy = '\n\nDistrict A\n#FF0000 0 0\nAnn\nAnnie\n0\n\n\n\nBob Lee\nBob\n1\n';
  const c = parseCast(messy);
  assert.equal(countTributes(c), 2);
  assert.equal(c.districts[0].name, 'District A');
  const bad = parseCast('hello');
  assert.ok(bad.warnings.length > 0);
  assert.equal(countTributes(bad), 0);
  const nohead = parseCast('Ann\nAnn\n0\nx\nBW\n\nBen\nBen\n1\nx\nBW');
  assert.equal(countTributes(nohead), 2);
});

for (const [label, txt] of [['expanded', eventsTxt], ['original', origEventsTxt]]) {
  test(`parses the ${label} events file`, () => {
    const { events, warnings } = parseEvents(txt);
    const c = countEvents(events);
    if (label === 'expanded') {
      assert.deepEqual(warnings, []);
      assert.equal(c.normal, 73 + 125 + 98 + 31);
      assert.equal(c.fatal, 70 + 106 + 94 + 70);
      assert.equal(c.arena, 23);
    } else {
      assert.equal(c.arena, 13);
    }
    assert.equal(c.endgame, 1);
    assert.equal(events.endgame[0].chance, 0.75);
    for (const a of events.arena) {
      assert.ok(a.survive.length >= 1, a.title);
      assert.ok(a.fatal.length >= 1, a.title);
    }
  });
}

test('events export round-trips', () => {
  const { events } = parseEvents(eventsTxt);
  const text = exportEvents(events);
  const again = parseEvents(text);
  assert.deepEqual(again.warnings, []);
  const strip = (e) => JSON.parse(JSON.stringify(e, (k, v) => (k === 'id' ? undefined : v)));
  assert.deepEqual(strip(again.events), strip(events));
});

test('event parser rejects broken events with a warning instead of crashing', () => {
  const txt = 'Day Events\n(Player1) hugs (Player2).\n1\n\n(Player1) waves.\nx\n\n(Player1) ok.\n1\n\nFatal Day Events\n(Player1) kills (Player2).\n2\nPlayer1\nPlayer3\n';
  const { events, warnings } = parseEvents(txt);
  assert.equal(events.day.normal.length, 1);
  assert.equal(events.day.fatal.length, 0);
  assert.equal(warnings.length, 3);
});

test('extension lines are parsed and preserved', () => {
  const txt = 'Day Events\n(Player1) (tends/tends/tends/tends/tend1) to (Player2)\'s wounds.\n2\nRequires: Player2 injured\nEffects: Player2 heal 30\n';
  const { events } = parseEvents(txt);
  assert.equal(events.day.normal[0].requiresRaw, 'Player2 injured');
  assert.equal(events.day.normal[0].effectsRaw, 'Player2 heal 30');
  assert.match(exportEvents(events), /Requires: Player2 injured\nEffects: Player2 heal 30/);
});

test('grammar renders verbs and pronouns per gender', () => {
  const he = { id: 'a', name: 'Thresh', gender: 1 };
  const she = { id: 'b', name: 'Rue', gender: 0 };
  const they = { id: 'c', name: 'Sam', gender: 2 };
  const t = '(Player1) (stabs/stabs/stabs/stabs/stab1) (Player2) while [typeC2] (back is/back is/back is/back is/backs are2) turned. [TypeA1] (runs/runs/run/runs/run1) and [typeA2] (is/is/are/is/are2) hurt, so [typeA1] hides [typeD1].';
  assert.equal(renderPlain(t, [he, she]), 'Thresh stabs Rue while her back is turned. He runs and she is hurt, so he hides himself.');
  assert.equal(renderPlain(t, [they, he]), 'Sam stabs Thresh while his back is turned. They run and he is hurt, so they hides themselves.');
  assert.equal(renderPlain('[Players] threaten to eat the berries.', [he, she]), 'Thresh and Rue threaten to eat the berries.');
});

test('every event in both files renders with no leftover tokens', () => {
  const people = [0, 1, 0, 1, 0, 1].map((g, i) => ({ id: String(i), name: `P${i + 1}`, gender: g }));
  for (const txt of [eventsTxt, origEventsTxt]) {
    const { events } = parseEvents(txt);
    const all = [];
    for (const p of ['bloodbath', 'day', 'night', 'feast']) all.push(...events[p].normal, ...events[p].fatal);
    for (const a of events.arena) all.push(...a.survive, ...a.fatal);
    for (const ev of all) {
      const out = renderPlain(ev.text, people.slice(0, ev.count));
      assert.doesNotMatch(out, /\(Player|\[type|\[Type|\/\w+\d\)/i, out);
    }
  }
});

test('shuffling the cast keeps everyone and every district size', async () => {
  const { shuffleCast, sameArrangement } = await import('../src/io/castFormat.js');
  const { Rng } = await import('../src/core/rng.js');
  const c = parseCast(castTxt);
  const before = JSON.stringify(c);
  const s = shuffleCast(c, new Rng('shuffle-1'));
  assert.equal(JSON.stringify(c), before, 'input not modified');
  assert.deepEqual(s.districts.map((d) => d.name), c.districts.map((d) => d.name));
  assert.deepEqual(s.districts.map((d) => d.color), c.districts.map((d) => d.color));
  assert.deepEqual(s.districts.map((d) => d.tributes.length), c.districts.map((d) => d.tributes.length));
  const names = (x) => x.districts.flatMap((d) => d.tributes.map((t) => `${t.name}/${t.gender}/${t.image}`)).sort();
  assert.deepEqual(names(s), names(c));
  assert.ok(!sameArrangement(s, c), 'order changed');
  assert.ok(sameArrangement(shuffleCast(c, new Rng('shuffle-1')), s), 'same seed, same shuffle');
  // Round-trips through export so it can be saved and exported.
  assert.ok(sameArrangement(parseCast(exportCast(s)), s));
  // Uneven district sizes are kept too.
  const uneven = parseCast('T\n\n\nA\n#111111 0 0\n\nX1\nX1\n1\nu\nBW\n\nX2\nX2\n0\nu\nBW\n\nX3\nX3\n1\nu\nBW\n\n\nB\n#222222 0 0\n\nY1\nY1\n0\nu\nBW');
  assert.deepEqual(shuffleCast(uneven, new Rng('u')).districts.map((d) => d.tributes.length), [3, 1]);
});
