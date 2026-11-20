// Actions and input handling for the cast and events editors.
// The main controller passes in a small context so this module never imports app.js.

import * as E from './editors.js';
import { exportCast } from '../io/castFormat.js';
import { exportEvents } from '../io/eventsFormat.js';
import { resizeImage } from './storage.js';
import { renderEventsMain, eventFormDialog, eventPreview, endgameFormDialog } from './views/eventsEditor.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * @param {Record<string, Function>} actions  the app's action table; editor actions are added to it
 * @param {object} ctx {app, render, toast, openModal, closeModal, loadCast, loadEvents, persistSetup}
 */
export function registerEditorActions(actions, ctx) {
  const { app, render, toast, openModal, closeModal } = ctx;
  const $ = (id) => document.getElementById(id);
  const go = (screen) => {
    app.screen = screen;
    render();
    window.scrollTo(0, 0);
  };
  const castChanged = () => {
    app.view.castDirty = true;
  };
  const eventsChanged = () => {
    app.view.eventsDirty = true;
  };

  // ------------------------------------------------------------ cast editor
  Object.assign(actions, {
    'edit-cast'() {
      app.view.castDraft = E.castToDraft(app.cast, app.photos);
      app.view.castDirty = false;
      go('cast-editor');
    },
    'ce-resize'() {
      const d = Number($('ce-districts')?.value);
      const k = Number($('ce-per')?.value);
      const res = E.resizeCast(app.view.castDraft, d, k);
      if (res.removed > 0) {
        app.view.pendingResize = res.draft;
        openModal({ type: 'confirm', title: 'Remove tributes?', body: `The new size has room for fewer tributes, so ${res.removed} tribute${res.removed === 1 ? '' : 's'} at the end will be removed.`, confirm: 'Resize', action: 'ce-resize-confirm' });
        return;
      }
      app.view.castDraft = res.draft;
      castChanged();
      render();
    },
    'ce-resize-confirm'() {
      if (app.view.pendingResize) app.view.castDraft = app.view.pendingResize;
      app.view.pendingResize = null;
      castChanged();
      closeModal();
      render();
    },
    'ce-blank'() {
      openModal({ type: 'confirm', title: 'Start from a blank cast?', body: 'Every tribute is replaced with a placeholder name, keeping the current number of districts and tributes. You can still discard this before saving.', confirm: 'Start blank', action: 'ce-blank-confirm' });
    },
    'ce-blank-confirm'() {
      const d = app.view.castDraft;
      const per = Math.max(...d.districts.map((x) => x.tributes.length));
      app.view.castDraft = E.createBlankCast(d.districts.length, per, d.title);
      castChanged();
      closeModal();
      render();
    },
    'ce-add-district'() {
      const d = app.view.castDraft;
      app.view.castDraft = E.addDistrict(d, d.districts[d.districts.length - 1]?.tributes.length || 2);
      castChanged();
      render();
      document.querySelector('.edistrict:last-of-type input')?.focus();
    },
    'ce-remove-district'(el) {
      app.view.castDraft = E.removeDistrict(app.view.castDraft, Number(el.dataset.d));
      castChanged();
      toast('District removed. Use Discard changes to undo.');
      render();
    },
    'ce-add-tribute'(el) {
      const i = Number(el.dataset.d);
      app.view.castDraft = E.addTribute(app.view.castDraft, i);
      castChanged();
      render();
      const rows = document.querySelectorAll(`.edistrict[data-district="${i}"] .erow`);
      rows[rows.length - 1]?.querySelector('input')?.select();
    },
    'ce-remove-tribute'(el) {
      app.view.castDraft = E.removeTribute(app.view.castDraft, Number(el.dataset.d), Number(el.dataset.t));
      castChanged();
      render();
    },
    'ce-remove-photo'(el) {
      app.view.castDraft.districts[Number(el.dataset.d)].tributes[Number(el.dataset.t)].photo = '';
      castChanged();
      render();
    },
    'ce-save'() {
      const final = E.finalizeCast(app.view.castDraft);
      const { errors } = E.checkCast(final);
      if (errors.length) {
        app.view.castDraft = final;
        render();
        toast(errors[0]);
        document.querySelector('.errors')?.scrollIntoView({ block: 'center' });
        return;
      }
      const res = ctx.loadCast(exportCast(final));
      if (!res.ok) {
        toast(res.warnings[0] || 'The cast could not be saved.');
        return;
      }
      // Photos follow names: keep the draft's photos, forget removed ones.
      for (const d of final.districts) for (const t of d.tributes) {
        if (t.photo) app.photos[t.name] = t.photo;
        else delete app.photos[t.name];
      }
      app.originalCastText = null;
      ctx.persistSetup();
      app.view.castDirty = false;
      app.view.castDraft = null;
      toast(`Cast saved: ${E.checkCast(final).total} tributes in ${final.districts.length} districts.`);
      go('setup');
    },
    'ce-discard'() {
      if (!app.view.castDirty) return actions['ce-discard-confirm']();
      openModal({ type: 'confirm', title: 'Discard your changes?', body: 'Your edits to the cast will be lost.', confirm: 'Discard', action: 'ce-discard-confirm' });
    },
    'ce-discard-confirm'() {
      closeModal();
      app.view.castDraft = null;
      app.view.castDirty = false;
      go('setup');
    },
  });

  // ------------------------------------------------------------ events editor
  const list = () => E.categoryList(app.view.eventsDraft, app.view.ev.cat);
  const category = () => E.CATEGORIES.find((c) => c.key === app.view.ev.cat);
  const rerenderMain = (keepSearchFocus = false) => {
    const main = $('ev-main');
    if (!main) return render();
    const caret = keepSearchFocus ? $('ev-search')?.selectionStart : null;
    main.innerHTML = renderEventsMain(app);
    if (keepSearchFocus) {
      const s = $('ev-search');
      s?.focus();
      if (s && caret !== null) s.setSelectionRange(caret, caret);
    }
  };
  const formFromEvent = (ev) => ({ text: ev.text, count: ev.count, killers: [...ev.killers], killed: [...ev.killed], requiresRaw: ev.requiresRaw || '', effectsRaw: ev.effectsRaw || '' });
  const openEventForm = (base, isNew, target, label) => {
    openModal({ type: 'event-form', base: clone(base), isNew, target, label, form: formFromEvent(base) });
    updatePreview();
  };
  const readForm = () => {
    const m = app.view.modal;
    const checked = (name) => [...document.querySelectorAll(`#modal input[name="${name}"]:checked`)].map((x) => Number(x.value));
    return {
      text: $('ev-text')?.value ?? m.form.text,
      count: Number($('ev-count')?.value ?? m.form.count),
      killers: m.base.fatal ? checked('killer') : [],
      killed: m.base.fatal ? checked('killed') : [],
      requiresRaw: $('ev-req')?.value ?? m.form.requiresRaw,
      effectsRaw: $('ev-eff')?.value ?? m.form.effectsRaw,
    };
  };
  function updatePreview() {
    const m = app.view.modal;
    const box = $('ev-preview');
    if (!m || m.type !== 'event-form' || !box) return;
    box.innerHTML = eventPreview(E.eventFromForm(m.base, readForm()));
  }
  ctx.updatePreview = updatePreview;
  ctx.readEventForm = readForm;

  const insertAtCursor = (text) => {
    const ta = $('ev-text');
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const before = ta.value.slice(0, start);
    const needsSpace = before && !/[\s(]$/.test(before);
    const ins = (needsSpace ? ' ' : '') + text;
    ta.value = before + ins + ta.value.slice(end);
    const pos = start + ins.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    updatePreview();
  };

  Object.assign(actions, {
    'edit-events'() {
      app.view.eventsDraft = clone(app.events);
      app.view.eventsDirty = false;
      app.view.ev = { cat: 'bloodbath:normal', search: '', arena: null };
      go('events-editor');
    },
    'ev-cat'(el) {
      app.view.ev = { cat: el.dataset.cat, search: '', arena: null };
      render();
      document.querySelector('.ev-main h2')?.scrollIntoView({ block: 'nearest' });
    },
    'ev-add'() {
      const c = category();
      if (c.phase === 'arena') {
        app.view.eventsDraft.arena.push(E.newArena());
        app.view.ev.arena = app.view.eventsDraft.arena.length - 1;
        eventsChanged();
        render();
        $('arena-title')?.select();
        return;
      }
      if (c.phase === 'endgame') {
        const base = E.newEndgame();
        openModal({ type: 'endgame-form', base, isNew: true, form: { text: base.text, winText: base.winText, loseText: base.loseText, chance: base.chance * 100 } });
        return;
      }
      openEventForm(E.newEvent(c.phase, c.fatal), true, { cat: c.key }, c.label);
    },
    'ev-edit'(el) {
      const c = category();
      const i = Number(el.dataset.index);
      const ev = list()[i];
      if (!ev) return;
      if (c.phase === 'endgame') {
        openModal({ type: 'endgame-form', base: clone(ev), isNew: false, index: i, form: { text: ev.text, winText: ev.winText, loseText: ev.loseText, chance: ev.chance * 100 } });
        return;
      }
      openEventForm(ev, false, { cat: c.key, index: i }, c.label);
    },
    'ev-delete'(el) {
      list().splice(Number(el.dataset.index), 1);
      eventsChanged();
      toast('Deleted. Use Discard changes to undo.');
      render();
    },
    'ev-open-arena'(el) {
      app.view.ev.arena = Number(el.dataset.index);
      render();
    },
    'ev-close-arena'() {
      app.view.ev.arena = null;
      render();
    },
    'ev-add-scenario'(el) {
      const fatal = el.dataset.kind === 'fatal';
      const base = fatal
        ? { ...E.newEvent('arena', true), text: '(Player1) (is/is/is/is/are1) swept away.', count: 1, killers: [], killed: [1] }
        : { ...E.newEvent('arena', false), text: '(Player1) (escapes/escapes/escapes/escapes/escape1) just in time.', count: 1 };
      openEventForm(base, true, { arena: app.view.ev.arena, kind: el.dataset.kind }, fatal ? 'Fatal scenario' : 'Surviving scenario');
    },
    'ev-edit-scenario'(el) {
      const a = app.view.eventsDraft.arena[app.view.ev.arena];
      const kind = el.dataset.kind;
      const i = Number(el.dataset.index);
      openEventForm(a[kind][i], false, { arena: app.view.ev.arena, kind, index: i }, kind === 'fatal' ? 'Fatal scenario' : 'Surviving scenario');
    },
    'ev-delete-scenario'(el) {
      const a = app.view.eventsDraft.arena[app.view.ev.arena];
      const kind = el.dataset.kind;
      if (kind === 'survive' && a.survive.length <= 1) {
        toast('An arena event needs at least one surviving scenario.');
        return;
      }
      a[kind].splice(Number(el.dataset.index), 1);
      eventsChanged();
      render();
    },
    tok(el) {
      const n = Number($('tok-player')?.value || 1);
      const t = el.dataset.tok;
      if (t === 'name') return insertAtCursor(`(Player${n})`);
      const ta = $('ev-text');
      const before = ta ? ta.value.slice(0, ta.selectionStart ?? ta.value.length) : '';
      const sentenceStart = !before.trim() || /[.!?]\s*$/.test(before);
      insertAtCursor(`[${sentenceStart ? 'Type' : 'type'}${t}${n}]`);
    },
    'tok-verb'() {
      const n = Number($('tok-player')?.value || 1);
      const s = ($('tok-verb-s')?.value || '').trim().replace(/[()/\[\]]/g, '');
      const b = ($('tok-verb-b')?.value || '').trim().replace(/[()/\[\]]/g, '');
      if (!s || !b) {
        toast('Type the verb both ways first, for example "runs" and "run".');
        $('tok-verb-s')?.focus();
        return;
      }
      const ta = $('ev-text');
      const before = ta ? ta.value.slice(0, ta.selectionStart ?? ta.value.length) : '';
      // After "[typeA1]" (he/she/they) the they-form takes the plural verb; after a name it does not.
      const afterPronoun = new RegExp(`\\[[tT]ypeA${n}\\]\\s*$`).test(before);
      insertAtCursor(afterPronoun ? `(${s}/${s}/${b}/${s}/${b}${n})` : `(${s}/${s}/${s}/${s}/${b}${n})`);
      $('tok-verb-s').value = '';
      $('tok-verb-b').value = '';
    },
    'ev-form-save'() {
      const m = app.view.modal;
      const res = E.eventFromForm(m.base, readForm());
      if (res.errors.length) {
        updatePreview();
        toast(res.errors[0]);
        return;
      }
      const tg = m.target;
      if (tg.cat) {
        const l = E.categoryList(app.view.eventsDraft, tg.cat);
        if (m.isNew) l.push(res.ev);
        else l[tg.index] = res.ev;
      } else {
        const a = app.view.eventsDraft.arena[tg.arena];
        if (m.isNew) a[tg.kind].push(res.ev);
        else a[tg.kind][tg.index] = res.ev;
      }
      eventsChanged();
      closeModal();
      render();
      toast(m.isNew ? 'Event added.' : 'Event updated.');
    },
    'ev-form-delete'() {
      const m = app.view.modal;
      if (m.type === 'endgame-form') app.view.eventsDraft.endgame.splice(m.index, 1);
      else if (m.target.cat) E.categoryList(app.view.eventsDraft, m.target.cat).splice(m.target.index, 1);
      else {
        const a = app.view.eventsDraft.arena[m.target.arena];
        if (m.target.kind === 'survive' && a.survive.length <= 1) {
          toast('An arena event needs at least one surviving scenario.');
          return;
        }
        a[m.target.kind].splice(m.target.index, 1);
      }
      eventsChanged();
      closeModal();
      render();
    },
    'eg-save'() {
      const m = app.view.modal;
      const res = E.endgameFromForm(m.base, { text: $('eg-text').value, winText: $('eg-win').value, loseText: $('eg-lose').value, chance: $('eg-chance').value });
      if (res.errors.length) {
        app.view.modal = { ...m, form: { text: res.ev.text, winText: res.ev.winText, loseText: res.ev.loseText, chance: res.ev.chance * 100 }, errors: res.errors };
        openModal(app.view.modal);
        return;
      }
      if (m.isNew) app.view.eventsDraft.endgame.push(res.ev);
      else app.view.eventsDraft.endgame[m.index] = res.ev;
      eventsChanged();
      closeModal();
      render();
    },
    'ev-save-all'() {
      const res = ctx.loadEvents(exportEvents(app.view.eventsDraft));
      if (!res.ok) {
        toast('The events could not be saved.');
        return;
      }
      app.view.eventsDirty = false;
      app.view.eventsDraft = null;
      toast(res.warnings.length ? `Events saved with ${res.warnings.length} warning(s); see the Events card.` : 'Events saved.');
      go('setup');
    },
    'ev-discard'() {
      if (!app.view.eventsDirty) return actions['ev-discard-confirm']();
      openModal({ type: 'confirm', title: 'Discard your changes?', body: 'Your edits to the events will be lost.', confirm: 'Discard', action: 'ev-discard-confirm' });
    },
    'ev-discard-confirm'() {
      closeModal();
      app.view.eventsDraft = null;
      app.view.eventsDirty = false;
      go('setup');
    },
  });

  return { rerenderMain };
}

/** Typing in editor fields. Returns true when handled. */
export function editorInput(e, ctx) {
  const { app } = ctx;
  const el = e.target;
  if (app.screen === 'cast-editor' && el.dataset.cast) {
    const d = app.view.castDraft;
    const path = el.dataset.cast.split('.');
    if (path[0] === 'title') d.title = el.value;
    else if (path[0] === 'd') {
      const dist = d.districts[Number(path[1])];
      if (path[2] === 'color') {
        dist.color = `${el.value.toUpperCase()} 0 0`;
        el.closest('.edistrict')?.style.setProperty('--c', el.value);
      } else dist[path[2]] = el.value;
    } else if (path[0] === 't') {
      const t = d.districts[Number(path[1])].tributes[Number(path[2])];
      t[path[3]] = path[3] === 'gender' ? Number(el.value) : el.value;
    }
    app.view.castDirty = true;
    return true;
  }
  if (app.screen === 'events-editor') {
    if (el.id === 'ev-search') {
      app.view.ev.search = el.value;
      ctx.rerenderEventsMain(true);
      return true;
    }
    if (el.id === 'arena-title') {
      app.view.eventsDraft.arena[app.view.ev.arena].title = el.value;
      app.view.eventsDirty = true;
      return true;
    }
    if (['ev-text', 'ev-req', 'ev-eff'].includes(el.id) || el.name === 'killer' || el.name === 'killed') {
      ctx.updatePreview();
      return true;
    }
  }
  return false;
}

/** Selects, files and other "change" events in the editors. Returns true when handled. */
export function editorChange(e, ctx) {
  const { app, render, toast } = ctx;
  const el = e.target;
  if (app.screen === 'cast-editor') {
    if (el.dataset.cast) return editorInput(e, ctx);
    if (el.dataset.move !== undefined && el.value !== '') {
      const [i, j] = el.dataset.move.split('.').map(Number);
      const to = Number(el.value);
      const before = app.view.castDraft;
      app.view.castDraft = E.moveTribute(before, i, j, to);
      if (app.view.castDraft.districts[to].tributes.length === before.districts[to].tributes.length) toast('That district is full.');
      app.view.castDirty = true;
      render();
      return true;
    }
    if (el.dataset.photo && el.files?.[0]) {
      const [i, j] = el.dataset.photo.split('.').map(Number);
      resizeImage(el.files[0])
        .then((url) => {
          app.view.castDraft.districts[i].tributes[j].photo = url;
          app.view.castDirty = true;
          render();
        })
        .catch((err) => toast(err.message));
      return true;
    }
  }
  if (app.screen === 'events-editor') {
    if (el.id === 'ev-count' && app.view.modal?.type === 'event-form') {
      const m = app.view.modal;
      m.form = ctx.readEventForm();
      m.form.count = Number(el.value);
      m.form.killers = m.form.killers.filter((n) => n <= m.form.count);
      m.form.killed = m.form.killed.filter((n) => n <= m.form.count);
      ctx.openModal(m);
      ctx.updatePreview();
      return true;
    }
    if (el.name === 'killer' || el.name === 'killed') {
      ctx.updatePreview();
      return true;
    }
  }
  return false;
}

