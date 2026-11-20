import { boot } from './app.js';
import { SVG_DEFS, AVATAR_GRADIENT } from './components.js';

function start() {
  document.getElementById('defs').innerHTML = SVG_DEFS + AVATAR_GRADIENT;
  try {
    boot();
  } catch (err) {
    console.error(err);
    document.getElementById('main').innerHTML = `<div class="card" style="margin:24px"><h2>Something went wrong while loading</h2><p>${String(err && err.message).replace(/[<>&]/g, '')}</p><p>Reloading the page usually fixes this. If it keeps happening, the saved game may be damaged: clear this site's data for the page and reload.</p></div>`;
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
