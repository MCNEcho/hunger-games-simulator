// Optional "Requires:" / "Effects:" lines that can be added under any event.
//
// Requires (separate with ";"):
//   Player2 injured | Player2 infected | Player2 hurt
//   Player1 has sword | Player1 has weapon | Player1 has food
//   Player1 hunger >= 3 | Player1 thirst >= 2 | Player1 health < 50
//   Player1 allied Player2 | Player1 not allied Player2
// Effects (separate with ";"):
//   Player1 +sword | Player1 +food 2 | Player1 -medkit
//   Player2 heal 30 | Player2 damage 20
//   Player2 +injured | Player2 -injured | Player2 +infected | Player2 -infected
//   Player1 eat | Player1 drink | Player1 popularity +5
//   Player1 ally Player2 | Player1 betray Player2 | Player1 leave alliance | Player1 steal Player2

import { ITEMS } from '../data/items.js';

const P = String.raw`player\s*(\d+)`;
const CONDS = ['injured', 'infected'];

function itemId(word) {
  const w = word.toLowerCase();
  const id = Object.keys(ITEMS).find((k) => k.toLowerCase() === w || ITEMS[k].label.toLowerCase() === w);
  return id || null;
}

/** @returns {{requires: object[], errors: string[]}} */
export function parseRequires(raw) {
  const requires = [];
  const errors = [];
  for (const part of String(raw || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    let m;
    const s = part.toLowerCase();
    if ((m = new RegExp(`^${P}\\s+(injured|infected|hurt)$`).exec(s))) requires.push({ type: 'cond', who: +m[1], cond: m[2] });
    else if ((m = new RegExp(`^${P}\\s+has\\s+(\\w+)$`).exec(s))) {
      if (m[2] === 'weapon') requires.push({ type: 'hasWeapon', who: +m[1] });
      else if (itemId(m[2])) requires.push({ type: 'has', who: +m[1], item: itemId(m[2]) });
      else errors.push(`Unknown item "${m[2]}" in "${part}"`);
    } else if ((m = new RegExp(`^${P}\\s+(hunger|thirst)\\s*>=\\s*(\\d+)$`).exec(s))) requires.push({ type: m[2], who: +m[1], min: +m[3] });
    else if ((m = new RegExp(`^${P}\\s+health\\s*<\\s*(\\d+)$`).exec(s))) requires.push({ type: 'healthBelow', who: +m[1], max: +m[2] });
    else if ((m = new RegExp(`^${P}\\s+(not\\s+)?allied\\s+${P}$`).exec(s))) requires.push({ type: m[2] ? 'notAllied' : 'allied', who: +m[1], other: +m[3] });
    else errors.push(`Could not understand requirement "${part}"`);
  }
  return { requires, errors };
}

/** @returns {{effects: object[], errors: string[]}} */
export function parseEffects(raw) {
  const effects = [];
  const errors = [];
  for (const part of String(raw || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    let m;
    const s = part.toLowerCase();
    if ((m = new RegExp(`^${P}\\s+([+-])\\s*(\\w+)(?:\\s+(\\d+))?$`).exec(s))) {
      const who = +m[1];
      const sign = m[2];
      const word = m[3];
      const n = m[4] ? +m[4] : 1;
      if (CONDS.includes(word)) effects.push({ t: 'cond', who, cond: word, on: sign === '+' });
      else if (itemId(word)) effects.push(sign === '+' ? { t: 'gain', who, item: itemId(word), n } : { t: 'lose', who, item: itemId(word), n });
      else errors.push(`Unknown item or condition "${word}" in "${part}"`);
    } else if ((m = new RegExp(`^${P}\\s+(heal|damage)\\s+(\\d+)$`).exec(s))) effects.push({ t: 'hp', who: +m[1], d: m[2] === 'heal' ? +m[3] : -m[3] });
    else if ((m = new RegExp(`^${P}\\s+(eat|drink)$`).exec(s))) effects.push({ t: m[2], who: +m[1] });
    else if ((m = new RegExp(`^${P}\\s+popularity\\s*([+-]\\d+)$`).exec(s))) effects.push({ t: 'pop', who: +m[1], d: +m[2] });
    else if ((m = new RegExp(`^${P}\\s+ally\\s+${P}$`).exec(s))) effects.push({ t: 'ally', who: [+m[1], +m[2]] });
    else if ((m = new RegExp(`^${P}\\s+betray\\s+${P}$`).exec(s))) effects.push({ t: 'betray', who: +m[1], target: +m[2] });
    else if ((m = new RegExp(`^${P}\\s+leave\\s+alliance$`).exec(s))) effects.push({ t: 'leave', who: +m[1] });
    else if ((m = new RegExp(`^${P}\\s+steal\\s+${P}$`).exec(s))) effects.push({ t: 'transfer', from: +m[2], to: +m[1], item: 'random' });
    else errors.push(`Could not understand effect "${part}"`);
  }
  return { effects, errors };
}
