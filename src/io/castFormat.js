// BrantSteele cast import/export.
//
// Format (blank lines separate blocks):
//   Title
//   Logo URL
//
//
//   District 1
//   #FFFFFF 0 0          <- colour line marks a district header
//
//   Name
//   Nickname
//   1                    <- gender: 1 male, 0 female (2-4 other pronoun sets)
//   Image URL
//   BW                   <- how the image is shown after death
//
// The parser is tolerant: CRLF or LF, extra blank lines, trailing spaces,
// missing logo, missing image/BW lines, and tributes before any district header.

const COLOR_RE = /^#[0-9a-fA-F]{3,8}(\s|$)/;
const URLISH_RE = /^(https?:\/\/|data:|\/\/)/i;

function splitBlocks(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

function isColorLine(line) {
  return typeof line === 'string' && COLOR_RE.test(line.trim());
}

function parseGender(raw) {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : null;
}

/**
 * @typedef {{name: string, nickname: string, gender: number, image: string, deathStyle: string}} CastTribute
 * @typedef {{name: string, color: string, tributes: CastTribute[]}} CastDistrict
 * @typedef {{title: string, logo: string, districts: CastDistrict[], warnings: string[]}} Cast
 */

/** @returns {Cast} */
export function parseCast(text) {
  const blocks = splitBlocks(text);
  const cast = { title: 'The Hunger Games', logo: '', districts: [], warnings: [] };
  if (!blocks.length) {
    cast.warnings.push('The cast file is empty.');
    return cast;
  }

  let start = 0;
  const first = blocks[0];
  // A title block is a block that is not a district header and not a tribute (no gender line).
  const looksLikeDistrict = first.length >= 2 && isColorLine(first[1]);
  const looksLikeTribute = first.length >= 3 && parseGender(first[2]) !== null;
  if (!looksLikeDistrict && !looksLikeTribute && first.length <= 2) {
    cast.title = first[0];
    cast.logo = first[1] && URLISH_RE.test(first[1]) ? first[1] : '';
    start = 1;
  }

  let current = null;
  const ensureDistrict = () => {
    if (!current) {
      current = { name: `District ${cast.districts.length + 1}`, color: '#FFFFFF 0 0', tributes: [] };
      cast.districts.push(current);
    }
    return current;
  };

  for (let b = start; b < blocks.length; b++) {
    const block = blocks[b];
    let i = 0;
    if (block.length >= 2 && isColorLine(block[1]) && parseGender(block[2]) === null) {
      current = { name: block[0], color: block[1], tributes: [] };
      cast.districts.push(current);
      i = 2;
    } else if (block.length === 1 && b + 1 < blocks.length) {
      // A lone line followed by a tribute block: treat as a district name with no colour line.
      const next = blocks[b + 1];
      if (next.length >= 3 && parseGender(next[2]) !== null && !isColorLine(next[1])) {
        current = { name: block[0], color: '#FFFFFF 0 0', tributes: [] };
        cast.districts.push(current);
        continue;
      }
    }
    // Remaining lines are one or more tributes of up to 5 lines each.
    while (i < block.length) {
      const name = block[i];
      const nickname = block[i + 1];
      const gender = parseGender(block[i + 2]);
      if (nickname === undefined || gender === null) {
        cast.warnings.push(`Skipped "${name}": expected name, nickname and a gender number (1 or 0).`);
        break;
      }
      let used = 3;
      let image = '';
      let deathStyle = 'BW';
      const l3 = block[i + 3];
      const l4 = block[i + 4];
      if (l3 !== undefined && parseGender(block[i + 5]) === null) {
        // l3 is the image unless it is clearly the start of another tribute
        image = l3;
        used = 4;
        if (l4 !== undefined) {
          deathStyle = l4;
          used = 5;
        }
      }
      ensureDistrict().tributes.push({ name, nickname: nickname || name, gender, image, deathStyle });
      i += used;
    }
  }

  // Drop empty districts but keep a warning.
  const empty = cast.districts.filter((d) => !d.tributes.length);
  if (empty.length) cast.warnings.push(`${empty.length} district(s) had no tributes and were ignored.`);
  cast.districts = cast.districts.filter((d) => d.tributes.length);
  if (!cast.districts.length) cast.warnings.push('No tributes were found.');
  return cast;
}

/** @param {Cast} cast */
export function exportCast(cast) {
  const out = [cast.title || 'The Hunger Games', cast.logo || '', ''];
  cast.districts.forEach((d) => {
    out.push('', d.name, d.color || '#FFFFFF 0 0', '');
    d.tributes.forEach((t, i) => {
      if (i) out.push('');
      // Uploaded photos (data: URLs) are not portable to BrantSteele; export a blank-safe placeholder.
      const image = t.image && !t.image.startsWith('data:') ? t.image : 'https://cdn.brantsteele.com/images/hungergames/01/district3male.png';
      out.push(t.name, t.nickname || t.name, String(t.gender), image, t.deathStyle || 'BW');
    });
  });
  return out.join('\n');
}

export function countTributes(cast) {
  return cast.districts.reduce((n, d) => n + d.tributes.length, 0);
}

/**
 * Randomly reassign tributes to districts. District names, colours and sizes stay the same,
 * so a 2-per-district cast stays 2 per district; only who is where (and who is paired) changes.
 * @param {Cast} cast
 * @param {{shuffle: (a: any[]) => any[]}} rng  any object with a shuffle(array) method (core/rng.js)
 * @returns {Cast} a new cast; the input is not modified
 */
export function shuffleCast(cast, rng) {
  const everyone = cast.districts.flatMap((d) => d.tributes.map((t) => ({ ...t })));
  const mixed = rng.shuffle(everyone);
  let i = 0;
  return {
    ...cast,
    warnings: [],
    districts: cast.districts.map((d) => ({ ...d, tributes: d.tributes.map(() => mixed[i++]) })),
  };
}

/** True when two casts hold the same tributes in the same districts. */
export function sameArrangement(a, b) {
  const key = (c) => c.districts.map((d) => d.tributes.map((t) => t.name).join('|')).join('||');
  return key(a) === key(b);
}
