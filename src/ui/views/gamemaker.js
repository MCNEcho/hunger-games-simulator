import { esc } from '../components.js';
import { GIFTABLE, itemLabel } from '../../data/items.js';
import { mostNeeded } from '../../engine/tributes.js';

export function renderGamemaker(app) {
  const g = app.game;
  const s = g.state;
  const can = g.canIntervene();
  const reason = s.finished ? 'The games are over.' : !s.phases.length ? 'Available once the Bloodbath has happened.' : '';
  const alive = [...g.alive()].sort((a, b) => a.name.localeCompare(b.name));
  const arenas = g.events.arena;
  const pendingArena = s.pending.disaster ? (s.pending.disaster === 'random' ? 'A random disaster' : arenas.find((a) => a.id === s.pending.disaster)?.title || 'A disaster') : '';
  const need = (t) => {
    const n = mostNeeded(t);
    return n === 'weapon' ? 'a weapon' : itemLabel(n).toLowerCase();
  };
  return `<div class="panel-head"><h2>Gamemaker</h2><button class="btn icon" data-action="close-panel" aria-label="Close Gamemaker controls">✕</button></div>
<div class="panel-body gm">
  ${reason ? `<p class="notice">${esc(reason)}</p>` : '<p class="muted">Disasters and the Feast happen as the next phase when you press Proceed. Gifts arrive straight away.</p>'}
  <section>
    <h3>Start a disaster</h3>
    ${pendingArena ? `<p class="queued">Queued: ${esc(pendingArena)} <button class="link" data-action="gm-cancel" data-kind="disaster">Cancel</button></p>` : ''}
    <label class="field"><span>Disaster</span><select id="gm-arena" ${!can || !arenas.length ? 'disabled' : ''}><option value="random">Surprise me</option>${arenas.map((a) => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}</select></label>
    <button class="btn danger" data-action="gm-disaster" ${!can || !arenas.length ? 'disabled' : ''}>Unleash it next</button>
    ${!arenas.length ? '<p class="hint">No arena events are loaded.</p>' : ''}
  </section>
  <section>
    <h3>Call a Feast</h3>
    ${s.pending.feast ? '<p class="queued">The Feast is called. <button class="link" data-action="gm-cancel" data-kind="feast">Cancel</button></p>' : ''}
    <p class="hint">Restocks the Cornucopia. Hungry, thirsty and hurt tributes are most likely to come.</p>
    <button class="btn" data-action="gm-feast" ${!can || s.pending.feast ? 'disabled' : ''}>Call the Feast next</button>
  </section>
  <section>
    <h3>Send a gift</h3>
    <label class="field"><span>Tribute</span><select id="gm-tribute" ${!can ? 'disabled' : ''}>${alive.map((t) => `<option value="${t.id}">${esc(t.name)} (needs ${esc(need(t))})</option>`).join('')}</select></label>
    <label class="field"><span>Gift</span><select id="gm-item" ${!can ? 'disabled' : ''}>${GIFTABLE.map((id) => `<option value="${id}">${esc(itemLabel(id))}</option>`).join('')}</select></label>
    <button class="btn primary" data-action="gm-gift" ${!can || !alive.length ? 'disabled' : ''}>Send now</button>
  </section>
</div>`;
}
