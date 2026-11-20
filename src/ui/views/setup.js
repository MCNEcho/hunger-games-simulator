import { esc, scene } from '../components.js';
import { countTributes } from '../../io/castFormat.js';
import { countEvents } from '../../io/eventsFormat.js';
import { LENGTH_PRESETS } from '../../engine/pacing.js';

const opt = (value, label, current) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;

export function renderSetup(app) {
  const cast = app.cast;
  const n = cast ? countTributes(cast) : 0;
  const ev = app.events ? countEvents(app.events) : { normal: 0, fatal: 0, arena: 0, endgame: 0 };
  const g = app.game;
  const resumable = g && (g.state.started || g.state.tributes.length);
  const resumeLabel = !g ? '' : g.state.finished ? 'See last results' : g.state.started ? `Resume game (${g.state.phases[g.state.phases.length - 1]?.title || 'Bloodbath'})` : 'Resume the Reaping';
  const s = app.settings;
  const phaseRows = ['bloodbath', 'day', 'night', 'feast']
    .map((p) => `<tr><td>${p[0].toUpperCase() + p.slice(1)}</td><td class="num">${app.events[p].normal.length}</td><td class="num">${app.events[p].fatal.length}</td></tr>`)
    .join('');
  return `
<section class="hero">
  ${scene('setup')}
  <div class="hero-text">
    <h1>${esc(cast?.title || 'The Hunger Games')}</h1>
    <p>${n} tributes from ${cast?.districts.length || 0} districts. Every item, injury, alliance and sponsor changes their odds of winning.</p>
    <div class="row-actions">
      <button class="btn primary big" data-action="start-reaping">${g && g.state.started && !g.state.finished ? 'Start a new Reaping' : 'Start the Reaping'}</button>
      ${resumable ? `<button class="btn big" data-action="resume">${esc(resumeLabel)}</button>` : ''}
    </div>
  </div>
</section>

<div class="setup-grid">
  <article class="card">
    <h2>Tributes</h2>
    <p class="lead"><b>${n}</b> tributes in <b>${cast?.districts.length || 0}</b> districts${app.originalCastText ? ' <span class="chip warn">Shuffled</span>' : ''}</p>
    <ul class="district-list">${(cast?.districts || []).map((d) => `<li><b>${esc(d.name)}</b> ${d.tributes.map((t) => esc(t.nickname || t.name)).join(', ')}</li>`).join('')}</ul>
    ${warnings(app.castWarnings)}
    <div class="row-actions">
      <button class="btn" data-action="edit-cast">Edit cast</button>
      <button class="btn" data-action="shuffle-cast">Shuffle districts</button>
      ${app.originalCastText ? '<button class="btn ghost" data-action="restore-cast">Restore original order</button>' : ''}
    </div>
    <div class="row-actions">
      <button class="btn" data-action="import-cast">Import cast</button>
      <button class="btn ghost" data-action="export-cast">Export</button>
      <button class="btn ghost" data-action="reset-cast">Use default cast</button>
    </div>
    <p class="hint">Edit cast lets you build your own list and choose how many districts there are. Shuffling puts everyone in a random district with a new partner. Import takes a BrantSteele cast export or .txt file.</p>
  </article>

  <article class="card">
    <h2>Events</h2>
    <table class="mini"><thead><tr><th>Phase</th><th class="num">Events</th><th class="num">Fatal</th></tr></thead><tbody>${phaseRows}
      <tr><td>Arena disasters</td><td class="num" colspan="2">${ev.arena}</td></tr>
      <tr><td>Endgame</td><td class="num" colspan="2">${ev.endgame}</td></tr></tbody></table>
    ${warnings(app.eventWarnings)}
    <div class="row-actions">
      <button class="btn" data-action="edit-events">Edit events</button>
      <button class="btn" data-action="import-events">Import events</button>
      <button class="btn ghost" data-action="export-events">Export</button>
      <button class="btn ghost" data-action="reset-events">Use expanded list</button>
    </div>
    <details class="help"><summary>How events change the odds</summary>
      <p>The simulator reads each event's wording. "grabs a sword" gives a sword, "tends to (Player2)'s wounds" only happens if Player2 is hurt, "dies from hunger" needs four days without food, and sponsor gifts go to popular tributes who need them.</p>
      <p>To control an event exactly, add optional lines under it (BrantSteele ignores them):</p>
      <pre>(Player1) (finds/finds/finds/finds/find1) a hidden medkit.
1
Requires: Player1 injured
Effects: Player1 +medkit; Player1 heal 20</pre>
      <p>Requires: <code>PlayerN injured | infected | hurt</code>, <code>PlayerN has sword</code>, <code>PlayerN hunger &gt;= 3</code>, <code>PlayerN health &lt; 50</code>, <code>PlayerN allied PlayerM</code>.<br>Effects: <code>PlayerN +item</code>, <code>-item</code>, <code>heal 20</code>, <code>damage 20</code>, <code>+injured</code>, <code>eat</code>, <code>drink</code>, <code>popularity +5</code>, <code>ally PlayerM</code>, <code>betray PlayerM</code>, <code>steal PlayerM</code>.</p>
    </details>
  </article>

  <article class="card">
    <h2>Settings</h2>
    <label class="field"><span>Game length</span><select data-setting="length">${Object.entries(LENGTH_PRESETS).map(([k, v]) => opt(k, v.label, s.length)).join('')}</select></label>
    <label class="field"><span>Arena disasters</span><select data-setting="arenaFrequency">${opt('off', 'Never on their own', s.arenaFrequency)}${opt('normal', 'Sometimes', s.arenaFrequency)}${opt('often', 'Often', s.arenaFrequency)}</select></label>
    <label class="field"><span>Running from the Cornucopia</span><select data-setting="cornucopiaRate">${opt('normal', 'Normal', s.cornucopiaRate)}${opt('decreased', 'Less often', s.cornucopiaRate)}</select></label>
    <label class="check"><input type="checkbox" data-setting="feast" ${s.feast ? 'checked' : ''}><span>Hold a Feast around day 3–5</span></label>
    <label class="check"><input type="checkbox" data-setting="endgame" ${s.endgame ? 'checked' : ''}><span>Endgame events (last tributes can try to win together)</span></label>
    ${s.endgame ? `<label class="field"><span>Endgame applies to</span><select data-setting="endgameTrigger">${opt('districts', 'District partners only', s.endgameTrigger)}${opt('anyone', 'Any final two', s.endgameTrigger)}</select></label>` : ''}
    <label class="field"><span>Game code</span><span class="inline"><input id="seed-input" value="${esc(app.seed)}" maxlength="40" autocomplete="off" spellcheck="false"><button class="btn ghost" data-action="new-code">New</button></span></label>
    <p class="hint">The same code, cast, events and settings replay the same game, as long as no Gamemaker actions are used.</p>
  </article>
</div>`;
}

function warnings(list) {
  if (!list?.length) return '';
  return `<details class="warn"><summary>${list.length} warning${list.length === 1 ? '' : 's'} from the import</summary><ul>${list.slice(0, 30).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>${list.length > 30 ? `<p>…and ${list.length - 30} more.</p>` : ''}</details>`;
}
