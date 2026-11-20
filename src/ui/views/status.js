import { esc, avatar, chip, itemChips, healthBar, oddsBadge, previousOdds, ordinal } from '../components.js';
import { PROFILES } from '../../data/districts.js';
import { bettingLine } from '../../engine/odds.js';

const SORTS = {
  odds: { label: 'Win odds', fn: (a, b) => b.odds - a.odds || (a.placement || 0) - (b.placement || 0) },
  health: { label: 'Health', fn: (a, b) => b.health - a.health },
  kills: { label: 'Kills', fn: (a, b) => b.kills - a.kills || b.odds - a.odds },
  popularity: { label: 'Popularity', fn: (a, b) => b.popularity - a.popularity },
  district: { label: 'District', fn: (a, b) => a.district - b.district },
  name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
};

export function renderStatus(app) {
  const g = app.game;
  const s = g.state;
  const filter = app.view.statusFilter;
  const sort = SORTS[app.view.statusSort] || SORTS.odds;
  let list = s.tributes.filter((t) => (filter === 'alive' ? t.alive : filter === 'fallen' ? !t.alive : true));
  list = [...list].sort((a, b) => (a.alive === b.alive ? sort.fn(a, b) : a.alive ? -1 : 1));
  const alive = g.aliveCount;
  const rows = list.map((t) => row(g, t)).join('') || '<li class="empty">Nobody here.</li>';
  const alliances = s.alliances.length
    ? `<div class="alliances">${s.alliances.map((a) => `<span class="ally-tag" style="--a:${esc(a.color)}">${esc(a.name)}: ${a.members.map((m) => esc(g.byId[m].nickname || g.byId[m].name)).join(', ')}</span>`).join('')}</div>`
    : '';
  return `<div class="panel-head"><h2>Status <span class="muted">${alive} alive of ${s.tributes.length}</span></h2><button class="btn icon" data-action="close-panel" aria-label="Close status">✕</button></div>
<div class="panel-tools">
  <div class="seg" role="group" aria-label="Show">${['alive', 'fallen', 'all'].map((f) => `<button class="${filter === f ? 'on' : ''}" data-action="status-filter" data-value="${f}" aria-pressed="${filter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
  <label class="field inline-label"><span>Sort</span><select id="status-sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${app.view.statusSort === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
</div>
<div class="panel-body">${alliances}<ul class="roster">${rows}</ul></div>`;
}

function row(g, t) {
  const s = g.state;
  const d = s.districts[t.district];
  const ally = t.allianceId ? s.alliances.find((a) => a.id === t.allianceId) : null;
  const needs = [];
  if (t.alive) {
    if (t.hunger >= 1) needs.push(chip({ kind: t.hunger >= 3 ? 'bad' : 'warn', text: `Hungry ${t.hunger}d` }));
    if (t.thirst >= 1) needs.push(chip({ kind: t.thirst >= 2 ? 'bad' : 'warn', text: `Thirsty ${t.thirst}d` }));
    if (t.conds.injured) needs.push(chip({ kind: 'bad', text: 'Injured' }));
    if (t.conds.infected) needs.push(chip({ kind: 'bad', text: 'Infected' }));
  }
  const killers = t.killedBy.map((k) => g.byId[k].nickname || g.byId[k].name);
  return `<li><button class="srow ${t.alive ? '' : 'gone'}" data-action="profile" data-id="${t.id}">
  ${avatar(t, d.color, 44)}
  <span class="who"><b>${esc(t.name)}</b><span>${esc(d.name)} · ${esc(PROFILES[d.profile].label)}</span>${ally ? `<span class="ally-tag" style="--a:${esc(ally.color)}">${esc(ally.name)}</span>` : ''}</span>
  ${
    t.alive
      ? `<span class="vitals">${healthBar(t.health)}<span class="hpnum">${Math.round(t.health)} hp</span>${needs.join('')}</span>
  <span class="inv">${itemChips(t.inventory)}</span>`
      : `<span class="vitals fell">${ordinal(t.placement)} · fell ${esc(t.deathLabel)}${killers.length ? ` · by ${esc(killers.join(', '))}` : ''}</span><span class="inv"></span>`
  }
  <span class="nums"><span><b>${t.kills}</b> kill${t.kills === 1 ? '' : 's'}</span><span><b>${t.popularity}</b> fans</span></span>
  <span class="oddscol">${oddsBadge(t, previousOdds(t))}<small>${esc(t.alive ? bettingLine(t.odds) : '')}</small></span>
</button></li>`;
}
