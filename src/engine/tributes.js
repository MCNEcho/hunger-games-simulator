// Tribute creation and derived scores. Everything here is plain JSON so a game can be saved.

import { PROFILES, defaultProfileFor, rollTraits, trainingScore } from '../data/districts.js';
import { bestWeapon, hasRanged, ITEMS } from '../data/items.js';
import { Rng } from '../core/rng.js';

/**
 * Build tributes from a parsed cast.
 * Each tribute's traits depend on the reaping seed, who they are and their district's industry,
 * so shuffling the cast re-rolls people for their new district instead of swapping stat lines.
 * @param {import('../io/castFormat.js').Cast} cast
 * @param {string} reapingSeed
 * @param {Record<number,string>} [profileOverrides] district index -> profile key
 */
export function createTributes(cast, reapingSeed, profileOverrides = {}) {
  const seen = {};
  const tributes = [];
  const districts = cast.districts.map((d, i) => ({
    index: i,
    name: d.name,
    color: districtColor(d.color, i),
    profile: profileOverrides[i] || defaultProfileFor(d.name, i),
  }));
  cast.districts.forEach((d, di) => {
    d.tributes.forEach((t) => {
      const profile = districts[di].profile;
      seen[t.name] = (seen[t.name] || 0) + 1;
      const rng = new Rng(`${reapingSeed}:${t.name}:${seen[t.name]}:${profile}`);
      const traits = rollTraits(profile, rng);
      tributes.push(
        baseTribute({
          id: `t${tributes.length}`,
          name: t.name,
          nickname: t.nickname || t.name,
          gender: t.gender,
          image: t.image || '',
          deathStyle: t.deathStyle || 'BW',
          district: di,
          traits,
          training: trainingScore(traits, profile, rng),
        }),
      );
    });
  });
  return { tributes, districts };
}

export function baseTribute(fields) {
  return {
    health: 100,
    hunger: 0,
    thirst: 0,
    ateToday: false,
    drankToday: false,
    inventory: {},
    conds: { injured: false, infected: false },
    kills: 0,
    victims: [],
    popularity: 0,
    alive: true,
    deathPhase: null,
    deathLabel: '',
    cause: '',
    killedBy: [],
    placement: null,
    allianceId: null,
    sponsorGifts: 0,
    everArmed: false,
    lastArmedPhase: null,
    odds: 0,
    oddsHistory: [],
    history: [],
    ...fields,
  };
}

/** BrantSteele colour lines look like "#FFFFFF 0 0"; white is the default, so we pick a distinct hue instead. */
export function districtColor(colorLine, index) {
  const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(String(colorLine || ''));
  const hex = m ? `#${m[1]}` : '';
  if (hex && !/^#(fff|ffffff|000|000000)$/i.test(hex)) return hex;
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 55% 42%)`;
}

export function startingPopularity(t) {
  return clamp(Math.round(t.traits.charisma * 5 + t.training * 2.5 + 5), 5, 95);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function count(t, item) {
  return t.inventory[item] || 0;
}

export function isArmed(t) {
  return bestWeapon(t.inventory).power > 0;
}

export function isHurt(t) {
  return t.conds.injured || t.conds.infected || t.health < 80;
}

/** Fighting strength, roughly 2..25. */
export function combatScore(G, t) {
  const fav = PROFILES[G.state.districts[t.district].profile]?.weapon;
  const w = bestWeapon(t.inventory, fav);
  const shield = count(t, 'shield') ? 1.5 : 0;
  const condition = (t.health / 100) * (t.conds.injured ? 0.75 : 1) * (t.conds.infected ? 0.8 : 1);
  return (t.traits.strength * 1.0 + w.power * 1.7 + t.training * 0.45 + shield + (hasRanged(t.inventory) ? 1 : 0)) * (0.45 + 0.55 * condition);
}

/** How easy a target someone is, roughly 0.2..4. */
export function vulnerability(G, t) {
  const hp = Math.pow((112 - t.health) / 60, 1.2);
  const armed = isArmed(t) ? 0.7 : 1.35;
  const hide = (12 - t.traits.stealth) / 7;
  const strength = Math.sqrt(6 / (t.traits.strength + 1));
  const ally = allianceSize(G, t) > 1 ? 0.8 : 1.1;
  return hp * armed * hide * strength * ally * (t.conds.injured ? 1.4 : 1) * (t.conds.infected ? 1.25 : 1);
}

/** Chance-of-accident weight for deaths with no killer (falls, mutts, disasters). */
export function accidentProneness(t) {
  return Math.pow((12 - t.traits.survival) / 7, 1.3) * Math.pow((112 - t.health) / 60, 0.8) * (t.conds.injured ? 1.3 : 1);
}

export function allianceSize(G, t) {
  if (!t.allianceId) return 1;
  const a = G.state.alliances.find((x) => x.id === t.allianceId);
  return a ? a.members.length : 1;
}

/** What the tribute needs most, for sponsor parachutes and Gamemaker suggestions. */
export function mostNeeded(t) {
  if (t.thirst >= 1 && !count(t, 'water')) return 'water';
  if ((t.conds.injured || t.conds.infected || t.health < 50) && !count(t, 'medkit')) return 'medkit';
  if (t.hunger >= 1 && !count(t, 'food')) return 'food';
  if (!isArmed(t)) return 'weapon';
  if (!count(t, 'campGear')) return 'campGear';
  return 'food';
}

export function supplyCount(t) {
  return Object.entries(t.inventory).reduce((n, [id, c]) => n + (ITEMS[id] && c > 0 ? c : 0), 0);
}
