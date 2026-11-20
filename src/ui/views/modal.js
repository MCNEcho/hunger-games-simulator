import { esc, avatar, chip, itemChips, healthBar, traitBar, ordinal } from '../components.js';
import { TRAITS, TRAIT_LABELS, PROFILES } from '../../data/districts.js';
import { PRONOUN_SETS } from '../../core/grammar.js';
import { oddsLabel, bettingLine } from '../../engine/odds.js';
import { eventFormDialog, endgameFormDialog } from './eventsEditor.js';

export function renderModal(app) {
  const m = app.view.modal;
  let inner = '';
  if (m.type === 'import') inner = importDialog(m);
  else if (m.type === 'export') inner = exportDialog(m);
  else if (m.type === 'confirm') inner = confirmDialog(m);
  else if (m.type === 'edit') inner = editDialog(app, m);
  else if (m.type === 'profile') inner = profileDialog(app, m);
  else if (m.type === 'event-form') inner = eventFormDialog(app, m);
  else if (m.type === 'endgame-form') inner = endgameFormDialog(m);
  return `<div class="dialog ${m.type}" role="dialog" aria-modal="true" aria-labelledby="dlg-title">${inner}</div>`;
}

function head(title) {
  return `<div class="dlg-head"><h2 id="dlg-title">${esc(title)}</h2><button class="btn icon" data-action="close-modal" aria-label="Close">✕</button></div>`;
}

function importDialog(m) {
  const what = m.what === 'cast' ? 'cast' : 'events';
  return `${head(`Import ${what}`)}
<p>Paste the text from BrantSteele's Import &amp; Export page, or load a .txt file.</p>
<label class="file"><input type="file" id="import-file" accept=".txt,text/plain"><span>Choose a .txt file</span></label>
<textarea id="import-text" rows="12" spellcheck="false" placeholder="${what === 'cast' ? 'The Hunger Games&#10;logo URL&#10;&#10;&#10;District 1&#10;#FFFFFF 0 0&#10;&#10;Name&#10;Nickname&#10;1&#10;image URL&#10;BW' : 'Bloodbath Events&#10;(Player1) (grabs/grabs/grabs/grabs/grab1) a shovel.&#10;1'}">${esc(m.text || '')}</textarea>
${m.error ? `<p class="error" role="alert">${esc(m.error)}</p>` : ''}
<div class="dlg-actions"><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" data-action="do-import">Import</button></div>`;
}

function exportDialog(m) {
  const title = m.what === 'results' ? 'Results' : `Export ${m.what}`;
  return `${head(title)}
<p>${m.what === 'results' ? 'Copy the results below.' : 'Copy this text and paste it into BrantSteele, or keep it in a text file.'}</p>
<textarea id="export-text" rows="14" readonly spellcheck="false">${esc(m.text)}</textarea>
<div class="dlg-actions"><button class="btn ghost" data-action="close-modal">Close</button><button class="btn primary" data-action="copy">Copy</button></div>`;
}

function confirmDialog(m) {
  return `${head(m.title)}<p>${esc(m.body)}</p><div class="dlg-actions"><button class="btn ghost" data-action="close-modal" autofocus>Cancel</button><button class="btn primary" data-action="${esc(m.action)}">${esc(m.confirm)}</button></div>`;
}

function editDialog(app, m) {
  const g = app.game;
  const t = g.byId[m.id];
  const d = g.state.districts[t.district];
  const slider = (k, label, v, max) =>
    `<label class="slider"><span>${esc(label)}</span><input type="range" id="trait-${k}" data-trait="${k}" min="1" max="${max}" value="${v}" ${k === 'training' ? 'disabled' : ''}><output data-trait-out="${k}">${v}</output></label>`;
  return `${head(t.name)}
<div class="edit-top">${avatar(t, d.color, 88)}
  <div><p>${esc(d.name)} · ${esc(PROFILES[d.profile].label)}</p>
  <label class="file small"><input type="file" id="photo-file" accept="image/*"><span>${t.image ? 'Change photo' : 'Upload photo'}</span></label>
  ${t.image ? '<button class="link" data-action="remove-photo">Remove photo</button>' : ''}</div></div>
<label class="field"><span>Pronouns</span><select id="gender">${Object.entries(PRONOUN_SETS).map(([k, p]) => `<option value="${k}" ${Number(k) === t.gender ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
<div class="sliders">${TRAITS.map((k) => slider(k, TRAIT_LABELS[k], t.traits[k], 10)).join('')}
${slider('training', 'Training score', t.training, 12)}</div>
<label class="check"><input type="checkbox" id="training-auto" checked><span>Work out the training score from the traits</span></label>
<div class="dlg-actions"><button class="btn ghost" data-action="reroll-one">Re-roll</button><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-traits">Save</button></div>`;
}

function profileDialog(app, m) {
  const g = app.game;
  const s = g.state;
  const t = g.byId[m.id];
  const d = s.districts[t.district];
  const ally = t.allianceId ? s.alliances.find((a) => a.id === t.allianceId) : null;
  const status = t.alive ? (s.finished && s.winners.includes(t.id) ? 'Victor' : 'Alive') : `${ordinal(t.placement)} · fell ${t.deathLabel}${t.killedBy.length ? ` · killed by ${t.killedBy.map((k) => g.byId[k].name).join(', ')}` : ''}`;
  const history = t.history
    .map(([pi, ei]) => {
      const ph = s.phases[pi];
      const e = ph?.entries[ei];
      if (!e) return '';
      const text = e.segments.map((x) => x.text).join('');
      const mine = (e.changes[t.id] || []).map(chip).join('');
      return `<li><span class="when">${esc(ph.title)}</span><span>${esc(text)}${mine ? `<span class="hchips">${mine}</span>` : ''}</span></li>`;
    })
    .join('');
  const conds = [];
  if (t.alive) {
    if (t.conds.injured) conds.push(chip({ kind: 'bad', text: 'Injured' }));
    if (t.conds.infected) conds.push(chip({ kind: 'bad', text: 'Infected' }));
    if (t.hunger) conds.push(chip({ kind: t.hunger >= 3 ? 'bad' : 'warn', text: `${t.hunger} day${t.hunger > 1 ? 's' : ''} without food` }));
    if (t.thirst) conds.push(chip({ kind: t.thirst >= 2 ? 'bad' : 'warn', text: `${t.thirst} day${t.thirst > 1 ? 's' : ''} without water` }));
  }
  return `${head(t.name)}
<div class="profile-top">${avatar(t, d.color, 96)}
  <div><p class="eyebrow">${esc(d.name)} · ${esc(PROFILES[d.profile].label)}</p><p class="status-line">${esc(status)}</p>
  <p class="big-odds">${t.alive ? `${oddsLabel(t.odds)} <small>to win · ${esc(bettingLine(t.odds))}</small>` : ''}</p>
  ${sparkline(t, d.color)}</div></div>
<div class="profile-grid">
  <section><h3>Condition</h3>${t.alive ? `${healthBar(t.health)} <span>${Math.round(t.health)} health</span><div class="chips">${conds.join('') || '<span class="muted">No problems</span>'}</div>` : '<p class="muted">Eliminated</p>'}</section>
  <section><h3>Items</h3><div class="chips">${t.alive ? itemChips(t.inventory) : '<span class="muted">—</span>'}</div></section>
  <section><h3>Traits</h3>${TRAITS.map((k) => traitBar(TRAIT_LABELS[k], t.traits[k])).join('')}<p class="muted">Training score ${t.training} · Popularity ${t.popularity} · ${t.sponsorGifts} gift${t.sponsorGifts === 1 ? '' : 's'}</p></section>
  <section><h3>Alliance and kills</h3><p>${ally ? `<span class="ally-tag" style="--a:${esc(ally.color)}">${esc(ally.name)}</span> with ${ally.members.filter((x) => x !== t.id).map((x) => esc(g.byId[x].name)).join(', ')}` : '<span class="muted">No alliance</span>'}</p>
  <p>${t.kills ? `${t.kills} kill${t.kills === 1 ? '' : 's'}: ${t.victims.map((v) => esc(g.byId[v].name)).join(', ')}` : '<span class="muted">No kills</span>'}</p></section>
</div>
<h3>Their games</h3>
<ol class="history">${history || '<li class="muted">Nothing yet.</li>'}</ol>`;
}

function sparkline(t, color) {
  const h = t.oddsHistory;
  if (!h || h.length < 2) return '';
  const W = 220;
  const H = 44;
  const maxX = h[h.length - 1][0] || 1;
  const maxY = Math.max(0.02, ...h.map((p) => p[1]));
  const pts = h.map(([x, y]) => `${((x / maxX) * (W - 4) + 2).toFixed(1)},${(H - 3 - (y / maxY) * (H - 8)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Win odds over time, peak ${Math.round(maxY * 100)}%"><polyline points="${pts}" fill="none" stroke="${esc(color)}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
