import { esc, scene, avatar, ordinal } from '../components.js';

export function renderEnd(app) {
  const g = app.game;
  const s = g.state;
  const winners = s.winners.map((id) => g.byId[id]);
  const color = (t) => s.districts[t.district].color;
  const startOdds = (t) => t.oddsHistory[0]?.[1] ?? 0;
  const order = [...s.tributes].sort((a, b) => (a.placement || 999) - (b.placement || 999));
  const hero = winners.length
    ? `<div class="victors">${winners
        .map(
          (w) => `<div class="victor">${avatar(w, color(w), 120)}<div><p class="eyebrow">Victor${winners.length > 1 ? 's' : ''} of ${esc(s.title)}</p><h1>${esc(w.name)}</h1><p>${esc(s.districts[w.district].name)} · ${w.kills} kill${w.kills === 1 ? '' : 's'} · ${w.sponsorGifts} gift${w.sponsorGifts === 1 ? '' : 's'} · started at ${Math.round(startOdds(w) * 1000) / 10}% odds</p></div></div>`,
        )
        .join('')}</div>`
    : `<div class="victors"><div class="victor none"><div><p class="eyebrow">${esc(s.title)}</p><h1>No victor</h1><p>The last tributes fell together.</p></div></div></div>`;
  const awards = computeAwards(g)
    .map((a) => `<li><span class="award-name">${esc(a.title)}</span><button class="name" data-action="profile" data-id="${a.t.id}">${esc(a.t.name)}</button><span class="muted">${esc(a.detail)}</span></li>`)
    .join('');
  const killers = [...s.tributes].filter((t) => t.kills > 0).sort((a, b) => b.kills - a.kills || (a.placement || 99) - (b.placement || 99)).slice(0, 8);
  return `
<section class="hero end">
  ${scene('end')}
  ${hero}
</section>
<div class="end-grid">
  <article class="card wide">
    <h2>How the favourites' odds moved</h2>
    <p class="hint">Win odds after each phase for the final five. Lines use district colours.</p>
    <div class="fig" data-chart="odds"><svg role="img" aria-label="Odds over time for the top five finishers"></svg></div>
    <ul class="legend">${order.slice(0, 5).map((t) => `<li><span class="sw" style="background:${esc(color(t))}"></span>${ordinal(t.placement)} ${esc(t.name)}</li>`).join('')}</ul>
  </article>
  <article class="card">
    <h2>Awards</h2>
    <ul class="awards">${awards}</ul>
  </article>
  <article class="card">
    <h2>Most kills</h2>
    ${killers.length ? `<ol class="kills">${killers.map((t) => `<li><button class="name" data-action="profile" data-id="${t.id}">${esc(t.name)}</button><b>${t.kills}</b></li>`).join('')}</ol>` : '<p class="muted">Nobody killed anyone.</p>'}
  </article>
  <article class="card wide">
    <h2>Final placements</h2>
    <ol class="placements">${order
      .map(
        (t) => `<li><button class="prow" data-action="profile" data-id="${t.id}">${avatar(t, color(t), 36)}<span class="pl">${ordinal(t.placement)}</span><span class="pn"><b>${esc(t.name)}</b><span class="muted">${esc(s.districts[t.district].name)}${t.alive ? '' : ` · fell ${esc(t.deathLabel)}`}</span></span><span class="pk">${t.kills} kill${t.kills === 1 ? '' : 's'}</span></button></li>`,
      )
      .join('')}</ol>
  </article>
</div>
<div class="row-actions center">
  <button class="btn primary big" data-action="play-again">Play again with a new code</button>
  <button class="btn big" data-action="replay-code">Replay code ${esc(s.seed)}</button>
  <button class="btn big" data-action="back-to-game">Read the games again</button>
  <button class="btn ghost big" data-action="copy-recap">Copy results</button>
</div>`;
}

function computeAwards(g) {
  const s = g.state;
  const ts = s.tributes;
  const out = [];
  const best = (fn, filter = () => true) => ts.filter(filter).reduce((a, b) => (a === null || fn(b) > fn(a) ? b : a), null);
  const k = best((t) => t.kills * 100 - (t.placement || 0));
  if (k && k.kills > 0) out.push({ title: 'Most dangerous', t: k, detail: `${k.kills} kills` });
  const p = best((t) => t.popularity * 100 - (t.placement || 0));
  if (p) out.push({ title: 'Crowd favourite', t: p, detail: `${p.popularity} popularity` });
  const sp = best((t) => t.sponsorGifts * 100 - (t.placement || 0));
  if (sp && sp.sponsorGifts > 0) out.push({ title: 'Most sponsored', t: sp, detail: `${sp.sponsorGifts} gifts` });
  const bare = best((t) => -(t.placement || 99), (t) => !t.everArmed);
  if (bare) out.push({ title: 'Never held a weapon', t: bare, detail: `finished ${ordinal(bare.placement)}` });
  const top4 = ts.filter((t) => t.placement && t.placement <= 4);
  const upset = top4.reduce((a, b) => (a === null || (b.oddsHistory[0]?.[1] ?? 1) < (a.oddsHistory[0]?.[1] ?? 1) ? b : a), null);
  if (upset) out.push({ title: 'Biggest surprise', t: upset, detail: `${ordinal(upset.placement)} from ${Math.round((upset.oddsHistory[0]?.[1] ?? 0) * 1000) / 10}% odds` });
  const first = ts.filter((t) => t.victims.length).sort((a, b) => firstKillPhase(g, a) - firstKillPhase(g, b))[0];
  if (first) out.push({ title: 'First blood', t: first, detail: 'first kill of the games' });
  return out;
}

function firstKillPhase(g, t) {
  return Math.min(...t.victims.map((v) => g.byId[v].deathPhase ?? 999));
}
