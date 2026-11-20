import { readFileSync } from 'node:fs';
import { parseEvents } from '../src/io/eventsFormat.js';
import { tagEvent } from '../src/engine/tagger.js';
const { events } = parseEvents(readFileSync(new URL('../data/events.txt', import.meta.url), 'utf8'));
const filter = process.argv[2] || '';
const list = [];
for (const p of ['bloodbath','day','night','feast']) list.push(...events[p].normal, ...events[p].fatal);
for (const a of events.arena) list.push(...a.survive, ...a.fatal);
for (const ev of list) {
  if (filter && !ev.phase.startsWith(filter)) continue;
  const s = tagEvent(ev);
  const fx = s.effects.map(e => JSON.stringify(e).replace(/"/g,'')).join(' ');
  const rq = s.requires.map(e => JSON.stringify(e).replace(/"/g,'')).join(' ');
  const pf = s.prefs.map(e => JSON.stringify(e).replace(/"/g,'')).join(' ');
  console.log(`${ev.fatal?'F':'-'} ${ev.text.replace(/\(([^()]*\/[^()]*?)(\d+)\)/g,(m,f)=>f.split('/')[0]).replace(/\(Player(\d)\)/g,'P$1').slice(0,90)}\n     tags=[${[...s.tags]}] ${rq?'REQ '+rq:''} ${pf?'PREF '+pf:''} ${fx?'FX '+fx:''}`);
}
