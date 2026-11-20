// District profiles. Each district's industry shapes its tributes' traits (1-10)
// and gives a favourite weapon they are better with. Districts beyond 13 default
// to "Outlying" (balanced) and can be reassigned in the Reaping screen.

export const TRAITS = ['strength', 'stealth', 'survival', 'charisma'];
export const TRAIT_LABELS = { strength: 'Strength', stealth: 'Stealth', survival: 'Survival', charisma: 'Charisma' };

export const PROFILES = {
  luxury: { label: 'Luxury', career: true, means: { strength: 7, stealth: 4, survival: 4, charisma: 8 }, weapon: 'knife', blurb: 'Trained Career, crowd favourite' },
  masonry: { label: 'Masonry', career: true, means: { strength: 8, stealth: 4, survival: 5, charisma: 6 }, weapon: 'sword', blurb: 'Trained Career, brute force' },
  technology: { label: 'Technology', career: false, means: { strength: 4, stealth: 6, survival: 5, charisma: 5 }, weapon: 'explosives', blurb: 'Traps and explosives' },
  fishing: { label: 'Fishing', career: true, means: { strength: 7, stealth: 5, survival: 7, charisma: 6 }, weapon: 'trident', blurb: 'Career, at home near water' },
  power: { label: 'Power', career: false, means: { strength: 4, stealth: 7, survival: 5, charisma: 4 }, weapon: 'blowgun', blurb: 'Clever and hard to find' },
  transportation: { label: 'Transportation', career: false, means: { strength: 4, stealth: 5, survival: 5, charisma: 4 }, weapon: 'hatchet', blurb: 'Quick on their feet' },
  lumber: { label: 'Lumber', career: false, means: { strength: 7, stealth: 5, survival: 6, charisma: 4 }, weapon: 'axe', blurb: 'Strong, deadly with an axe' },
  textiles: { label: 'Textiles', career: false, means: { strength: 4, stealth: 7, survival: 5, charisma: 5 }, weapon: 'knife', blurb: 'Camouflage experts' },
  grain: { label: 'Grain', career: false, means: { strength: 5, stealth: 5, survival: 6, charisma: 4 }, weapon: 'sickle', blurb: 'Hardy field workers' },
  livestock: { label: 'Livestock', career: false, means: { strength: 6, stealth: 4, survival: 6, charisma: 4 }, weapon: 'knife', blurb: 'Tough, used to hard work' },
  agriculture: { label: 'Agriculture', career: false, means: { strength: 5, stealth: 7, survival: 8, charisma: 4 }, weapon: 'sickle', blurb: 'Know every edible plant' },
  mining: { label: 'Mining', career: false, means: { strength: 5, stealth: 6, survival: 7, charisma: 4 }, weapon: 'bow', blurb: 'Hunters and scrappers' },
  graphite: { label: 'Graphite', career: false, means: { strength: 6, stealth: 6, survival: 6, charisma: 5 }, weapon: 'spear', blurb: 'Disciplined and secretive' },
  outlying: { label: 'Outlying', career: false, means: { strength: 5, stealth: 5, survival: 5, charisma: 5 }, weapon: null, blurb: 'No particular advantage' },
};

const CANON = ['luxury', 'masonry', 'technology', 'fishing', 'power', 'transportation', 'lumber', 'textiles', 'grain', 'livestock', 'agriculture', 'mining', 'graphite'];

/** Default profile for a district, from the number in its name ("District 4") or its position. */
export function defaultProfileFor(districtName, index) {
  const m = /(\d+)/.exec(String(districtName ?? ''));
  const n = m ? Number(m[1]) : index + 1;
  return CANON[n - 1] || 'outlying';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Roll traits (1-10) around the profile's means. */
export function rollTraits(profileKey, rng) {
  const p = PROFILES[profileKey] || PROFILES.outlying;
  const t = {};
  for (const k of TRAITS) t[k] = clamp(Math.round(p.means[k] + rng.gaussian() * 1.5), 1, 10);
  return t;
}

/** Training score 1-12 from traits, like the Gamemakers' private sessions. */
export function trainingScore(traits, profileKey, rng) {
  const p = PROFILES[profileKey] || PROFILES.outlying;
  const base = (traits.strength * 1.4 + traits.stealth * 0.8 + traits.survival * 1.0 + traits.charisma * 0.5) / 3.7; // 1..10
  const noise = rng ? rng.gaussian() * 0.9 : 0;
  return clamp(Math.round(base * 1.1 + (p.career ? 1.2 : 0) + noise), 1, 12);
}
