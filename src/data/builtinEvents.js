// Events the engine uses on its own, in the same template format as imported events.
// They guarantee every phase can always be filled, whatever the imported file contains.

const v = (s, base, n = 1) => `(${s}/${s}/${s}/${s}/${base}${n})`;

export const BUILTIN = {
  runAway: { id: 'builtin:runaway', phase: 'bloodbath', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('runs', 'run')} away from the Cornucopia.` },
  skipFeast: { id: 'builtin:skipfeast', phase: 'feast', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('decides', 'decide')} not to go to the Feast.` },
  filler: {
    bloodbath: { id: 'builtin:fill-bb', phase: 'bloodbath', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('runs', 'run')} away from the Cornucopia.` },
    day: { id: 'builtin:fill-day', phase: 'day', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('keeps', 'keep')} a low profile.` },
    night: { id: 'builtin:fill-night', phase: 'night', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('rests', 'rest')} quietly through the night.` },
    feast: { id: 'builtin:fill-feast', phase: 'feast', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('grabs', 'grab')} a bag and ${v('runs', 'run')}.` },
    arena: { id: 'builtin:fill-arena', phase: 'arena', fatal: false, count: 1, killers: [], killed: [], text: `(Player1) ${v('survives', 'survive')}.` },
  },
};

// Narration for deaths caused by hunger, thirst, infection or wounds at the end of a night.
export const ATTRITION_TEXT = {
  hunger: `(Player1) ${v('starves', 'starve')} to death after days without food.`,
  thirst: `(Player1) ${v('dies', 'die')} of thirst after days without water.`,
  infection: `(Player1) ${v('succumbs', 'succumb')} to [typeC1] infected wounds.`,
  wounds: `(Player1) ${v('succumbs', 'succumb')} to [typeC1] injuries.`,
};

export const SPONSOR_TEXT = `A silver parachute drifts down to (Player1).`;
export const GAMEMAKER_GIFT_TEXT = `The Gamemakers send (Player1) a gift.`;
export const ATE_TEXT = `(Player1) ${v('eats', 'eat')} some of [typeC1] supplies.`;
