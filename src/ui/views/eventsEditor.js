import { esc } from '../components.js';
import { CATEGORIES, categoryList, previewText, describeSpec, sampleSpeakers, eventsCount } from '../editors.js';
import { tagEvent } from '../../engine/tagger.js';
import { formatPlayerList, MAX_EVENT_PLAYERS } from '../../io/eventsFormat.js';
import { renderPlain } from '../../core/grammar.js';

export function renderEventsEditor(app) {
  const v = app.view.ev;
  const draft = app.view.eventsDraft;
  const cats = CATEGORIES.map((c) => `<button class="cat ${c.key === v.cat ? 'on' : ''} ${c.fatal ? 'fatal' : ''}" data-action="ev-cat" data-cat="${c.key}" ${c.key === v.cat ? 'aria-current="true"' : ''}><span>${esc(c.label)}</span><b>${categoryList(draft, c.key).length}</b></button>`).join('');
  return `
<section class="editor-head">
  <div class="editor-title"><h1>Edit events</h1><p>Add, change or delete events in any of BrantSteele's ten sections. Each event shows how the simulator reads it: what it gives, what it needs, and who it suits. Nothing changes until you save.</p></div>
  <div class="card size-card">
    <p><b>${eventsCount(draft)}</b> events in total${app.view.eventsDirty ? ' · <span class="chip warn">Unsaved changes</span>' : ''}</p>
    <div class="row-actions"><button class="btn primary" data-action="ev-save-all">Save events</button><button class="btn ghost" data-action="ev-discard">Discard changes</button></div>
  </div>
</section>
<div class="ev-layout">
  <nav class="cats" aria-label="Event sections">${cats}</nav>
  <div class="ev-main" id="ev-main">${renderEventsMain(app)}</div>
</div>`;
}

export function renderEventsMain(app) {
  const v = app.view.ev;
  const draft = app.view.eventsDraft;
  const cat = CATEGORIES.find((c) => c.key === v.cat);
  if (cat.phase === 'arena' && v.arena !== null && draft.arena[v.arena]) return arenaDetail(app, v.arena);
  const list = categoryList(draft, v.cat);
  const q = v.search.trim().toLowerCase();
  const rows = list
    .map((ev, i) => ({ ev, i }))
    .filter(({ ev }) => !q || (ev.title || ev.text || '').toLowerCase().includes(q) || (cat.phase !== 'arena' && cat.phase !== 'endgame' && previewText(ev).toLowerCase().includes(q)));
  let body;
  if (cat.phase === 'arena') {
    body = rows.map(({ ev, i }) => `<li class="evrow"><div class="evtext"><b>${esc(ev.title)}</b><span class="muted">${ev.survive.length} surviving, ${ev.fatal.length} fatal scenario${ev.fatal.length === 1 ? '' : 's'}</span></div><div class="evbtns"><button class="btn small" data-action="ev-open-arena" data-index="${i}">Open</button><button class="btn ghost small" data-action="ev-delete" data-index="${i}" aria-label="Delete ${esc(ev.title)}">Delete</button></div></li>`).join('');
  } else if (cat.phase === 'endgame') {
    body = rows.map(({ ev, i }) => `<li class="evrow"><div class="evtext"><span>${esc(renderPlain(ev.text, sampleSpeakers(2)))}</span><span class="muted">${Math.round(ev.chance * 100)}% they win: “${esc(ev.winText)}” / “${esc(ev.loseText)}”</span></div><div class="evbtns"><button class="btn small" data-action="ev-edit" data-index="${i}">Edit</button><button class="btn ghost small" data-action="ev-delete" data-index="${i}">Delete</button></div></li>`).join('');
  } else {
    body = rows.map(({ ev, i }) => eventRow(ev, i, 'ev-edit', 'ev-delete')).join('');
  }
  const addLabel = cat.phase === 'arena' ? 'Add an arena event' : cat.phase === 'endgame' ? 'Add an endgame event' : 'Add an event';
  return `<div class="ev-tools">
  <label class="field search"><span class="sr">Search ${esc(cat.label)}</span><input type="search" id="ev-search" placeholder="Search ${esc(cat.label.toLowerCase())}" value="${esc(v.search)}" autocomplete="off"></label>
  <button class="btn primary" data-action="ev-add">${addLabel}</button>
</div>
<h2>${esc(cat.label)} <span class="muted">${list.length}</span></h2>
${cat.fatal ? '<p class="hint">Fatal events: every one names who kills and who dies.</p>' : ''}
<ul class="evlist" id="ev-list">${body || `<li class="empty">${list.length ? 'No events match your search.' : 'No events here yet.'}</li>`}</ul>`;
}

function eventRow(ev, i, editAction, deleteAction, extra = '') {
  let reading = [];
  try {
    reading = describeSpec(tagEvent(ev));
  } catch {
    reading = [];
  }
  const roles = ev.fatal ? `<span class="muted">${ev.count} player${ev.count === 1 ? '' : 's'} · killers ${esc(formatPlayerList(ev.killers))} · killed ${esc(formatPlayerList(ev.killed))}</span>` : `<span class="muted">${ev.count} player${ev.count === 1 ? '' : 's'}</span>`;
  return `<li class="evrow"><div class="evtext"><span>${esc(previewText(ev))}</span>${roles}${reading.length ? `<span class="reading">${reading.slice(0, 4).map((r) => `<span class="chip">${esc(r)}</span>`).join('')}${reading.length > 4 ? `<span class="chip">+${reading.length - 4} more</span>` : ''}</span>` : ''}</div><div class="evbtns"><button class="btn small" data-action="${editAction}" data-index="${i}" ${extra}>Edit</button><button class="btn ghost small" data-action="${deleteAction}" data-index="${i}" ${extra}>Delete</button></div></li>`;
}

function arenaDetail(app, index) {
  const a = app.view.eventsDraft.arena[index];
  const list = (kind) =>
    a[kind].map((ev, i) => eventRow(ev, i, 'ev-edit-scenario', 'ev-delete-scenario', `data-kind="${kind}" ${kind === 'survive' && a.survive.length <= 1 ? '' : ''}`)).join('') || '<li class="empty">None yet.</li>';
  return `<button class="link" data-action="ev-close-arena">‹ All arena events</button>
<label class="field"><span>What happens (shown as the phase title)</span><input id="arena-title" value="${esc(a.title)}" maxlength="140"></label>
<h3>Surviving scenarios <span class="muted">${a.survive.length}</span></h3>
<p class="hint">Tributes who live through it. At least one is needed.</p>
<ul class="evlist">${list('survive')}</ul>
<button class="btn" data-action="ev-add-scenario" data-kind="survive">Add a surviving scenario</button>
<h3>Fatal scenarios <span class="muted">${a.fatal.length}</span></h3>
<p class="hint">How tributes die in it. "None" as killer means the disaster itself kills them.</p>
<ul class="evlist">${list('fatal')}</ul>
<button class="btn" data-action="ev-add-scenario" data-kind="fatal">Add a fatal scenario</button>`;
}

/** Modal body for editing one event (or arena scenario). */
export function eventFormDialog(app, m) {
  const ev = m.base;
  const count = m.form.count;
  const opts = Array.from({ length: MAX_EVENT_PLAYERS }, (_, k) => `<option value="${k + 1}" ${k + 1 === count ? 'selected' : ''}>${k + 1}</option>`).join('');
  const playerOpts = Array.from({ length: count }, (_, k) => `<option value="${k + 1}">Player${k + 1}</option>`).join('');
  return `<div class="dlg-head"><h2 id="dlg-title">${m.isNew ? 'New event' : 'Edit event'} <span class="muted">${esc(m.label)}</span></h2><button class="btn icon" data-action="close-modal" aria-label="Close">✕</button></div>
<label class="field"><span>Event text</span><textarea id="ev-text" rows="3" spellcheck="true">${esc(m.form.text)}</textarea></label>
<div class="tokbar" aria-label="Insert into the text">
  <label class="field inline-label"><span>Insert for</span><select id="tok-player">${playerOpts}</select></label>
  <button class="btn small" data-action="tok" data-tok="name">Name</button>
  <button class="btn small" data-action="tok" data-tok="A">he/she</button>
  <button class="btn small" data-action="tok" data-tok="B">him/her</button>
  <button class="btn small" data-action="tok" data-tok="C">his/her</button>
  <button class="btn small" data-action="tok" data-tok="D">himself/herself</button>
  <span class="verb"><input id="tok-verb-s" placeholder="runs" aria-label="Verb for one person, e.g. runs" maxlength="30"><input id="tok-verb-b" placeholder="run" aria-label="Verb for several, e.g. run" maxlength="30"><button class="btn small" data-action="tok-verb">Insert verb</button></span>
</div>
<p class="hint">Names are written (Player1). Verbs change with pronouns: "runs" for he, she or a name, "run" for they.</p>
<div class="form-row">
  <label class="field"><span>Players</span><select id="ev-count">${opts}</select></label>
  ${ev.fatal ? rolePickers(m.form) : ''}
</div>
<details class="adv" ${m.form.requiresRaw || m.form.effectsRaw ? 'open' : ''}><summary>Exact requirements and effects (optional)</summary>
  <label class="field"><span>Requires</span><input id="ev-req" value="${esc(m.form.requiresRaw)}" placeholder="Player2 injured; Player1 has medkit"></label>
  <label class="field"><span>Effects</span><input id="ev-eff" value="${esc(m.form.effectsRaw)}" placeholder="Player2 heal 30; Player1 -medkit"></label>
  <p class="hint">When filled in, these replace what the simulator works out from the wording. See "How events change the odds" on the setup screen.</p>
</details>
<div class="preview" id="ev-preview" aria-live="polite"></div>
<div class="dlg-actions">${m.isNew ? '' : '<button class="btn ghost danger-text" data-action="ev-form-delete">Delete</button>'}<span class="spacer"></span><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" data-action="ev-form-save">Save event</button></div>`;
}

function rolePickers(form) {
  const boxes = (name, picked) =>
    Array.from({ length: form.count }, (_, k) => `<label class="pchk"><input type="checkbox" name="${name}" value="${k + 1}" ${picked.includes(k + 1) ? 'checked' : ''}><span>P${k + 1}</span></label>`).join('');
  return `<fieldset class="roles" id="ev-roles"><legend>Killers</legend><div>${boxes('killer', form.killers)}</div></fieldset>
  <fieldset class="roles"><legend>Killed</legend><div>${boxes('killed', form.killed)}</div></fieldset>`;
}

/** Live preview: rendered text, problems, and how the simulator reads it. */
export function eventPreview(result) {
  const { ev, errors, spec } = result;
  const text = ev.text ? esc(previewText(ev)) : '<span class="muted">Type the event text above.</span>';
  const reading = spec ? describeSpec(spec) : [];
  return `<p class="pv-label">Preview with sample tributes (Ana: she, Ben: he, Cam: they…)</p><p class="pv-text">${text}</p>
${errors.length ? `<ul class="errors">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="ok">Looks good.</p>'}
${reading.length ? `<p class="pv-label">How the simulator reads it</p><ul class="reading-list">${reading.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : spec ? '<p class="pv-label">The simulator treats this as flavour: no stat changes.</p>' : ''}`;
}

export function endgameFormDialog(m) {
  return `<div class="dlg-head"><h2 id="dlg-title">${m.isNew ? 'New endgame event' : 'Edit endgame event'}</h2><button class="btn icon" data-action="close-modal" aria-label="Close">✕</button></div>
<p class="hint">Runs when only district partners are left. [Players] is replaced by their names.</p>
<label class="field"><span>Text</span><textarea id="eg-text" rows="2">${esc(m.form.text)}</textarea></label>
<label class="field"><span>If they win</span><input id="eg-win" value="${esc(m.form.winText)}"></label>
<label class="field"><span>If they lose</span><input id="eg-lose" value="${esc(m.form.loseText)}"></label>
<label class="field"><span>Chance they win (%)</span><input id="eg-chance" type="number" min="0" max="100" value="${Math.round(m.form.chance)}" inputmode="numeric"></label>
${m.errors?.length ? `<ul class="errors" role="alert">${m.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
<div class="dlg-actions">${m.isNew ? '' : '<button class="btn ghost danger-text" data-action="ev-form-delete">Delete</button>'}<span class="spacer"></span><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" data-action="eg-save">Save</button></div>`;
}
