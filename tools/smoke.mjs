import { DEFAULT_CAST_TEXT, DEFAULT_EVENTS_TEXT } from '../src/data/defaultData.js';
import { parseCast } from '../src/io/castFormat.js';
import { parseEvents } from '../src/io/eventsFormat.js';
import { Game } from '../src/engine/game.js';
const seed = process.argv[2] || 'TEST-1';
const g = new Game({ cast: parseCast(DEFAULT_CAST_TEXT), events: parseEvents(DEFAULT_EVENTS_TEXT).events, seed });
g.runToEnd();
const s = g.state;
const names = Object.fromEntries(s.tributes.map(t => [t.id, t.nickname]));
for (const ph of s.phases) {
  console.log(`\n== ${ph.title} ${ph.intro ? '— ' + ph.intro : ''}`);
  for (const e of ph.entries) {
    const txt = e.kind === 'fallen' ? `  [fallen] ${names[e.cast[0]]}` : '  ' + e.segments.map(x => x.text).join('');
    const ch = Object.entries(e.changes).map(([id, cs]) => `${names[id]}: ${cs.map(c => c.text).join(', ')}`).join(' | ');
    console.log(txt + (ch ? `   {${ch}}` : ''));
  }
}
console.log('\nWinner:', s.winners.map(id => names[id]), 'targetDays', s.targetDays, 'endedDay', s.day);
console.log('Alliances at end:', JSON.stringify(s.alliances));
