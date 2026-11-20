// BrantSteele events import/export.
//
// Sections start with a header line ("Bloodbath Events", "Fatal Day Events", "Arena Events", ...).
// Regular event:   text / player count            (blocks separated by blank lines)
// Fatal event:     text / count / killers / killed ("None" or "Player1, Player2")
// Arena event:     title / "Surviving Scenarios" / (text, count)* / "Fatal Scenarios" / (text, count, killers, killed)*
// Endgame event:   text / win text / lose text / "75%"
//
// Extension (optional, ignored by BrantSteele): after an event's normal lines you may add
//   Requires: Player2 injured; Player1 has medkit
//   Effects: Player2 heal 30; Player1 -medkit
// See engine/dsl.js for the syntax.

import { maxPlayerRef, namedPlayers } from '../core/grammar.js';

export const PHASES = ['bloodbath', 'day', 'night', 'feast'];

const HEADERS = {
  'bloodbath events': { phase: 'bloodbath', fatal: false },
  'day events': { phase: 'day', fatal: false },
  'night events': { phase: 'night', fatal: false },
  'feast events': { phase: 'feast', fatal: false },
  'fatal bloodbath events': { phase: 'bloodbath', fatal: true },
  'fatal day events': { phase: 'day', fatal: true },
  'fatal night events': { phase: 'night', fatal: true },
  'fatal feast events': { phase: 'feast', fatal: true },
  'arena events': { phase: 'arena' },
  'endgame events': { phase: 'endgame' },
};

const EXTRA_RE = /^(requires|effects)\s*:\s*(.*)$/i;
export const MAX_EVENT_PLAYERS = 24;

function normLines(text) {
  return String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
}

function blocksOf(lines) {
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** "None" -> [], "Player1, Player3" -> [1, 3]; returns null when malformed. */
export function parsePlayerList(line) {
  const s = String(line ?? '').trim();
  if (/^none$/i.test(s)) return [];
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const m = /^Player\s*(\d+)$/i.exec(p);
    if (!m) return null;
    out.push(Number(m[1]));
  }
  return out;
}

export function formatPlayerList(list) {
  return list.length ? list.map((n) => `Player${n}`).join(', ') : 'None';
}

function parseCount(line) {
  const s = String(line ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_EVENT_PLAYERS ? n : null;
}

/** Shared validation; returns an error string or '' when valid. */
export function validateEvent(ev) {
  if (!ev.text) return 'missing text';
  if (!Number.isInteger(ev.count)) return 'bad player count';
  const max = maxPlayerRef(ev.text);
  if (max > ev.count) return `mentions Player${max} but the count is ${ev.count}`;
  const named = namedPlayers(ev.text);
  for (let i = 1; i <= ev.count; i++) if (!named.has(i) && ev.count > 1) return `never names Player${i}`;
  if (ev.count === 1 && !named.has(1)) return 'never names Player1';
  if (ev.fatal) {
    const all = [...ev.killers, ...ev.killed];
    if (all.some((n) => n < 1 || n > ev.count)) return 'killer/killed list mentions a player outside the count';
    if (!ev.killed.length) return 'fatal event with nobody killed';
    if (ev.killers.some((k) => ev.killed.includes(k))) return 'a player is both killer and killed';
  }
  return '';
}

function takeExtras(lines, i, ev) {
  while (i < lines.length) {
    const m = EXTRA_RE.exec(lines[i]);
    if (!m) break;
    if (m[1].toLowerCase() === 'requires') ev.requiresRaw = m[2].trim();
    else ev.effectsRaw = m[2].trim();
    i++;
  }
  return i;
}

/**
 * Read one event starting at lines[i]. Returns {ev, next} or {error, next}.
 */
function readEvent(lines, i, phase, fatal) {
  const text = lines[i];
  const count = parseCount(lines[i + 1]);
  if (count === null) return { error: `"${short(text)}": second line must be the number of players`, next: i + 2 };
  const ev = { phase, fatal, text, count, killers: [], killed: [], requiresRaw: '', effectsRaw: '' };
  let next = i + 2;
  if (fatal) {
    const killers = parsePlayerList(lines[i + 2]);
    const killed = parsePlayerList(lines[i + 3]);
    if (killers === null || killed === null) return { error: `"${short(text)}": killer and killed lines must be "None" or "Player1, Player2"`, next: i + 4 };
    ev.killers = killers;
    ev.killed = killed;
    next = i + 4;
  }
  next = takeExtras(lines, next, ev);
  const err = validateEvent(ev);
  if (err) return { error: `"${short(text)}": ${err}`, next };
  return { ev, next };
}

function short(t) {
  const s = String(t ?? '');
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

export function emptyEvents() {
  const e = { arena: [], endgame: [] };
  for (const p of PHASES) e[p] = { normal: [], fatal: [] };
  return e;
}

/**
 * @returns {{events: ReturnType<typeof emptyEvents>, warnings: string[], sectionsFound: string[]}}
 */
export function parseEvents(text) {
  const lines = normLines(text);
  const events = emptyEvents();
  const warnings = [];
  const sectionsFound = [];

  // Split into sections by header lines.
  const sections = [];
  let cur = null;
  for (const l of lines) {
    const key = l.trim().toLowerCase();
    if (HEADERS[key]) {
      cur = { header: HEADERS[key], name: l.trim(), lines: [] };
      sections.push(cur);
      continue;
    }
    if (cur) cur.lines.push(l);
    else if (l.trim()) {
      if (!warnings.length || !warnings[warnings.length - 1].startsWith('Text before')) warnings.push('Text before the first section header was ignored.');
    }
  }

  let seq = 0;
  for (const sec of sections) {
    sectionsFound.push(sec.name);
    const blocks = blocksOf(sec.lines);
    const { phase, fatal } = sec.header;
    if (phase === 'arena') {
      for (const b of blocks) {
        const r = readArena(b, warnings);
        if (r) {
          r.id = `arena:${seq++}`;
          r.survive.forEach((s, k) => (s.id = `${r.id}:s${k}`));
          r.fatal.forEach((s, k) => (s.id = `${r.id}:f${k}`));
          events.arena.push(r);
        }
      }
    } else if (phase === 'endgame') {
      for (const b of blocks) {
        if (b.length < 4) {
          warnings.push(`Endgame event "${short(b[0])}" needs 4 lines; skipped.`);
          continue;
        }
        const pct = Number.parseFloat(String(b[3]).replace('%', ''));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          warnings.push(`Endgame event "${short(b[0])}": bad percentage; skipped.`);
          continue;
        }
        events.endgame.push({ id: `endgame:${seq++}`, text: b[0], winText: b[1], loseText: b[2], chance: pct / 100 });
      }
    } else {
      const list = fatal ? events[phase].fatal : events[phase].normal;
      for (const b of blocks) {
        let i = 0;
        while (i < b.length) {
          const r = readEvent(b, i, phase, fatal);
          if (r.error) warnings.push(`${sec.name}: ${r.error}; skipped.`);
          else {
            r.ev.id = `${phase}:${fatal ? 'f' : 'n'}:${seq++}`;
            list.push(r.ev);
          }
          i = r.next;
        }
      }
    }
  }
  if (!sections.length) warnings.push('No section headers were found (for example "Day Events").');
  return { events, warnings, sectionsFound };
}

function readArena(b, warnings) {
  const title = b[0];
  const si = b.findIndex((l) => /^surviving scenarios$/i.test(l));
  const fi = b.findIndex((l) => /^fatal scenarios$/i.test(l));
  if (si !== 1 || fi < 0) {
    warnings.push(`Arena event "${short(title)}" needs "Surviving Scenarios" and "Fatal Scenarios" lines; skipped.`);
    return null;
  }
  const arena = { title, survive: [], fatal: [] };
  let i = si + 1;
  while (i < fi) {
    const r = readEvent(b, i, 'arena', false);
    if (r.error) warnings.push(`Arena "${short(title)}": ${r.error}; skipped.`);
    else arena.survive.push(r.ev);
    i = Math.min(r.next, fi);
    if (r.next > fi) break;
  }
  i = fi + 1;
  while (i < b.length) {
    const r = readEvent(b, i, 'arena', true);
    if (r.error) warnings.push(`Arena "${short(title)}": ${r.error}; skipped.`);
    else arena.fatal.push(r.ev);
    i = r.next;
  }
  if (!arena.survive.length) {
    // Always allow survival so an arena event can never wipe everyone out.
    arena.survive.push({ phase: 'arena', fatal: false, text: '(Player1) (survives/survives/survives/survives/survive1).', count: 1, killers: [], killed: [], requiresRaw: '', effectsRaw: '' });
    warnings.push(`Arena "${short(title)}" had no surviving scenarios; added a default one.`);
  }
  return arena;
}

function eventLines(ev) {
  const out = [ev.text, String(ev.count)];
  if (ev.fatal) out.push(formatPlayerList(ev.killers), formatPlayerList(ev.killed));
  if (ev.requiresRaw) out.push(`Requires: ${ev.requiresRaw}`);
  if (ev.effectsRaw) out.push(`Effects: ${ev.effectsRaw}`);
  return out;
}

const TITLES = { bloodbath: 'Bloodbath', day: 'Day', night: 'Night', feast: 'Feast' };

/** Export in BrantSteele's order. */
export function exportEvents(events) {
  const sections = [];
  const pushSection = (title, blocks) => {
    sections.push([title, ...blocks.flatMap((b, i) => (i ? ['', ...b] : b))].join('\n'));
  };
  for (const p of PHASES) pushSection(`${TITLES[p]} Events`, events[p].normal.map(eventLines));
  pushSection(
    'Arena Events',
    events.arena.map((a) => [a.title, 'Surviving Scenarios', ...a.survive.flatMap(eventLines), 'Fatal Scenarios', ...a.fatal.flatMap(eventLines)]),
  );
  pushSection('Endgame Events', events.endgame.map((e) => [e.text, e.winText, e.loseText, `${Math.round(e.chance * 100)}%`]));
  for (const p of PHASES) pushSection(`Fatal ${TITLES[p]} Events`, events[p].fatal.map(eventLines));
  return sections.join('\n\n\n');
}

export function countEvents(events) {
  let normal = 0;
  let fatal = 0;
  for (const p of PHASES) {
    normal += events[p].normal.length;
    fatal += events[p].fatal.length;
  }
  return { normal, fatal, arena: events.arena.length, endgame: events.endgame.length };
}
