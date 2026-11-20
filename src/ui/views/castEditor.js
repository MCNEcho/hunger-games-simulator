import { esc, avatar } from '../components.js';
import { PRONOUN_SETS } from '../../core/grammar.js';
import { CAST_LIMITS, checkCast, colorInputValue } from '../editors.js';
import { districtColor } from '../../engine/tributes.js';

export function renderCastEditor(app) {
  const d = app.view.castDraft;
  const { errors, warnings, total } = checkCast(d);
  const per = d.districts.length ? Math.max(...d.districts.map((x) => x.tributes.length)) : 2;
  const pron = (g) => Object.entries(PRONOUN_SETS).map(([k, p]) => `<option value="${k}" ${Number(k) === g ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  const moveOpts = (from) => d.districts.map((x, i) => (i === from ? '' : `<option value="${i}">${esc(x.name || `District ${i + 1}`)}</option>`)).join('');
  const districts = d.districts
    .map((dist, i) => {
      const color = districtColor(dist.color, i);
      return `<section class="edistrict" style="--c:${esc(color)}" data-district="${i}">
  <header>
    <label class="field grow"><span>District name</span><input value="${esc(dist.name)}" data-cast="d.${i}.name" maxlength="60"></label>
    <label class="field color"><span>Colour</span><input type="color" value="${esc(colorInputValue(dist.color))}" data-cast="d.${i}.color"></label>
    <button class="btn ghost small" data-action="ce-remove-district" data-d="${i}" ${d.districts.length <= 1 ? 'disabled' : ''} aria-label="Remove ${esc(dist.name)}">Remove district</button>
  </header>
  <ul class="erows">${dist.tributes
    .map(
      (t, j) => `<li class="erow">
    ${avatar({ name: t.name, image: t.photo, alive: true }, color, 44)}
    <label class="field"><span>Name</span><input value="${esc(t.name)}" data-cast="t.${i}.${j}.name" maxlength="60" autocomplete="off"></label>
    <label class="field"><span>Nickname</span><input value="${esc(t.nickname)}" data-cast="t.${i}.${j}.nickname" maxlength="40" autocomplete="off" placeholder="First name"></label>
    <label class="field"><span>Pronouns</span><select data-cast="t.${i}.${j}.gender">${pron(t.gender)}</select></label>
    <div class="erow-actions">
      <label class="file small"><input type="file" accept="image/*" data-photo="${i}.${j}"><span>${t.photo ? 'Change photo' : 'Photo'}</span></label>
      ${t.photo ? `<button class="link" data-action="ce-remove-photo" data-d="${i}" data-t="${j}">Remove photo</button>` : ''}
      ${d.districts.length > 1 ? `<label class="move"><span class="sr">Move ${esc(t.name)} to</span><select data-move="${i}.${j}" ${dist.tributes.length <= 1 ? 'disabled' : ''}><option value="">Move to…</option>${moveOpts(i)}</select></label>` : ''}
      <button class="btn icon small" data-action="ce-remove-tribute" data-d="${i}" data-t="${j}" ${dist.tributes.length <= 1 ? 'disabled' : ''} aria-label="Remove ${esc(t.name)}">✕</button>
    </div>
  </li>`,
    )
    .join('')}</ul>
  <button class="btn ghost small" data-action="ce-add-tribute" data-d="${i}" ${dist.tributes.length >= CAST_LIMITS.maxPerDistrict ? 'disabled' : ''}>Add tribute</button>
</section>`;
    })
    .join('');
  return `
<section class="editor-head">
  <div class="editor-title"><h1>Edit cast</h1><p>Build your own cast or change this one. Set how many districts there are and how many tributes each has, then fill in names. Nothing changes until you save.</p></div>
  <div class="card size-card">
    <label class="field"><span>Title</span><input value="${esc(d.title)}" data-cast="title" maxlength="80"></label>
    <div class="size-row">
      <label class="field"><span>Districts</span><input type="number" id="ce-districts" min="1" max="${CAST_LIMITS.maxDistricts}" value="${d.districts.length}" inputmode="numeric"></label>
      <label class="field"><span>Tributes per district</span><input type="number" id="ce-per" min="1" max="${CAST_LIMITS.maxPerDistrict}" value="${per}" inputmode="numeric"></label>
      <button class="btn" data-action="ce-resize">Apply size</button>
      <button class="btn ghost" data-action="ce-blank">Start from a blank cast</button>
    </div>
    <p class="hint"><b>${total}</b> tributes in <b>${d.districts.length}</b> districts. Up to ${CAST_LIMITS.maxDistricts} districts, ${CAST_LIMITS.maxPerDistrict} tributes each, ${CAST_LIMITS.maxTributes} in total. Resizing keeps everyone in their district; making it smaller removes districts and places from the end.</p>
    ${errors.length ? `<ul class="errors" role="alert">${errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<ul class="warns">${warnings.slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    <div class="row-actions"><button class="btn primary" data-action="ce-save">Save cast</button><button class="btn ghost" data-action="ce-discard">Discard changes</button></div>
  </div>
</section>
<div class="cast-edit">${districts}
  <div class="add-district"><button class="btn" data-action="ce-add-district" ${d.districts.length >= CAST_LIMITS.maxDistricts ? 'disabled' : ''}>Add a district</button></div>
</div>
<div class="row-actions center"><button class="btn primary big" data-action="ce-save">Save cast</button><button class="btn ghost big" data-action="ce-discard">Discard changes</button></div>`;
}
