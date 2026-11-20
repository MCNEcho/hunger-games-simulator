import { esc, scene, avatar, traitBar, oddsBadge } from '../components.js';
import { PROFILES, TRAITS, TRAIT_LABELS } from '../../data/districts.js';
import { pronounSet } from '../../core/grammar.js';
import { bettingLine } from '../../engine/odds.js';

export function renderReaping(app) {
  const s = app.game.state;
  const profileOptions = (current) => Object.entries(PROFILES).map(([k, p]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  const districts = s.districts
    .map((d, i) => {
      const p = PROFILES[d.profile];
      const ts = s.tributes.filter((t) => t.district === i);
      return `<section class="district" style="--c:${esc(d.color)}">
  <header><h3>${esc(d.name)}</h3>
    <label class="industry"><span class="sr">Industry for ${esc(d.name)}</span><select data-profile="${i}">${profileOptions(d.profile)}</select></label>
    <p class="blurb">${esc(p.blurb)}${p.career ? ' · Career' : ''}${p.weapon ? ` · Favourite weapon: ${esc(p.weapon)}` : ''}</p>
  </header>
  <div class="tcards">${ts.map((t) => tributeCard(t, d)).join('')}</div>
</section>`;
    })
    .join('');
  const fav = [...s.tributes].sort((a, b) => b.odds - a.odds)[0];
  return `
<section class="hero compact">
  ${scene('reaping')}
  <div class="hero-text">
    <h1>The Reaping</h1>
    <p>Traits come from each district's industry. Change a district's industry, re-roll, or edit a tribute before the games begin. Early favourite: <b>${esc(fav.name)}</b> (${Math.round(fav.odds * 100)}%).</p>
    <div class="row-actions">
      <button class="btn primary big" data-action="begin-games">Begin the Games</button>
      <button class="btn big" data-action="shuffle-reaping">Shuffle districts</button>
      <button class="btn big" data-action="reroll-all">Re-roll all traits</button>
      ${app.originalCastText ? '<button class="btn big" data-action="restore-reaping">Restore original districts</button>' : ''}
    </div>
    <p class="hint on-dark">Game code <b>${esc(s.seed)}</b></p>
  </div>
</section>
<div class="districts">${districts}</div>
<div class="bottom-cta"><button class="btn primary big" data-action="begin-games">Begin the Games</button></div>`;
}

function tributeCard(t, d) {
  return `<article class="tcard">
  <button class="tcard-top" data-action="edit-tribute" data-id="${t.id}" aria-label="Edit ${esc(t.name)}">
    ${avatar(t, d.color, 56)}
    <span class="tname"><b>${esc(t.name)}</b><span>${esc(pronounSet(t.gender).label)}</span></span>
    <span class="score" title="Training score"><b>${t.training}</b><small>training</small></span>
  </button>
  <div class="traits">${TRAITS.map((k) => traitBar(TRAIT_LABELS[k], t.traits[k])).join('')}</div>
  <div class="tfoot"><span>Odds ${oddsBadge(t)}</span><span class="muted">${esc(bettingLine(t.odds))}</span><button class="link" data-action="edit-tribute" data-id="${t.id}">Edit</button></div>
</article>`;
}
