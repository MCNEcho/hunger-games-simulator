// Small rendering helpers shared by every view. All user text goes through esc().

import { itemLabel, ITEMS } from '../data/items.js';
import { oddsLabel } from '../engine/odds.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Shared SVG definitions (bust silhouette), inserted once in the page. */
export const SVG_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="bust" viewBox="0 0 64 64"><circle cx="32" cy="24" r="11"/><path d="M10 64c1-14 10-22 22-22s21 8 22 22z"/></symbol>
<symbol id="tree" viewBox="0 0 20 40"><path d="M10 0 20 26H13v14H7V26H0z"/></symbol>
<symbol id="chute" viewBox="0 0 24 24"><path d="M3 10a9 7 0 0 1 18 0zM4 10l7 8M20 10l-7 8M12 10v8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="17" width="4" height="4" rx="1" fill="currentColor"/></symbol>
</defs></svg>`;

/**
 * Tribute token: uploaded photo if there is one, otherwise a bust in the district colour.
 * @param {object} t tribute  @param {string} color district colour  @param {number} size px
 */
export function avatar(t, color, size = 48, extraClass = '') {
  const dead = t.alive === false;
  const cls = `av ${dead ? 'dead' : ''} ${extraClass}`;
  const title = esc(t.name);
  if (t.image && t.image.startsWith('data:image/')) {
    return `<span class="${cls}" style="--c:${esc(color)};width:${size}px;height:${size}px"><img src="${esc(t.image)}" alt="${title}" width="${size}" height="${size}"></span>`;
  }
  return `<span class="${cls}" style="--c:${esc(color)};width:${size}px;height:${size}px" role="img" aria-label="${title}"><svg viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="14" fill="var(--c)"/><rect width="64" height="64" rx="14" fill="url(#avshade)" /><use href="#bust" fill="rgb(255 255 255 / .28)"/><text x="32" y="58" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${esc(initials(t.name))}</text></svg></span>`;
}

export const AVATAR_GRADIENT = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="avshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs></svg>`;

export function chip(c) {
  return `<span class="chip ${esc(c.kind)}">${esc(c.text)}</span>`;
}

export function itemChips(inventory) {
  const entries = Object.entries(inventory || {}).filter(([, n]) => n > 0);
  if (!entries.length) return '<span class="muted">Nothing</span>';
  entries.sort((a, b) => kindOrder(a[0]) - kindOrder(b[0]));
  return entries.map(([id, n]) => `<span class="item k-${esc(ITEMS[id]?.kind || 'misc')}">${esc(itemLabel(id))}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
}

function kindOrder(id) {
  return ['weapon', 'explosive', 'armor', 'medical', 'water', 'food', 'shelter', 'tool'].indexOf(ITEMS[id]?.kind ?? 'tool');
}

export function healthBar(h) {
  const v = Math.max(0, Math.min(100, Math.round(h)));
  const tone = v > 65 ? 'ok' : v > 35 ? 'warn' : 'bad';
  return `<span class="hp ${tone}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="Health ${v}"><span style="width:${v}%"></span></span>`;
}

export function traitBar(label, v) {
  return `<div class="trait"><span>${esc(label)}</span><span class="bar"><span style="width:${v * 10}%"></span></span><b>${v}</b></div>`;
}

export function oddsBadge(t, prev) {
  if (!t.alive) return '<span class="odds muted">—</span>';
  let arrow = '';
  if (prev !== undefined && prev !== null) {
    const d = t.odds - prev;
    if (d > 0.004) arrow = '<span class="up" aria-label="up">▲</span>';
    else if (d < -0.004) arrow = '<span class="down" aria-label="down">▼</span>';
  }
  return `<span class="odds">${oddsLabel(t.odds)}${arrow}</span>`;
}

/** Odds the tribute had at the previous recorded phase. */
export function previousOdds(t) {
  const h = t.oddsHistory;
  if (!h || h.length < 2) return null;
  return h[h.length - 2][1];
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * The arena scene at the top of each phase: treeline, sky and a sign of the phase.
 * kind: bloodbath | day | night | arena | feast | fallen | endgame | reaping | setup | end
 */
export function scene(kind) {
  const sky = {
    day: ['#7fb2c9', '#d9e7d8'],
    bloodbath: ['#c7633f', '#f2c48d'],
    feast: ['#b7894a', '#f1dca8'],
    arena: ['#4a1f24', '#c4482f'],
    night: ['#08111c', '#1f3a4a'],
    fallen: ['#141c22', '#4a5560'],
    endgame: ['#2b1a12', '#d9783c'],
    reaping: ['#2c3d33', '#8fa58f'],
    setup: ['#0c1712', '#2d4a3a'],
    end: ['#3a2410', '#f0b45c'],
  }[kind] || ['#0c1712', '#2d4a3a'];
  const id = `sky-${kind}`;
  const trees = [];
  for (let i = 0; i < 26; i++) {
    const x = i * 40 - 10 + ((i * 37) % 17);
    const h = 70 + ((i * 53) % 45);
    trees.push(`<use href="#tree" x="${x}" y="${170 - h}" width="${h / 2}" height="${h}"/>`);
  }
  const far = [];
  for (let i = 0; i < 34; i++) {
    const x = i * 31 + ((i * 29) % 13);
    const h = 45 + ((i * 41) % 30);
    far.push(`<use href="#tree" x="${x}" y="${160 - h}" width="${h / 2}" height="${h}"/>`);
  }
  let mark = '';
  if (kind === 'day' || kind === 'reaping') mark = '<circle cx="660" cy="56" r="28" fill="#fff6d8" opacity=".9"/>';
  if (kind === 'night' || kind === 'setup') mark = '<circle cx="660" cy="52" r="22" fill="#e9eef0"/><circle cx="671" cy="45" r="20" fill="url(#' + id + ')"/>' + stars();
  if (kind === 'bloodbath' || kind === 'feast') mark = '<g transform="translate(330 30) scale(.78)"><path d="M430 150c40-70 130-80 190-40l-20 14c-50-30-115-20-150 30z" fill="#e8c27a" stroke="#5a3d16" stroke-width="3"/><path d="M600 110l40-34 6 12-34 30z" fill="#e8c27a" stroke="#5a3d16" stroke-width="3"/></g>';
  if (kind === 'arena') mark = '<path d="M0 60 L960 20 L960 34 L0 74z" fill="#ffb347" opacity=".25"/><path d="M0 92 L960 52 L960 60 L0 100z" fill="#ffb347" opacity=".18"/>';
  if (kind === 'fallen') mark = '<g fill="#cfd6db" opacity=".35"><circle cx="260" cy="60" r="26"/><circle cx="290" cy="50" r="20"/><circle cx="700" cy="70" r="30"/><circle cx="735" cy="58" r="22"/></g>' + stars();
  if (kind === 'end' || kind === 'endgame') mark = '<circle cx="480" cy="130" r="70" fill="#ffe2a0" opacity=".85"/>';
  return `<svg class="scene" viewBox="0 0 960 180" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="960" height="180" fill="url(#${id})"/>${mark}<g fill="rgb(10 25 18 / .55)">${far.join('')}</g><g fill="#0b1a12">${trees.join('')}</g><rect y="168" width="960" height="12" fill="#0b1a12"/></svg>`;
}

function stars() {
  let s = '';
  for (let i = 0; i < 40; i++) s += `<circle cx="${(i * 97) % 960}" cy="${(i * 53) % 110}" r="${i % 3 ? 1 : 1.6}" fill="#fff" opacity="${0.4 + (i % 5) * 0.12}"/>`;
  return s;
}
