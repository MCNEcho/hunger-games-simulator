import { esc, scene, avatar, chip, ordinal } from '../components.js';
import { SPEEDS } from '../constants.js';

function phaseIndex(app) {
  const g = app.game;
  return app.view.phase ?? g.state.phases.length - 1;
}

export function renderGame(app) {
  const g = app.game;
  const s = g.state;
  if (!s.phases.length) return '<p class="empty">The games have not started yet.</p>';
  const idx = phaseIndex(app);
  const phase = s.phases[idx];
  const latest = idx === s.phases.length - 1;
  const shown = latest ? Math.min(app.view.revealed, phase.entries.length) : phase.entries.length;
  const entries = phase.entries.slice(0, shown).map((e, i) => renderEntry(app, phase, e, i)).join('');
  const tabs = s.phases
    .map((p, i) => `<button class="tab ${i === idx ? 'on' : ''} k-${p.kind}" data-action="view-phase" data-index="${i}" ${i === idx ? 'aria-current="true"' : ''}>${esc(shortTitle(p))}</button>`)
    .join('');
  const sub = phase.kind === 'arena' ? phase.intro : phase.intro;
  const finishedHere = s.finished && latest && shown >= phase.entries.length;
  return `
<nav class="tabs" aria-label="Phases">${tabs}</nav>
<section class="phase-head k-${phase.kind}">
  ${scene(phase.kind)}
  <div class="phase-title">
    <h1>${esc(phase.kind === 'arena' ? 'Arena event' : phase.title)}${phase.gamemaker ? ' <span class="gm-flag">Gamemakers</span>' : ''}</h1>
    ${sub ? `<p>${esc(sub)}</p>` : ''}
  </div>
</section>
<ol class="feed k-${phase.kind}" aria-live="polite">${entries}</ol>
${finishedHere ? `<div class="finale"><p>${s.winners.length ? `${s.winners.map((id) => esc(g.byId[id].name)).join(' and ')} ${s.winners.length > 1 ? 'win' : 'wins'} the games.` : 'There is no victor this year.'}</p><button class="btn primary big" data-action="show-end">See the results</button></div>` : ''}`;
}

function shortTitle(p) {
  if (p.kind === 'fallen') return 'Fallen';
  if (p.kind === 'bloodbath') return 'Bloodbath';
  if (p.kind === 'arena') return `Arena ${p.day}`;
  if (p.kind === 'feast') return 'Feast';
  if (p.kind === 'endgame') return 'Finale';
  return p.title;
}

/** One line of the feed. */
export function renderEntry(app, phase, e, i) {
  const g = app.game;
  const s = g.state;
  const color = (t) => s.districts[t.district].color;
  if (e.kind === 'fallen') {
    const t = g.byId[e.cast[0]];
    const killers = t.killedBy.map((k) => g.byId[k].nickname || g.byId[k].name);
    return `<li class="entry fallen"><button class="fallen-card" data-action="profile" data-id="${t.id}">${avatar({ ...t, alive: false }, color(t), 72)}<span><b>${esc(t.name)}</b><span>${esc(s.districts[t.district].name)}</span><span class="muted">${ordinal(t.placement)} · ${esc(t.deathLabel)}${killers.length ? ` · by ${esc(killers.join(', '))}` : ''}</span></span></button></li>`;
  }
  if (e.kind === 'notes') {
    const rows = e.cast
      .filter((id) => e.changes[id]?.length)
      .map((id) => {
        const t = g.byId[id];
        return `<li><button class="name" data-action="profile" data-id="${id}">${esc(t.nickname || t.name)}</button> ${e.changes[id].map(chip).join('')}</li>`;
      })
      .join('');
    if (!rows) return '';
    return `<li class="entry notes"><h4>Before dawn</h4><ul>${rows}</ul></li>`;
  }
  const cast = e.cast.map((id) => g.byId[id]);
  const faces = cast.map((t) => {
    const died = e.deaths.includes(t.id);
    return avatar({ ...t, alive: !died }, color(t), cast.length > 4 ? 36 : 44);
  });
  const text = e.segments
    .map((seg) => (seg.type === 'name' ? `<button class="name" data-action="profile" data-id="${esc(seg.id)}" style="--c:${esc(color(g.byId[seg.id]))}">${esc(seg.text)}</button>` : esc(seg.text)))
    .join('');
  const changes = Object.entries(e.changes)
    .filter(([, cs]) => cs.length)
    .map(([id, cs]) => {
      const t = g.byId[id];
      return `<span class="chg"><span class="who">${esc(t.nickname || t.name)}</span>${cs.map(chip).join('')}</span>`;
    })
    .join('');
  const kindClass = e.deaths.length ? 'death' : e.kind;
  const label = e.kind === 'sponsor' ? '<span class="tag sponsor"><svg width="16" height="16"><use href="#chute"/></svg>Sponsor</span>' : e.kind === 'gamemaker' ? '<span class="tag gm">Gamemakers</span>' : e.kind === 'attrition' ? '<span class="tag bad">Before dawn</span>' : '';
  return `<li class="entry ${kindClass}" style="--i:${i}"><div class="faces">${faces.join('')}</div><div class="body">${label}<p class="line">${text}</p>${changes ? `<div class="changes">${changes}</div>` : ''}</div></li>`;
}

export function renderControls(app) {
  const g = app.game;
  const s = g.state;
  const idx = phaseIndex(app);
  const latest = idx === s.phases.length - 1;
  const phase = s.phases[idx];
  const revealing = latest && phase && app.view.revealed < phase.entries.length;
  let label;
  if (!latest) label = 'Back to the latest';
  else if (revealing) label = 'Show all';
  else if (s.finished) label = 'See the results';
  else label = `Proceed: ${g.nextPhaseInfo().title}`;
  const pending = [s.pending.disaster ? 'Disaster queued' : '', s.pending.feast ? 'Feast called' : ''].filter(Boolean).join(' · ');
  return `<div class="ctl">
  <button class="btn icon" data-action="step-phase" data-step="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Previous phase">‹</button>
  <button class="btn primary grow" data-action="${!latest || revealing || !s.finished ? 'proceed' : 'show-end'}">${esc(label)}</button>
  <button class="btn icon" data-action="step-phase" data-step="1" ${latest ? 'disabled' : ''} aria-label="Next phase">›</button>
  <button class="btn ${app.view.auto ? 'on' : ''}" data-action="toggle-auto" ${s.finished && !revealing ? 'disabled' : ''} aria-pressed="${app.view.auto}">${app.view.auto ? 'Pause' : 'Auto-play'}</button>
  <label class="speed"><span class="sr">Speed</span><select id="speed">${Object.entries(SPEEDS).map(([k, v]) => `<option value="${k}" ${k === app.view.speed ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
  ${!s.finished ? '<button class="btn ghost small hide-sm" data-action="skip-to-end">Skip to end</button>' : ''}
</div>${pending ? `<p class="pending">${esc(pending)}: happens on Proceed</p>` : ''}`;
}
