// App controller: holds UI state, routes clicks to actions, and re-renders views.
// Views are pure functions of `app` that return HTML strings (user text escaped).

import { DEFAULT_CAST_TEXT, DEFAULT_EVENTS_TEXT } from '../data/defaultData.js';
import { parseCast, exportCast, countTributes, shuffleCast, sameArrangement } from '../io/castFormat.js';
import { parseEvents, exportEvents } from '../io/eventsFormat.js';
import { Game, DEFAULT_SETTINGS } from '../engine/game.js';
import { newGameCode, Rng } from '../core/rng.js';
import * as store from './storage.js';
import { renderSetup } from './views/setup.js';
import { renderReaping } from './views/reaping.js';
import { renderGame, renderEntry, renderControls } from './views/game.js';
import { renderStatus } from './views/status.js';
import { renderGamemaker } from './views/gamemaker.js';
import { renderEnd } from './views/end.js';
import { renderModal } from './views/modal.js';
import { tagEvent } from '../engine/tagger.js';
import { renderCastEditor } from './views/castEditor.js';
import { renderEventsEditor } from './views/eventsEditor.js';
import { registerEditorActions, editorInput, editorChange } from './editorActions.js';

import { SPEEDS } from './constants.js';

export const app = {
  screen: 'setup',
  castText: DEFAULT_CAST_TEXT,
  originalCastText: null, // set while the cast is shuffled, so it can be restored
  eventsText: DEFAULT_EVENTS_TEXT,
  cast: null,
  events: null,
  castWarnings: [],
  eventWarnings: [],
  settings: { ...DEFAULT_SETTINGS },
  seed: newGameCode(),
  photos: {},
  game: null,
  savedGameInfo: null,
  view: {
    phase: null,
    revealed: Infinity,
    auto: false,
    speed: 'normal',
    panel: null,
    statusSort: 'odds',
    statusFilter: 'alive',
    modal: null,
    // editors
    castDraft: null,
    castDirty: false,
    pendingResize: null,
    eventsDraft: null,
    eventsDirty: false,
    ev: { cat: 'bloodbath:normal', search: '', arena: null },
  },
};

let timer = null;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- setup data

export function loadCast(text) {
  const cast = parseCast(text);
  if (countTributes(cast) < 2) return { ok: false, warnings: cast.warnings.length ? cast.warnings : ['No tributes were found.'] };
  app.castText = text;
  app.cast = cast;
  app.castWarnings = cast.warnings;
  persistSetup();
  return { ok: true, warnings: cast.warnings };
}

export function loadEvents(text) {
  const { events, warnings, sectionsFound } = parseEvents(text);
  if (!sectionsFound.length) return { ok: false, warnings };
  // Check the optional Requires/Effects lines too, so mistakes show up at import.
  const extra = [];
  const all = [];
  for (const p of ['bloodbath', 'day', 'night', 'feast']) all.push(...events[p].normal, ...events[p].fatal);
  for (const a of events.arena) all.push(...a.survive, ...a.fatal);
  for (const e of all) if (e.requiresRaw || e.effectsRaw) for (const m of tagEvent(e).errors) extra.push(`"${e.text.slice(0, 40)}…": ${m}`);
  app.eventsText = text;
  app.events = events;
  app.eventWarnings = [...warnings, ...extra];
  persistSetup();
  return { ok: true, warnings: app.eventWarnings };
}

/** Shuffle who is in which district. Returns false when the cast is too small to change. */
function shuffleCurrentCast() {
  if (countTributes(app.cast) < 2 || app.cast.districts.length < 2) return false;
  const rng = new Rng(`${newGameCode()}:${Date.now()}`);
  let next = shuffleCast(app.cast, rng);
  for (let i = 0; i < 6 && sameArrangement(next, app.cast); i++) next = shuffleCast(app.cast, rng);
  if (sameArrangement(next, app.cast)) return false;
  if (!app.originalCastText) app.originalCastText = app.castText;
  app.castText = exportCast(next);
  app.cast = parseCast(app.castText);
  app.castWarnings = [];
  persistSetup();
  return true;
}

function persistSetup() {
  const custom = {
    castText: app.castText === DEFAULT_CAST_TEXT ? null : app.castText,
    originalCastText: app.originalCastText,
    eventsText: app.eventsText === DEFAULT_EVENTS_TEXT ? null : app.eventsText,
    settings: app.settings,
    photos: app.photos,
    speed: app.view.speed,
  };
  if (!store.save('setup', custom)) {
    // Photos are the big part; drop them rather than lose the rest.
    store.save('setup', { ...custom, photos: {} });
  }
}

function persistGame() {
  if (!app.game) return;
  const ok = store.save('game', { save: app.game.toSave(), screen: app.screen });
  if (!ok) toast('This browser could not save the game; it will be lost if you close the page.');
}

// ---------------------------------------------------------------- rendering

export function render() {
  const main = $('main');
  const s = app.screen;
  document.body.dataset.screen = s;
  if (s === 'setup') main.innerHTML = renderSetup(app);
  else if (s === 'reaping') main.innerHTML = renderReaping(app);
  else if (s === 'game') main.innerHTML = renderGame(app);
  else if (s === 'end') main.innerHTML = renderEnd(app);
  else if (s === 'cast-editor') main.innerHTML = renderCastEditor(app);
  else if (s === 'events-editor') main.innerHTML = renderEventsEditor(app);
  renderHeader();
  renderControlsBar();
  renderPanel();
  renderModalLayer();
  if (s === 'end') requestAnimationFrame(drawCharts);
}

function renderHeader() {
  const g = app.game;
  const inGame = g && (app.screen === 'game' || app.screen === 'end');
  const title = g ? g.state.title : app.cast?.title || 'The Hunger Games';
  const alive = g ? g.aliveCount : 0;
  $('top').innerHTML = `<button class="brand" data-action="home" aria-label="Back to setup"><span class="mark" aria-hidden="true"></span><span>${escapeHtml(title)}</span></button>
  ${inGame ? `<span class="alive-count" title="Tributes alive"><b>${alive}</b> alive</span>` : ''}
  <nav class="top-actions">${inGame ? `<button class="btn ghost ${app.view.panel === 'status' ? 'on' : ''}" data-action="toggle-panel" data-panel="status">Status</button><button class="btn ghost ${app.view.panel === 'gm' ? 'on' : ''}" data-action="toggle-panel" data-panel="gm">Gamemaker</button>` : ''}</nav>`;
}

function renderControlsBar() {
  const el = $('controls');
  if (app.screen !== 'game' || !app.game) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = renderControls(app);
}

export function renderPanel() {
  const el = $('panel');
  const p = app.view.panel;
  if (!p || !app.game || (app.screen !== 'game' && app.screen !== 'end')) {
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('panel-open');
    return;
  }
  const scrollTop = el.querySelector('.panel-body')?.scrollTop || 0;
  el.hidden = false;
  el.innerHTML = p === 'status' ? renderStatus(app) : renderGamemaker(app);
  const body = el.querySelector('.panel-body');
  if (body) body.scrollTop = scrollTop;
  document.body.classList.add('panel-open');
}

function renderModalLayer() {
  const el = $('modal');
  if (!app.view.modal) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = renderModal(app);
  const first = el.querySelector('[autofocus], textarea, input, select, button');
  if (first && !el.contains(document.activeElement)) first.focus({ preventScroll: true });
}

function openModal(modal) {
  app.view.modal = modal;
  renderModalLayer();
}

export function closeModal() {
  app.view.modal = null;
  renderModalLayer();
}

let toastTimer = null;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------------------------------------------------------------- game flow

function currentPhaseIndex() {
  const g = app.game;
  if (!g || !g.state.phases.length) return -1;
  return app.view.phase ?? g.state.phases.length - 1;
}

/**
 * Build a fresh Reaping from the current cast.
 * @param {{profiles?: Record<number,string>, genders?: Record<string,number>}} [keep] choices to carry over
 */
function startReaping(keep = {}) {
  if (!app.cast || !app.events) return;
  try {
    app.game = new Game({ cast: app.cast, events: app.events, seed: app.seed.trim() || newGameCode(), settings: app.settings, profiles: keep.profiles });
  } catch (e) {
    toast(e.message);
    return;
  }
  for (const t of app.game.state.tributes) {
    if (app.photos[t.name]) t.image = app.photos[t.name];
    if (keep.genders && Number.isInteger(keep.genders[t.name])) t.gender = keep.genders[t.name];
  }
  app.screen = 'reaping';
  stopAuto();
  persistGame();
  render();
  window.scrollTo(0, 0);
}

function beginGames() {
  const g = app.game;
  g.start();
  app.screen = 'game';
  advance();
}

/** Run the next phase and show it. */
function advance() {
  const g = app.game;
  if (!g) return;
  if (g.state.finished) {
    showEnd();
    return;
  }
  g.advance();
  app.view.phase = null;
  app.view.revealed = app.view.auto && SPEEDS[app.view.speed].entry > 0 ? 0 : Infinity;
  persistGame();
  render();
  const feed = $('main').querySelector('.phase-head');
  if (feed) feed.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (app.view.auto) scheduleTick();
}

/** Proceed button: finish revealing the current phase, or run the next one. */
function proceed() {
  const g = app.game;
  const latest = g.state.phases.length - 1;
  if (app.view.phase !== null && app.view.phase !== latest) {
    app.view.phase = null;
    app.view.revealed = Infinity;
    render();
    return;
  }
  const phase = g.state.phases[latest];
  if (phase && app.view.revealed < phase.entries.length) {
    app.view.revealed = Infinity;
    render();
    return;
  }
  advance();
}

function showEnd() {
  stopAuto();
  app.screen = 'end';
  app.view.panel = null;
  persistGame();
  render();
  window.scrollTo(0, 0);
}

function revealNext() {
  const g = app.game;
  const phase = g.state.phases[g.state.phases.length - 1];
  const list = $('main').querySelector('.feed');
  if (!phase || !list || app.view.revealed >= phase.entries.length) return false;
  const i = app.view.revealed;
  app.view.revealed += 1;
  const li = document.createElement('div');
  li.innerHTML = renderEntry(app, phase, phase.entries[i], i);
  const node = li.firstElementChild;
  if (node) {
    node.classList.add('new');
    list.appendChild(node);
    const r = node.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 90) node.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  renderControlsBar();
  return true;
}

function scheduleTick() {
  clearTimeout(timer);
  if (!app.view.auto) return;
  const sp = SPEEDS[app.view.speed] || SPEEDS.normal;
  const g = app.game;
  const phase = g?.state.phases[g.state.phases.length - 1];
  const revealing = phase && app.view.revealed < phase.entries.length;
  const delay = revealing ? sp.entry : Math.max(700, sp.entry * 2.4);
  timer = setTimeout(tick, delay);
}

function tick() {
  const g = app.game;
  if (!app.view.auto || !g || app.screen !== 'game') return stopAuto();
  if (app.view.phase !== null) app.view.phase = null;
  if (revealNext()) return scheduleTick();
  if (g.state.finished) {
    stopAuto();
    renderControlsBar();
    timer = setTimeout(showEnd, 1200);
    return;
  }
  advance();
}

function startAuto() {
  app.view.auto = true;
  app.view.phase = null;
  renderControlsBar();
  scheduleTick();
}

export function stopAuto() {
  app.view.auto = false;
  clearTimeout(timer);
}

// ---------------------------------------------------------------- actions

const actions = {
  home() {
    if (app.screen === 'setup') return;
    if (app.screen === 'cast-editor') return actions['ce-discard']();
    if (app.screen === 'events-editor') return actions['ev-discard']();
    stopAuto();
    app.screen = 'setup';
    app.view.panel = null;
    render();
  },
  'start-reaping'() {
    if (app.game && app.game.state.started && !app.game.state.finished) {
      openModal({ type: 'confirm', title: 'Start a new game?', body: 'The game in progress will be replaced. This cannot be undone.', confirm: 'Start new game', action: 'confirm-new' });
      return;
    }
    startReaping();
  },
  'confirm-new'() {
    closeModal();
    startReaping();
  },
  resume() {
    if (!app.game) return;
    app.screen = app.game.state.finished ? 'end' : app.game.state.started ? 'game' : 'reaping';
    app.view.phase = null;
    app.view.revealed = Infinity;
    render();
  },
  'new-code'() {
    app.seed = newGameCode();
    render();
  },
  'import-cast'() {
    openModal({ type: 'import', what: 'cast', text: '' });
  },
  'import-events'() {
    openModal({ type: 'import', what: 'events', text: '' });
  },
  'export-cast'() {
    openModal({ type: 'export', what: 'cast', text: app.game && app.screen !== 'setup' ? exportCast(castFromGame()) : exportCast(app.cast) });
  },
  'export-events'() {
    openModal({ type: 'export', what: 'events', text: exportEvents(app.events) });
  },
  'shuffle-cast'() {
    if (!shuffleCurrentCast()) {
      toast('There need to be at least two districts to shuffle.');
      return;
    }
    toast('Districts shuffled. You can restore the original order at any time.');
    render();
  },
  'restore-cast'() {
    if (!app.originalCastText) return;
    loadCast(app.originalCastText);
    app.originalCastText = null;
    persistSetup();
    toast('Original districts restored.');
    render();
  },
  'shuffle-reaping'() {
    const g = app.game;
    if (!g || g.state.started) return;
    const profiles = Object.fromEntries(g.state.districts.map((d, i) => [i, d.profile]));
    const genders = Object.fromEntries(g.state.tributes.map((t) => [t.name, t.gender]));
    if (!shuffleCurrentCast()) {
      toast('There need to be at least two districts to shuffle.');
      return;
    }
    startReaping({ profiles, genders });
    toast('Districts shuffled. Traits now come from each tribute\'s new district.');
  },
  'restore-reaping'() {
    const g = app.game;
    if (!g || g.state.started || !app.originalCastText) return;
    const profiles = Object.fromEntries(g.state.districts.map((d, i) => [i, d.profile]));
    const genders = Object.fromEntries(g.state.tributes.map((t) => [t.name, t.gender]));
    loadCast(app.originalCastText);
    app.originalCastText = null;
    persistSetup();
    startReaping({ profiles, genders });
    toast('Original districts restored.');
  },
  'reset-cast'() {
    app.originalCastText = null;
    loadCast(DEFAULT_CAST_TEXT);
    toast('Cast reset to the default 36 tributes.');
    render();
  },
  'reset-events'() {
    loadEvents(DEFAULT_EVENTS_TEXT);
    toast('Events reset to the expanded list.');
    render();
  },
  'do-import'() {
    const m = app.view.modal;
    const text = $('import-text')?.value || '';
    const res = m.what === 'cast' ? loadCast(text) : loadEvents(text);
    if (res.ok && m.what === 'cast') {
      app.originalCastText = null;
      persistSetup();
    }
    if (!res.ok) {
      app.view.modal = { ...m, text, error: res.warnings.join(' ') || 'Nothing could be read from that text.' };
      renderModalLayer();
      return;
    }
    closeModal();
    toast(res.warnings.length ? `Imported with ${res.warnings.length} warning(s) — see the ${m.what} card.` : `${m.what === 'cast' ? 'Cast' : 'Events'} imported.`);
    render();
  },
  async copy(el) {
    const ta = $('export-text');
    try {
      await navigator.clipboard.writeText(ta.value);
      toast('Copied. Paste it into BrantSteele or a text file.');
    } catch {
      ta.focus();
      ta.select();
      toast('Press Ctrl+C (or ⌘C) to copy the selected text.');
    }
    el?.blur();
  },
  'close-modal'() {
    closeModal();
  },
  // Reaping
  'reroll-all'() {
    app.game.rerollTraits();
    persistGame();
    render();
  },
  'edit-tribute'(el) {
    openModal({ type: 'edit', id: el.dataset.id });
  },
  'reroll-one'() {
    app.game.rerollTraits(app.view.modal.id);
    persistGame();
    render();
  },
  'save-traits'() {
    const id = app.view.modal.id;
    const v = (k) => Number($(`trait-${k}`)?.value);
    const trainingAuto = $('training-auto')?.checked;
    app.game.setTraits(id, { strength: v('strength'), stealth: v('stealth'), survival: v('survival'), charisma: v('charisma') }, trainingAuto ? undefined : v('training'));
    const g = Number($('gender')?.value);
    if (Number.isInteger(g)) app.game.byId[id].gender = g;
    closeModal();
    persistGame();
    render();
  },
  'remove-photo'() {
    const t = app.game.byId[app.view.modal.id];
    t.image = '';
    delete app.photos[t.name];
    persistSetup();
    persistGame();
    render();
  },
  'begin-games'() {
    beginGames();
  },
  // Game
  proceed() {
    stopAuto();
    proceed();
  },
  'toggle-auto'() {
    if (app.view.auto) {
      stopAuto();
      renderControlsBar();
    } else startAuto();
  },
  'view-phase'(el) {
    stopAuto();
    app.view.phase = Number(el.dataset.index);
    app.view.revealed = Infinity;
    render();
    $('main').querySelector('.phase-head')?.scrollIntoView({ block: 'start' });
  },
  'step-phase'(el) {
    stopAuto();
    const g = app.game;
    const cur = currentPhaseIndex();
    const next = Math.max(0, Math.min(g.state.phases.length - 1, cur + Number(el.dataset.step)));
    app.view.phase = next === g.state.phases.length - 1 ? null : next;
    app.view.revealed = Infinity;
    render();
  },
  'skip-to-end'() {
    openModal({ type: 'confirm', title: 'Skip to the end?', body: 'The rest of the games will be simulated at once. You can still read every phase afterwards.', confirm: 'Skip to the end', action: 'confirm-skip' });
  },
  'confirm-skip'() {
    closeModal();
    stopAuto();
    app.game.runToEnd();
    showEnd();
  },
  'show-end'() {
    showEnd();
  },
  'back-to-game'() {
    app.screen = 'game';
    app.view.phase = null;
    app.view.revealed = Infinity;
    render();
  },
  'toggle-panel'(el) {
    const p = el.dataset.panel;
    app.view.panel = app.view.panel === p ? null : p;
    renderHeader();
    renderPanel();
  },
  'close-panel'() {
    app.view.panel = null;
    renderHeader();
    renderPanel();
  },
  profile(el) {
    openModal({ type: 'profile', id: el.dataset.id });
  },
  // Gamemaker
  'gm-disaster'() {
    const id = $('gm-arena')?.value || 'random';
    try {
      app.game.queueDisaster(id);
      toast('Disaster queued. It strikes when you press Proceed.');
    } catch (e) {
      toast(e.message);
    }
    persistGame();
    renderPanel();
    renderControlsBar();
  },
  'gm-feast'() {
    try {
      app.game.queueFeast();
      toast('Feast called. It begins when you press Proceed.');
    } catch (e) {
      toast(e.message);
    }
    persistGame();
    renderPanel();
    renderControlsBar();
  },
  'gm-cancel'(el) {
    app.game.cancelPending(el.dataset.kind);
    persistGame();
    renderPanel();
    renderControlsBar();
  },
  'gm-gift'() {
    const tid = $('gm-tribute')?.value;
    const item = $('gm-item')?.value;
    try {
      app.game.sendGift(tid, item);
      const t = app.game.byId[tid];
      toast(`Gift sent to ${t.nickname || t.name}.`);
      if (app.screen === 'game' && app.view.phase === null && Number.isFinite(app.view.revealed)) app.view.revealed += 1;
    } catch (e) {
      toast(e.message);
    }
    persistGame();
    render();
  },
  // Status panel
  'status-filter'(el) {
    app.view.statusFilter = el.dataset.value;
    renderPanel();
  },
  // End screen
  'play-again'() {
    app.seed = newGameCode();
    startReaping();
  },
  'replay-code'() {
    app.seed = app.game.state.seed;
    startReaping();
  },
  async 'copy-recap'() {
    const text = recapText();
    try {
      await navigator.clipboard.writeText(text);
      toast('Results copied.');
    } catch {
      openModal({ type: 'export', what: 'results', text });
    }
  },
};

const editorCtx = { app, render, toast, openModal, closeModal, loadCast, loadEvents, persistSetup };
editorCtx.rerenderEventsMain = registerEditorActions(actions, editorCtx).rerenderMain;

function castFromGame() {
  const s = app.game.state;
  return {
    title: s.title,
    logo: app.cast?.logo || '',
    districts: s.districts.map((d, i) => ({
      name: d.name,
      color: app.cast?.districts[i]?.color || '#FFFFFF 0 0',
      tributes: s.tributes.filter((t) => t.district === i).map((t) => ({ name: t.name, nickname: t.nickname, gender: t.gender, image: app.cast?.districts[i]?.tributes.find((x) => x.name === t.name)?.image || '', deathStyle: t.deathStyle })),
    })),
  };
}

function recapText() {
  const s = app.game.state;
  const lines = [`${s.title} — game code ${s.seed}`];
  const winners = s.winners.map((id) => app.game.byId[id].name);
  lines.push(winners.length ? `Victor: ${winners.join(' and ')}` : 'No victor this year.');
  lines.push('');
  const order = [...s.tributes].sort((a, b) => (a.placement || 99) - (b.placement || 99));
  for (const t of order) lines.push(`${t.placement}. ${t.name} (${s.districts[t.district].name}) — ${t.kills} kill${t.kills === 1 ? '' : 's'}${t.alive ? '' : `, fell ${t.deathLabel}`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- charts on the end screen

function drawCharts() {
  const fig = document.querySelector('[data-chart="odds"]');
  if (!fig || !app.game) return;
  const svg = fig.querySelector('svg');
  const draw = () => {
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    if (!W || !H) return;
    const s = app.game.state;
    const top = [...s.tributes].sort((a, b) => (a.placement || 99) - (b.placement || 99)).slice(0, 5);
    const maxX = Math.max(1, s.phases.length);
    const pad = { l: 40, r: 12, t: 12, b: 26 };
    const maxY = Math.max(0.1, ...top.flatMap((t) => t.oddsHistory.map((p) => p[1])));
    const x = (i) => pad.l + (i / maxX) * (W - pad.l - pad.r);
    const y = (v) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
    let out = '';
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
    for (const v of ticks) out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${Math.round(v * 100)}%</text>`;
    top.forEach((t, k) => {
      const pts = t.oddsHistory.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const color = s.districts[t.district].color;
      out += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${k === 0 ? 3 : 2}" stroke-linejoin="round" opacity="${k === 0 ? 1 : 0.85}"/>`;
    });
    out += `<text x="${W - pad.r}" y="${H - 6}" text-anchor="end" class="tick">phases →</text>`;
    svg.innerHTML = out;
  };
  draw();
  if (!fig._ro) {
    fig._ro = new ResizeObserver(draw);
    fig._ro.observe(svg);
  }
}

// ---------------------------------------------------------------- wiring

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try {
    fn(el, e);
  } catch (err) {
    console.error(err);
    toast(`Something went wrong: ${err.message}`);
  }
}

function onChange(e) {
  if (editorChange(e, editorCtx)) return;
  const el = e.target;
  const k = el.dataset.setting;
  if (k) {
    app.settings[k] = el.type === 'checkbox' ? el.checked : el.value;
    persistSetup();
    render();
    return;
  }
  if (el.id === 'seed-input') {
    app.seed = el.value.trim().slice(0, 40) || newGameCode();
    return;
  }
  if (el.dataset.profile !== undefined && app.game) {
    app.game.setDistrictProfile(Number(el.dataset.profile), el.value);
    persistGame();
    render();
    return;
  }
  if (el.id === 'speed') {
    app.view.speed = el.value;
    persistSetup();
    if (app.view.auto) scheduleTick();
    return;
  }
  if (el.id === 'status-sort') {
    app.view.statusSort = el.value;
    renderPanel();
    return;
  }
  if (el.id === 'import-file' && el.files?.[0]) {
    store
      .readTextFile(el.files[0])
      .then((text) => {
        const ta = $('import-text');
        if (ta) ta.value = text;
      })
      .catch((err) => toast(err.message));
    return;
  }
  if (el.id === 'photo-file' && el.files?.[0] && app.view.modal?.id) {
    const id = app.view.modal.id;
    store
      .resizeImage(el.files[0])
      .then((url) => {
        const t = app.game.byId[id];
        t.image = url;
        app.photos[t.name] = url;
        persistSetup();
        persistGame();
        render();
      })
      .catch((err) => toast(err.message));
    return;
  }
  if (el.dataset.trait) {
    const out = document.querySelector(`[data-trait-out="${el.dataset.trait}"]`);
    if (out) out.textContent = el.value;
  }
}

function onInput(e) {
  if (editorInput(e, editorCtx)) return;
  const el = e.target;
  if (el.dataset.trait) {
    const out = document.querySelector(`[data-trait-out="${el.dataset.trait}"]`);
    if (out) out.textContent = el.value;
  }
  if (el.id === 'training-auto') {
    const tr = $('trait-training');
    if (tr) tr.disabled = el.checked;
  }
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (app.view.modal) closeModal();
    else if (app.view.panel) {
      app.view.panel = null;
      renderHeader();
      renderPanel();
    }
  }
}

export function boot() {
  const saved = store.load('setup', {});
  if (saved?.settings) app.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  if (saved?.photos && typeof saved.photos === 'object') app.photos = saved.photos;
  if (saved?.speed && SPEEDS[saved.speed]) app.view.speed = saved.speed;
  const castOk = saved?.castText ? loadCast(saved.castText).ok : false;
  if (castOk && typeof saved.originalCastText === 'string' && countTributes(parseCast(saved.originalCastText)) >= 2) app.originalCastText = saved.originalCastText;
  if (!castOk) loadCast(DEFAULT_CAST_TEXT);
  const evOk = saved?.eventsText ? loadEvents(saved.eventsText).ok : false;
  if (!evOk) loadEvents(DEFAULT_EVENTS_TEXT);
  const g = store.load('game', null);
  if (g?.save) {
    try {
      app.game = Game.fromSave(g.save);
    } catch {
      store.remove('game');
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  $('modal').addEventListener('click', (e) => {
    // Clicking outside closes read-only dialogs; forms stay open so typing is not lost by accident.
    if (e.target.id === 'modal' && ['profile', 'export', 'confirm'].includes(app.view.modal?.type)) closeModal();
  });
  render();
}
