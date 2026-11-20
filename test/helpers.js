import { readFileSync } from 'node:fs';
import { DEFAULT_CAST_TEXT, DEFAULT_EVENTS_TEXT } from '../src/data/defaultData.js';
import { parseCast } from '../src/io/castFormat.js';
import { parseEvents } from '../src/io/eventsFormat.js';
import { Game } from '../src/engine/game.js';
import { meetsRequirement } from '../src/engine/effects.js';
import { sameAlliance } from '../src/engine/alliances.js';
import { itemLabel } from '../src/data/items.js';

/** Records any event that happens while one of its hard requirements is false. */
export function watchRequirements(g) {
  g.requirementViolations = [];
  g.onBeforeOutcome = (ev, spec, cast, phase) => {
    for (const r of spec.requires) {
      const t = cast[r.who - 1];
      if (!t) continue;
      let ok;
      if (r.type === 'allied' || r.type === 'notAllied') {
        const o = cast[r.other - 1];
        ok = !o || sameAlliance(g, t.id, o.id) === (r.type === 'allied');
      } else ok = meetsRequirement(g, r, t);
      if (!ok) {
        const what = r.items ? r.items.map(itemLabel).join('/') : r.item || r.cond || r.max || r.min || '';
        g.requirementViolations.push(`${phase.title}: "${ev.text.slice(0, 60)}" cast ${t.name} without ${r.type} ${what}`);
      }
    }
  };
  return g;
}

export const DEFAULT_CAST = parseCast(DEFAULT_CAST_TEXT);
export const EVENTS = parseEvents(DEFAULT_EVENTS_TEXT).events;
export const CAST24 = parseCast(readFileSync(new URL('../data/original-cast.txt', import.meta.url), 'utf8'));
export const ORIGINAL_EVENTS = parseEvents(readFileSync(new URL('../data/original-events.txt', import.meta.url), 'utf8')).events;

/** A generated 36-tribute cast in 18 districts (exercises districts beyond the canon 12). */
export function smallCastFixture() {
  return smallCast(36);
}

export function smallCast(n) {
  const districts = [];
  for (let i = 0; i < n; i += 2) {
    const tributes = [];
    for (let j = i; j < Math.min(n, i + 2); j++) tributes.push({ name: `Tribute ${j + 1}`, nickname: `T${j + 1}`, gender: j % 2, image: '', deathStyle: 'BW' });
    districts.push({ name: `District ${i / 2 + 1}`, color: '#FFFFFF 0 0', tributes });
  }
  return { title: 'Test', logo: '', districts, warnings: [] };
}

export const CAST36 = smallCast(36);

export function newGame(seed, opts = {}) {
  return watchRequirements(new Game({ cast: opts.cast || CAST36, events: opts.events || EVENTS, seed, settings: opts.settings }));
}

/** Check every rule a finished game must satisfy. Returns a list of problems. */
export function checkInvariants(g) {
  const s = g.state;
  const errs = [];
  const N = s.tributes.length;
  const byId = g.byId;
  const err = (m) => errs.push(`[${s.seed}] ${m}`);
  for (const v of g.requirementViolations || []) err(`requirement broken: ${v}`);
  if (!s.finished) err('not finished');
  const dead = s.tributes.filter((t) => !t.alive);
  const alive = s.tributes.filter((t) => t.alive);
  if (s.winners.length === 1) {
    if (alive.length !== 1 || alive[0].id !== s.winners[0]) err('winner is not the only one alive');
    const places = s.tributes.map((t) => t.placement).sort((a, b) => a - b);
    for (let i = 0; i < N; i++) if (places[i] !== i + 1) { err(`placements not 1..N: ${places.join(',')}`); break; }
  } else if (s.winners.length > 1) {
    if (alive.length !== s.winners.length) err('joint winners mismatch');
    if (!alive.every((t) => t.district === alive[0].district)) err('joint winners from different districts');
  } else if (alive.length !== 0) err('no winner but tributes alive');

  const aliveAtStart = (phase) => s.tributes.filter((t) => t.deathPhase === null || t.deathPhase >= phase.index);
  let killPairs = 0;
  for (const ph of s.phases) {
    const regular = ['bloodbath', 'day', 'night', 'feast', 'arena'].includes(ph.kind);
    const seen = new Map();
    ph.entries.forEach((e, ei) => {
      for (const seg of e.segments) if (/\(Player|\[type|\[Type|\/\w+\d\)/.test(seg.text)) err(`leftover token in ${ph.title}: ${seg.text}`);
      if (e.kind === 'event') for (const id of e.cast) seen.set(id, (seen.get(id) || 0) + 1);
      if (['event', 'sponsor', 'gamemaker', 'notes'].includes(e.kind)) {
        for (const id of e.cast) {
          const t = byId[id];
          if (t.deathPhase !== null && t.deathPhase < ph.index) err(`dead tribute ${id} appears in ${ph.title}`);
        }
      }
      if (e.kind === 'event' && e.eventId && DESPAIR_RE.test(eventText(g, e.eventId))) {
        for (const id of e.deaths) if (!(byId[id].healthAtDeath < 35)) err(`self-inflicted death at ${byId[id].healthAtDeath} health in ${ph.title}`);
      }
      if (e.kind !== 'fallen') for (const id of e.deaths) {
        const v = byId[id];
        if (v.deathPhase !== ph.index) err(`death phase mismatch for ${id}`);
        for (const k of v.killedBy) {
          killPairs++;
          const kt = byId[k];
          if (kt.deathPhase !== null && kt.deathPhase < ph.index) err(`killer ${k} was already dead in ${ph.title}`);
        }
      }
    });
    if (regular) {
      const start = aliveAtStart(ph);
      for (const t of start) {
        const c = seen.get(t.id) || 0;
        if (c !== 1) err(`${t.id} appears ${c} times in ${ph.title} (${ph.kind})`);
      }
      for (const id of seen.keys()) if (!start.some((t) => t.id === id)) err(`${id} in ${ph.title} but was not alive`);
    }
    if ((ph.kind === 'day' || ph.kind === 'night') && ph.day < 3) {
      for (const e of ph.entries) {
        if (e.kind === 'attrition' && /hunger|thirst/.test(e.eventId)) err(`attrition starvation on day ${ph.day}`);
        if (e.eventId && /dies from (hunger|thirst)/.test(eventText(g, e.eventId))) err(`hunger/thirst death event on day ${ph.day}`);
      }
    }
  }
  const totalKills = s.tributes.reduce((n, t) => n + t.kills, 0);
  if (totalKills !== killPairs) err(`kill count ${totalKills} != kill records ${killPairs}`);
  for (const t of s.tributes) {
    if (t.health < 0 || t.health > 100) err(`health out of range ${t.id} ${t.health}`);
    if (t.alive && t.health < 1) err(`alive with health ${t.health}`);
    for (const [k, v] of Object.entries(t.inventory)) if (!Number.isInteger(v) || v <= 0) err(`bad inventory ${t.id} ${k}=${v}`);
    if (t.alive && Math.abs(t.oddsHistory[t.oddsHistory.length - 1][1] - t.odds) > 1e-3) err('odds history out of sync');
  }
  for (const a of s.alliances) {
    if (a.members.length < 2 || a.members.length > 6) err(`alliance size ${a.members.length}`);
    for (const m of a.members) if (!byId[m].alive || byId[m].allianceId !== a.id) err(`alliance member inconsistent ${m}`);
  }
  for (const t of s.tributes) if (t.allianceId && !s.alliances.some((a) => a.id === t.allianceId && a.members.includes(t.id))) err(`dangling allianceId ${t.id}`);
  if (dead.length + alive.length !== N) err('count mismatch');
  return errs;
}

const DESPAIR_RE = /suicide|begs for \(Player\d\) to kill|agree to die|decide to run into the cloud together/;
const textCache = new Map();
function eventText(g, id) {
  if (textCache.has(id)) return textCache.get(id);
  let txt = '';
  for (const p of ['bloodbath', 'day', 'night', 'feast']) for (const e of [...g.events[p].normal, ...g.events[p].fatal]) if (e.id === id) txt = e.text;
  for (const a of g.events.arena) for (const e of [...a.survive, ...a.fatal]) if (e.id === id) txt = e.text;
  textCache.set(id, txt);
  return txt;
}
