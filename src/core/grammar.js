// Renders BrantSteele event templates.
//
//   (Player1)                  -> the tribute's display name
//   (grabs/grabs/grab/grabs/grab1) -> the form for Player1's pronoun set
//   [typeA1] [typeB1] [typeC1] [typeD1] -> he/him/his/himself (capitalised with [TypeA1])
//   [Players]                  -> "A, B, and C" (endgame events)
//
// The five conjugation slots follow BrantSteele's order:
//   slot 0 male, slot 1 female, slot 2 singular they, slot 3 it, slot 4 plural.
// Cast files store gender as 1 (male) or 0 (female); 2, 3 and 4 select the other sets.

export const PRONOUN_SETS = {
  1: { slot: 0, A: 'he', B: 'him', C: 'his', D: 'himself', label: 'He/him' },
  0: { slot: 1, A: 'she', B: 'her', C: 'her', D: 'herself', label: 'She/her' },
  2: { slot: 2, A: 'they', B: 'them', C: 'their', D: 'themselves', label: 'They/them' },
  3: { slot: 3, A: 'it', B: 'it', C: 'its', D: 'itself', label: 'It/its' },
  4: { slot: 4, A: 'they', B: 'them', C: 'their', D: 'themselves', label: 'They (group)' },
};

export function pronounSet(gender) {
  return PRONOUN_SETS[gender] || PRONOUN_SETS[2];
}

const TOKEN_RE = /\(Player(\d+)\)|\(([^()]*\/[^()]*?)(\d+)\)|\[(type|Type)([A-D])(\d+)\]|\[Players\]/g;

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * @typedef {{id: string, name: string, gender: number}} Speaker
 * @typedef {{type: 'text', text: string} | {type: 'name', id: string, text: string}} Segment
 */

/**
 * Render a template into segments so the UI can style names without building HTML strings.
 * @param {string} template
 * @param {Speaker[]} players  players[0] is (Player1)
 * @returns {{segments: Segment[], errors: string[]}}
 */
export function renderSegments(template, players) {
  const segments = [];
  const errors = [];
  let last = 0;
  const pushText = (t) => {
    if (!t) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') prev.text += t;
    else segments.push({ type: 'text', text: t });
  };
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(template))) {
    pushText(template.slice(last, m.index));
    last = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) {
      const p = players[Number(m[1]) - 1];
      if (!p) {
        errors.push(`Missing Player${m[1]}`);
        pushText('someone');
      } else segments.push({ type: 'name', id: p.id, text: p.name });
    } else if (m[2] !== undefined) {
      const forms = m[2].split('/');
      const p = players[Number(m[3]) - 1];
      if (!p) {
        errors.push(`Missing player ${m[3]} for verb`);
        pushText(forms[0]);
      } else {
        const slot = pronounSet(p.gender).slot;
        pushText(forms[Math.min(slot, forms.length - 1)]);
      }
    } else if (m[5] !== undefined) {
      const p = players[Number(m[6]) - 1];
      if (!p) {
        errors.push(`Missing player ${m[6]} for pronoun`);
        pushText('they');
      } else {
        const word = pronounSet(p.gender)[m[5]];
        pushText(m[4] === 'Type' ? cap(word) : word);
      }
    } else {
      // [Players]
      const names = players.map((p) => p.name);
      players.forEach((p, i) => {
        segments.push({ type: 'name', id: p.id, text: p.name });
        if (i < players.length - 1) pushText(players.length === 2 ? ' and ' : i === players.length - 2 ? ', and ' : ', ');
      });
      if (!names.length) pushText('the tributes');
    }
  }
  pushText(template.slice(last));
  return { segments, errors };
}

/** Plain-text rendering (tests, copy-to-clipboard recaps). */
export function renderPlain(template, players) {
  return renderSegments(template, players).segments.map((s) => s.text).join('');
}

/** Highest PlayerN referenced anywhere in the template (names, verbs, pronouns). */
export function maxPlayerRef(template) {
  let max = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(template))) {
    const n = Number(m[1] ?? m[3] ?? m[6] ?? 0);
    if (n > max) max = n;
  }
  return max;
}

/** Set of PlayerN numbers that appear as names, e.g. {1, 2}. */
export function namedPlayers(template) {
  const out = new Set();
  const re = /\(Player(\d+)\)/g;
  let m;
  while ((m = re.exec(template))) out.add(Number(m[1]));
  return out;
}
