// Pure editing logic for the cast and events editors (no DOM), so it can be unit-tested.
// Drafts are plain objects in the same shape as parsed casts/events; nothing is saved
// until the user presses Save, which round-trips through the BrantSteele text format.

import { validateEvent, MAX_EVENT_PLAYERS, PHASES } from '../io/eventsFormat.js';
import { tagEvent } from '../engine/tagger.js';
import { renderPlain } from '../core/grammar.js';
import { itemLabel } from '../data/items.js';

export const CAST_LIMITS = { maxDistricts: 50, maxPerDistrict: 8, maxTributes: 200 };
const DEFAULT_COLOR = '#FFFFFF 0 0';

const clone = (x) => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------------ cast

export function placeholderTribute(districtIndex, k) {
  const name = `District ${districtIndex + 1} Tribute ${k + 1}`;
  return { name, nickname: name, gender: k % 2 === 0 ? 1 : 0, image: '', deathStyle: 'BW', photo: '' };
}

export function blankDistrict(index, perDistrict) {
  return { name: `District ${index + 1}`, color: DEFAULT_COLOR, tributes: Array.from({ length: perDistrict }, (_, k) => placeholderTribute(index, k)) };
}

/** A new cast of placeholder tributes. */
export function createBlankCast(districts, perDistrict, title = 'The Hunger Games') {
  const d = clampInt(districts, 1, CAST_LIMITS.maxDistricts);
  const k = clampInt(perDistrict, 1, CAST_LIMITS.maxPerDistrict);
  return { title, logo: '', districts: Array.from({ length: d }, (_, i) => blankDistrict(i, k)), warnings: [] };
}

/** Copy a cast into an editable draft, attaching saved photos by name. */
export function castToDraft(cast, photos = {}) {
  const draft = clone(cast);
  draft.warnings = [];
  for (const d of draft.districts) for (const t of d.tributes) t.photo = photos[t.name] || '';
  return draft;
}

/**
 * Like BrantSteele's "Adjust Size": set the number of districts and tributes per district.
 * Existing tributes keep their places; new places get placeholders; extra places are removed from the end.
 * @returns {{draft: object, removed: number}}
 */
export function resizeCast(draft, districts, perDistrict) {
  const d = clampInt(districts, 1, CAST_LIMITS.maxDistricts);
  const k = clampInt(perDistrict, 1, CAST_LIMITS.maxPerDistrict);
  const out = clone(draft);
  let removed = 0;
  for (let i = d; i < out.districts.length; i++) removed += out.districts[i].tributes.length;
  out.districts = out.districts.slice(0, d);
  for (let i = out.districts.length; i < d; i++) out.districts.push(blankDistrict(i, 0));
  out.districts.forEach((dist, i) => {
    if (dist.tributes.length > k) {
      removed += dist.tributes.length - k;
      dist.tributes = dist.tributes.slice(0, k);
    }
    for (let j = dist.tributes.length; j < k; j++) dist.tributes.push(placeholderTribute(i, j));
  });
  return { draft: out, removed };
}

export function addDistrict(draft, perDistrict = 2) {
  const out = clone(draft);
  if (out.districts.length >= CAST_LIMITS.maxDistricts) return out;
  out.districts.push(blankDistrict(out.districts.length, clampInt(perDistrict, 1, CAST_LIMITS.maxPerDistrict)));
  return out;
}

export function removeDistrict(draft, index) {
  const out = clone(draft);
  if (out.districts.length <= 1) return out;
  out.districts.splice(index, 1);
  return out;
}

export function addTribute(draft, districtIndex) {
  const out = clone(draft);
  const d = out.districts[districtIndex];
  if (!d || d.tributes.length >= CAST_LIMITS.maxPerDistrict) return out;
  d.tributes.push(placeholderTribute(districtIndex, d.tributes.length));
  return out;
}

export function removeTribute(draft, districtIndex, tributeIndex) {
  const out = clone(draft);
  const d = out.districts[districtIndex];
  if (!d || d.tributes.length <= 1) return out;
  d.tributes.splice(tributeIndex, 1);
  return out;
}

export function moveTribute(draft, districtIndex, tributeIndex, toDistrict) {
  const out = clone(draft);
  const from = out.districts[districtIndex];
  const to = out.districts[toDistrict];
  if (!from || !to || from === to || from.tributes.length <= 1 || to.tributes.length >= CAST_LIMITS.maxPerDistrict) return out;
  to.tributes.push(...from.tributes.splice(tributeIndex, 1));
  return out;
}

/** Problems that block saving, and warnings that do not. */
export function checkCast(draft) {
  const errors = [];
  const warnings = [];
  const total = draft.districts.reduce((n, d) => n + d.tributes.length, 0);
  if (total < 2) errors.push('A game needs at least two tributes.');
  if (total > CAST_LIMITS.maxTributes) errors.push(`At most ${CAST_LIMITS.maxTributes} tributes are allowed.`);
  const seen = new Map();
  draft.districts.forEach((d, i) => {
    if (!String(d.name || '').trim()) errors.push(`District ${i + 1} needs a name.`);
    d.tributes.forEach((t, j) => {
      const n = String(t.name || '').trim();
      if (!n) errors.push(`${d.name || `District ${i + 1}`}: tribute ${j + 1} needs a name.`);
      else seen.set(n.toLowerCase(), (seen.get(n.toLowerCase()) || 0) + 1);
    });
  });
  for (const [n, c] of seen) if (c > 1) warnings.push(`"${n}" appears ${c} times; photos and pronoun edits are matched by name.`);
  return { errors, warnings, total };
}

/** Tidy a draft for saving: trim text, fill empty nicknames, keep BrantSteele colour lines. */
export function finalizeCast(draft) {
  const out = clone(draft);
  out.title = String(out.title || '').trim() || 'The Hunger Games';
  for (const d of out.districts) {
    d.name = String(d.name).trim();
    d.color = normalizeColorLine(d.color);
    for (const t of d.tributes) {
      t.name = String(t.name).trim();
      t.nickname = String(t.nickname || '').trim() || t.name.split(/\s+/)[0];
      t.gender = clampInt(t.gender, 0, 4);
    }
  }
  return out;
}

/** "#ff0000" or "#FF0000 0 0" -> "#FF0000 0 0" */
export function normalizeColorLine(c) {
  const m = /#([0-9a-f]{6})\b/i.exec(String(c || ''));
  if (!m) return DEFAULT_COLOR;
  const rest = String(c).trim().split(/\s+/).slice(1).join(' ');
  return `#${m[1].toUpperCase()} ${rest || '0 0'}`;
}

/** Colour for an <input type=color>: white lines show as a neutral grey so the picker is useful. */
export function colorInputValue(colorLine) {
  const m = /#([0-9a-f]{6})\b/i.exec(String(colorLine || ''));
  return m ? `#${m[1].toLowerCase()}` : '#ffffff';
}

/** Photos to keep after saving: name -> data URL. */
export function photosFromDraft(draft) {
  const out = {};
  for (const d of draft.districts) for (const t of d.tributes) if (t.photo && t.name) out[String(t.name).trim()] = t.photo;
  return out;
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// ------------------------------------------------------------------ events

/** The ten BrantSteele sections, in its order. */
export const CATEGORIES = [
  ...PHASES.map((p) => ({ key: `${p}:normal`, phase: p, fatal: false, label: `${cap(p)} events` })),
  { key: 'arena', phase: 'arena', label: 'Arena events' },
  { key: 'endgame', phase: 'endgame', label: 'Endgame events' },
  ...PHASES.map((p) => ({ key: `${p}:fatal`, phase: p, fatal: true, label: `Fatal ${p} events` })),
];

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export function categoryList(events, key) {
  const c = CATEGORIES.find((x) => x.key === key);
  if (!c) return [];
  if (c.phase === 'arena') return events.arena;
  if (c.phase === 'endgame') return events.endgame;
  return events[c.phase][c.fatal ? 'fatal' : 'normal'];
}

let newId = 0;
export function newEvent(phase, fatal) {
  newId += 1;
  return fatal
    ? { id: `new:${newId}`, phase, fatal: true, text: '(Player1) (kills/kills/kills/kills/kill1) (Player2).', count: 2, killers: [1], killed: [2], requiresRaw: '', effectsRaw: '' }
    : { id: `new:${newId}`, phase, fatal: false, text: '(Player1) (waves/waves/waves/waves/wave1) at the cameras.', count: 1, killers: [], killed: [], requiresRaw: '', effectsRaw: '' };
}

export function newArena() {
  newId += 1;
  const id = `new-arena:${newId}`;
  return {
    id,
    title: 'Something strange happens in the arena.',
    survive: [{ id: `${id}:s0`, phase: 'arena', fatal: false, text: '(Player1) (survives/survives/survives/survives/survive1).', count: 1, killers: [], killed: [], requiresRaw: '', effectsRaw: '' }],
    fatal: [{ id: `${id}:f0`, phase: 'arena', fatal: true, text: '(Player1) (is/is/is/is/are1) caught in it and (dies/dies/dies/dies/die1).', count: 1, killers: [], killed: [1], requiresRaw: '', effectsRaw: '' }],
  };
}

export function newEndgame() {
  newId += 1;
  return { id: `new-end:${newId}`, text: '[Players] (refuse/refuse/refuse/refuse/refuse1) to fight each other.', winText: 'They survive and win.', loseText: 'They die and lose.', chance: 0.75 };
}

/** Example tributes for previews: mixed pronouns so verb forms can be checked. */
export function sampleSpeakers(n) {
  const names = ['Ana', 'Ben', 'Cam', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kai', 'Lux'];
  const genders = [0, 1, 2, 0, 1, 0, 1, 1, 0, 2, 1, 0];
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: names[i % names.length] + (i >= names.length ? i : ''), gender: genders[i % genders.length] }));
}

/** Build an event from form values and check it. */
export function eventFromForm(base, form) {
  const count = clampInt(form.count, 1, MAX_EVENT_PLAYERS);
  const ev = {
    ...base,
    text: String(form.text || '').replace(/\s*\n\s*/g, ' ').trim(),
    count,
    killers: base.fatal ? [...new Set((form.killers || []).map(Number))].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b) : [],
    killed: base.fatal ? [...new Set((form.killed || []).map(Number))].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b) : [],
    requiresRaw: String(form.requiresRaw || '').trim(),
    effectsRaw: String(form.effectsRaw || '').trim(),
  };
  const errors = [];
  const v = validateEvent(ev);
  if (v) errors.push(sentence(v));
  if (/\r|\n/.test(ev.text)) errors.push('The text must be on one line.');
  if (/^(requires|effects)\s*:/i.test(ev.text)) errors.push('The text cannot start with "Requires:" or "Effects:".');
  if (/^\d+$/.test(ev.text)) errors.push('The text cannot be just a number.');
  const spec = errors.length ? null : tagEvent(ev);
  if (spec) errors.push(...spec.errors);
  return { ev, errors, spec };
}

export function endgameFromForm(base, form) {
  const ev = { ...base, text: String(form.text || '').trim(), winText: String(form.winText || '').trim(), loseText: String(form.loseText || '').trim(), chance: clampInt(form.chance, 0, 100) / 100 };
  const errors = [];
  if (!ev.text) errors.push('The endgame needs text.');
  if (!ev.winText || !ev.loseText) errors.push('Both the win and lose lines are needed.');
  if (/\(Player\d+\)/.test(ev.text)) errors.push('Endgame text uses [Players] for the remaining tributes, not (Player1).');
  return { ev, errors };
}

function sentence(s) {
  return s ? s[0].toUpperCase() + s.slice(1) + '.' : s;
}

export function previewText(ev) {
  return renderPlain(ev.text, sampleSpeakers(ev.count || 1));
}

/** Plain-language summary of how the simulator reads an event (what it changes, what it needs). */
export function describeSpec(spec) {
  if (!spec) return [];
  const P = (n) => `Player${n}`;
  const out = [];
  for (const r of spec.requires) {
    if (r.type === 'cond') out.push(`Only when ${P(r.who)} is ${r.cond}`);
    else if (r.type === 'has') out.push(`Only when ${P(r.who)} has ${itemLabel(r.item).toLowerCase()}`);
    else if (r.type === 'hasWeapon') out.push(`Only when ${P(r.who)} has a weapon`);
    else if (r.type === 'hunger') out.push(`Only after ${r.min}+ days without food for ${P(r.who)}`);
    else if (r.type === 'thirst') out.push(`Only after ${r.min}+ days without water for ${P(r.who)}`);
    else if (r.type === 'healthBelow') out.push(`Only when ${P(r.who)} is below ${r.max} health`);
    else if (r.type === 'inAlliance') out.push(`Only when ${P(r.who)} is in an alliance`);
    else if (r.type === 'allied') out.push(`Only when ${P(r.who)} and ${P(r.other)} are allies`);
    else if (r.type === 'notAllied') out.push(`Only when ${P(r.who)} and ${P(r.other)} are not allies`);
  }
  const roles = spec.roles.map((r, i) => ({ r, n: i + 1 }));
  const killers = roles.filter((x) => x.r === 'killer').map((x) => P(x.n));
  const victims = roles.filter((x) => x.r === 'victim' || x.r === 'self').map((x) => P(x.n));
  if (victims.length) out.push(killers.length ? `${killers.join(' and ')} kill${killers.length > 1 ? '' : 's'} ${victims.join(' and ')}; stronger, better-armed tributes are picked as killers` : `${victims.join(' and ')} die${victims.length > 1 ? '' : 's'}; weaker or careless tributes are picked`);
  for (const p of spec.prefs) {
    if (p.type === 'has' && p.yes > 1) out.push(`Usually given to a ${P(p.who)} who has ${itemLabel(p.item).toLowerCase()}`);
    else if (p.type === 'hungry') out.push(`More likely for a hungry ${P(p.who)}`);
    else if (p.type === 'thirsty') out.push(`More likely for a thirsty ${P(p.who)}`);
    else if (p.type === 'sponsor') out.push(`Sponsor gift: popular tributes who need it get it most`);
    else if (p.type === 'badlyHurt') out.push(`More likely when ${P(p.who)} is badly hurt`);
    else if (p.type === 'noShelter') out.push(`More likely when ${P(p.who)} has no camping gear`);
    else if (p.type === 'distressed') out.push(`More likely when ${P(p.who)} is hurt, starving, alone or has lost their district partner`);
  }
  for (const e of spec.effects) {
    if (e.t === 'gain') out.push(`${P(e.who)} gets ${itemLabel(e.item).toLowerCase()}${e.n > 1 ? ` ×${e.n}` : ''}`);
    else if (e.t === 'gainRandom') out.push(`${P(e.who)} gets ${e.n > 1 ? `${e.n} random supplies` : 'a random supply'}`);
    else if (e.t === 'lose') out.push(`${P(e.who)} loses ${itemLabel(e.item).toLowerCase()}`);
    else if (e.t === 'consume') out.push(`${P(e.who)} uses up ${itemLabel(e.item).toLowerCase()}`);
    else if (e.t === 'transfer') out.push(`${P(e.to)} takes ${e.item === 'random' ? 'something' : e.item === 'weapon' ? 'a weapon' : itemLabel(e.item).toLowerCase()} from ${P(e.from)}`);
    else if (e.t === 'loseSupplies') out.push(`${P(e.who)} loses their supplies`);
    else if (e.t === 'loseWeapon') out.push(`${P(e.who)} loses their weapon`);
    else if (e.t === 'hp') out.push(`${P(e.who)} ${e.d > 0 ? `heals ${e.d}` : `takes ${-e.d} damage${e.reason === 'shaken' ? ' from fear or grief' : ''}`}`);
    else if (e.t === 'cond') out.push(`${P(e.who)} ${e.on ? `becomes ${e.cond}` : `is no longer ${e.cond}`}`);
    else if (e.t === 'cure') out.push(`${P(e.who)} may stop being ${e.cond}`);
    else if (e.t === 'eat') out.push(`${P(e.who)} eats`);
    else if (e.t === 'drink') out.push(`${P(e.who)} drinks${e.chance && e.chance < 1 ? ' (maybe)' : ''}`);
    else if (e.t === 'pop') out.push(`${P(e.who)} ${e.d >= 0 ? 'gains' : 'loses'} popularity`);
    else if (e.t === 'bond') out.push(`${P(e.a)} and ${P(e.b)} ${e.d >= 0 ? 'grow closer' : 'grow apart'}`);
    else if (e.t === 'ally') out.push(`${e.who.map(P).join(', ')} form an alliance`);
    else if (e.t === 'leave') out.push(`${P(e.who)} leaves their alliance`);
    else if (e.t === 'betray') out.push(`${P(e.who)} betrays ${P(e.target)}`);
  }
  if (spec.tags.has('coop') && !spec.effects.some((e) => e.t === 'ally')) out.push('Allies are more likely to be cast together');
  if (spec.tags.has('hostile')) out.push('Rivals are more likely to be cast together than allies');
  return [...new Set(out)];
}

export function eventsCount(draft) {
  let n = draft.arena.length + draft.endgame.length;
  for (const p of PHASES) n += draft[p].normal.length + draft[p].fatal.length;
  return n;
}
