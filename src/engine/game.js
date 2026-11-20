// The Game object: owns the state, the RNG and the event pool, and runs phases in order.
//
// Phase order:  Bloodbath -> Day 1 -> [Arena event] -> Fallen Tributes -> Night 1 ->
//               [Feast] -> Day 2 -> ...   until one tribute (or one district's pair) is left.
// Gamemaker actions (disaster, feast) run as the next phase; gifts apply immediately.

import { Rng } from '../core/rng.js';
import { PROFILES, rollTraits, trainingScore } from '../data/districts.js';
import { ITEMS, itemLabel } from '../data/items.js';
import { BUILTIN, GAMEMAKER_GIFT_TEXT } from '../data/builtinEvents.js';
import { emptyEvents, PHASES } from '../io/eventsFormat.js';
import { tagEvent } from './tagger.js';
import { createTributes, startingPopularity } from './tributes.js';
import { startDay, LENGTH_PRESETS } from './pacing.js';
import { updateOdds } from './odds.js';
import { renderSegments } from '../core/grammar.js';
import { runBloodbath, runDayOrNight, runFeast, runArena, runFallen, runEndgame, endgameApplies, speaker } from './phases.js';

export const DEFAULT_SETTINGS = {
  length: 'standard', // key of LENGTH_PRESETS
  arenaFrequency: 'normal', // off | normal | often
  feast: true,
  endgame: true,
  endgameTrigger: 'districts', // districts | anyone
  cornucopiaRate: 'normal', // normal | decreased
};

const SAVE_VERSION = 1;

export class Game {
  /**
   * @param {object} o
   * @param {import('../io/castFormat.js').Cast} o.cast
   * @param {ReturnType<typeof emptyEvents>} o.events
   * @param {string} o.seed  game code
   * @param {object} [o.settings]
   * @param {Record<number,string>} [o.profiles]  district index -> profile key
   */
  constructor({ cast, events, seed, settings, profiles }) {
    if (!cast || !cast.districts?.length) throw new Error('The cast has no tributes.');
    this.events = normalizeEvents(events);
    this.specCache = new Map();
    const { tributes, districts } = createTributes(cast, `${seed}:reaping`, profiles);
    if (tributes.length < 2) throw new Error('At least two tributes are needed.');
    this.state = {
      version: SAVE_VERSION,
      seed: String(seed),
      title: cast.title || 'The Hunger Games',
      settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
      tributes,
      districts,
      bonds: {},
      alliances: [],
      allianceSeq: 0,
      phases: [],
      eventUse: {},
      day: 0,
      dayQuota: 0,
      deathsToday: 0,
      lastRecap: 0,
      arenaToday: false,
      arenaYesterday: false,
      cursor: 'bloodbath',
      started: false,
      finished: false,
      winners: [],
      pending: { disaster: null, feast: false },
      rerolls: 0,
      rngState: null,
    };
    this.rng = new Rng(this.state.seed);
    this.reindex();
    for (const t of tributes) t.popularity = startingPopularity(t);
    this.seedBonds();
    updateOdds(this);
  }

  // ------------------------------------------------------------ helpers used by the engine
  reindex() {
    this.byId = Object.fromEntries(this.state.tributes.map((t) => [t.id, t]));
  }
  get aliveCount() {
    let n = 0;
    for (const t of this.state.tributes) if (t.alive) n++;
    return n;
  }
  alive() {
    return this.state.tributes.filter((t) => t.alive);
  }
  spec(ev) {
    let s = this.specCache.get(ev.id);
    if (!s) {
      s = tagEvent(ev);
      this.specCache.set(ev.id, s);
    }
    return s;
  }

  /** District partners start with a strong bond; Careers lean towards each other. */
  seedBonds() {
    this.state.bonds = {};
    const ts = this.state.tributes;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i];
        const b = ts[j];
        let v = 0;
        if (a.district === b.district) v += 45;
        const pa = PROFILES[this.state.districts[a.district].profile];
        const pb = PROFILES[this.state.districts[b.district].profile];
        if (pa?.career && pb?.career) v += 30;
        if (v) this.state.bonds[a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`] = v;
      }
    }
  }

  // ------------------------------------------------------------ reaping (before the games start)
  assertReaping() {
    if (this.state.started) throw new Error('The games have already started.');
  }

  rerollTraits(tributeId) {
    this.assertReaping();
    this.state.rerolls += 1;
    const rng = new Rng(`${this.state.seed}:reroll:${this.state.rerolls}`);
    const targets = tributeId ? [this.byId[tributeId]] : this.state.tributes;
    for (const t of targets) {
      const profile = this.state.districts[t.district].profile;
      t.traits = rollTraits(profile, rng);
      t.training = trainingScore(t.traits, profile, rng);
      t.popularity = startingPopularity(t);
    }
    updateOdds(this);
  }

  setTraits(tributeId, traits, training) {
    this.assertReaping();
    const t = this.byId[tributeId];
    for (const k of Object.keys(t.traits)) if (Number.isFinite(traits[k])) t.traits[k] = Math.max(1, Math.min(10, Math.round(traits[k])));
    t.training = Number.isFinite(training) ? Math.max(1, Math.min(12, Math.round(training))) : trainingScore(t.traits, this.state.districts[t.district].profile, null);
    t.popularity = startingPopularity(t);
    updateOdds(this);
  }

  setDistrictProfile(districtIndex, profileKey) {
    this.assertReaping();
    if (!PROFILES[profileKey]) throw new Error(`Unknown district profile ${profileKey}`);
    this.state.districts[districtIndex].profile = profileKey;
    const rng = new Rng(`${this.state.seed}:profile:${districtIndex}:${profileKey}`);
    for (const t of this.state.tributes.filter((x) => x.district === districtIndex)) {
      t.traits = rollTraits(profileKey, rng);
      t.training = trainingScore(t.traits, profileKey, rng);
      t.popularity = startingPopularity(t);
    }
    this.seedBonds();
    updateOdds(this);
  }

  setTributeImage(tributeId, dataUrl) {
    const t = this.byId[tributeId];
    if (t) t.image = String(dataUrl || '');
  }

  // ------------------------------------------------------------ running the games
  start() {
    if (this.state.started) return;
    const s = this.state;
    s.started = true;
    const preset = LENGTH_PRESETS[s.settings.length] || LENGTH_PRESETS.standard;
    s.targetDays = this.rng.int(preset.min, preset.max);
    s.bloodbathRate = 0.18 + this.rng.next() * 0.12;
    s.feastDay = s.settings.feast ? Math.min(s.targetDays - 1, this.rng.int(3, 5)) : null;
  }

  /** What the next press of "Proceed" will show. */
  nextPhaseInfo() {
    const s = this.state;
    if (s.finished) return { kind: 'end', title: 'The games are over' };
    if (!s.started || s.cursor === 'bloodbath') return { kind: 'bloodbath', title: 'The Bloodbath' };
    if (s.pending.disaster) return { kind: 'arena', title: 'Arena event (Gamemakers)' };
    if (s.pending.feast) return { kind: 'feast', title: 'The Feast (Gamemakers)' };
    const map = { day: `Day ${s.day}`, arena: 'Arena event', fallen: 'Fallen Tributes', night: `Night ${s.day}`, feast: 'The Feast' };
    return { kind: s.cursor, title: map[s.cursor] || s.cursor };
  }

  /** Run the next phase. Returns the new phase record, or null when the games are over. */
  advance() {
    const s = this.state;
    if (s.finished) return null;
    if (!s.started) this.start();
    let phase;
    if (s.cursor !== 'bloodbath' && s.pending.disaster) {
      const id = s.pending.disaster;
      s.pending.disaster = null;
      const arena = id === 'random' ? this.rng.pick(this.events.arena) : this.events.arena.find((a) => a.id === id) || this.rng.pick(this.events.arena);
      phase = runArena(this, arena, { gamemaker: true });
      phase.gamemaker = true;
    } else if (s.cursor !== 'bloodbath' && s.pending.feast) {
      s.pending.feast = false;
      phase = runFeast(this, { gamemaker: true });
      phase.gamemaker = true;
    } else {
      switch (s.cursor) {
        case 'bloodbath':
          s.day = 0;
          s.deathsToday = 0;
          phase = runBloodbath(this);
          startDay(this, 1);
          s.cursor = 'day';
          break;
        case 'day':
          phase = runDayOrNight(this, 'day');
          s.cursor = s.arenaToday ? 'arena' : 'fallen';
          break;
        case 'arena':
          phase = runArena(this, this.rng.pick(this.events.arena));
          s.cursor = 'fallen';
          break;
        case 'fallen':
          phase = runFallen(this);
          s.cursor = 'night';
          break;
        case 'night': {
          phase = runDayOrNight(this, 'night');
          if (this.aliveCount > 1 && !endgameApplies(this)) {
            const next = s.day + 1;
            startDay(this, next);
            s.cursor = s.feastDay === next && this.aliveCount >= 4 && !s.feastHeld ? 'feast' : 'day';
          }
          break;
        }
        case 'feast':
          s.feastHeld = true;
          phase = runFeast(this);
          s.cursor = 'day';
          break;
        default:
          throw new Error(`Unknown phase ${s.cursor}`);
      }
    }
    this.afterPhase();
    return phase;
  }

  afterPhase() {
    const s = this.state;
    updateOdds(this);
    if (this.aliveCount <= 1) this.finish(this.alive());
    else if (endgameApplies(this)) {
      const { winners } = runEndgame(this);
      updateOdds(this);
      this.finish(winners);
    }
    s.rngState = this.rng.getState();
  }

  finish(winners) {
    const s = this.state;
    s.finished = true;
    s.winners = winners.map((t) => t.id);
    for (const t of winners) t.placement = 1;
    s.pending = { disaster: null, feast: false };
  }

  /** Run to the end (tests, "skip to the end"). */
  runToEnd(maxPhases = 400) {
    let n = 0;
    while (!this.state.finished && n++ < maxPhases) this.advance();
    if (!this.state.finished) throw new Error('Game did not finish');
  }

  // ------------------------------------------------------------ Gamemaker mode
  canIntervene() {
    const s = this.state;
    return s.started && s.phases.length > 0 && !s.finished;
  }

  queueDisaster(arenaId = 'random') {
    if (!this.canIntervene()) throw new Error('Disasters can be started once the Bloodbath is over.');
    if (!this.events.arena.length) throw new Error('There are no arena events loaded.');
    if (arenaId !== 'random' && !this.events.arena.some((a) => a.id === arenaId)) throw new Error('Unknown arena event.');
    this.state.pending.disaster = arenaId;
  }

  queueFeast() {
    if (!this.canIntervene()) throw new Error('A Feast can be called once the Bloodbath is over.');
    this.state.pending.feast = true;
  }

  cancelPending(kind) {
    if (kind === 'disaster') this.state.pending.disaster = null;
    if (kind === 'feast') this.state.pending.feast = false;
  }

  /** Send an item now. Returns the entry added to the current phase. */
  sendGift(tributeId, itemId) {
    if (!this.canIntervene()) throw new Error('Gifts can be sent once the games have begun.');
    const t = this.byId[tributeId];
    if (!t || !t.alive) throw new Error('That tribute is not alive.');
    if (!ITEMS[itemId]) throw new Error('Unknown item.');
    t.inventory[itemId] = (t.inventory[itemId] || 0) + 1;
    if (ITEMS[itemId].kind === 'weapon' || ITEMS[itemId].kind === 'explosive') t.everArmed = true;
    t.sponsorGifts += 1;
    const phase = this.state.phases[this.state.phases.length - 1];
    const { segments } = renderSegments(GAMEMAKER_GIFT_TEXT, [speaker(t)]);
    const entry = { kind: 'gamemaker', eventId: 'builtin:gm-gift', cast: [t.id], segments, deaths: [], changes: { [t.id]: [{ kind: 'good', text: `+${itemLabel(itemId)}` }] } };
    phase.entries.push(entry);
    t.history.push([phase.index, phase.entries.length - 1]);
    updateOdds(this);
    return entry;
  }

  // ------------------------------------------------------------ save / load
  toSave() {
    return JSON.stringify({ v: SAVE_VERSION, state: this.state, events: this.events });
  }

  static fromSave(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || data.v !== SAVE_VERSION || !data.state) throw new Error('This save is from a different version.');
    const g = Object.create(Game.prototype);
    g.events = normalizeEvents(data.events);
    g.specCache = new Map();
    g.state = data.state;
    g.rng = new Rng(g.state.seed, g.state.rngState || undefined);
    g.reindex();
    return g;
  }
}

/** Make sure every phase pool exists, and add built-in fallbacks. */
function normalizeEvents(events) {
  const e = events ? JSON.parse(JSON.stringify(events)) : emptyEvents();
  const base = emptyEvents();
  for (const p of PHASES) e[p] = { normal: e[p]?.normal || [], fatal: e[p]?.fatal || [] };
  e.arena = e.arena || base.arena;
  e.endgame = e.endgame || base.endgame;
  for (const p of PHASES) if (!e[p].normal.length) e[p].normal.push(BUILTIN.filler[p]);
  return e;
}
