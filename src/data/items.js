// Item catalogue. Weapons have power 1-5; supplies keep tributes fed, watered and healed.

export const ITEMS = {
  // Weapons
  sword: { label: 'Sword', kind: 'weapon', power: 4 },
  spear: { label: 'Spear', kind: 'weapon', power: 4, ranged: true },
  crudeSpear: { label: 'Wooden spear', kind: 'weapon', power: 2, ranged: true },
  bow: { label: 'Bow and arrows', kind: 'weapon', power: 5, ranged: true },
  crossbow: { label: 'Crossbow', kind: 'weapon', power: 5, ranged: true },
  knife: { label: 'Knives', kind: 'weapon', power: 3, ranged: true },
  trident: { label: 'Trident', kind: 'weapon', power: 4 },
  mace: { label: 'Mace', kind: 'weapon', power: 4 },
  axe: { label: 'Axe', kind: 'weapon', power: 4 },
  hatchet: { label: 'Hatchet', kind: 'weapon', power: 3 },
  machete: { label: 'Machete', kind: 'weapon', power: 4 },
  sickle: { label: 'Sickle', kind: 'weapon', power: 3 },
  sais: { label: 'Sais', kind: 'weapon', power: 3 },
  slingshot: { label: 'Slingshot', kind: 'weapon', power: 2, ranged: true },
  blowgun: { label: 'Blowgun', kind: 'weapon', power: 3, ranged: true },
  whip: { label: 'Whip', kind: 'weapon', power: 2 },
  knuckles: { label: 'Brass knuckles', kind: 'weapon', power: 2 },
  shovel: { label: 'Shovel', kind: 'weapon', power: 2 },
  staff: { label: 'Staff', kind: 'weapon', power: 2 },
  // Special
  explosives: { label: 'Explosives', kind: 'explosive', power: 5, consumable: true },
  molotov: { label: 'Molotov', kind: 'explosive', power: 4, consumable: true },
  shield: { label: 'Shield', kind: 'armor', defense: 2 },
  // Supplies
  food: { label: 'Food', kind: 'food', consumable: true },
  water: { label: 'Water', kind: 'water', consumable: true },
  medkit: { label: 'Medical kit', kind: 'medical', consumable: true },
  campGear: { label: 'Camping gear', kind: 'shelter' },
  rope: { label: 'Rope', kind: 'tool' },
  fireStarter: { label: 'Fire starter', kind: 'tool' },
  fishingGear: { label: 'Fishing gear', kind: 'tool' },
  goggles: { label: 'Night-vision goggles', kind: 'tool' },
  climbingGear: { label: 'Climbing gear', kind: 'tool' },
  map: { label: 'Arena map', kind: 'tool' },
};

export const WEAPON_IDS = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'weapon');
export const GIFTABLE = ['food', 'water', 'medkit', 'campGear', 'sword', 'spear', 'bow', 'knife', 'axe', 'trident', 'explosives', 'shield', 'goggles', 'map'];

export function itemLabel(id) {
  return ITEMS[id]?.label ?? id;
}

/** Best weapon power a tribute carries, with a +1 bonus for their district's favourite weapon. */
export function bestWeapon(inventory, favourite) {
  let best = null;
  let power = 0;
  for (const [id, n] of Object.entries(inventory || {})) {
    if (!n) continue;
    const it = ITEMS[id];
    if (!it || (it.kind !== 'weapon' && it.kind !== 'explosive')) continue;
    const p = (it.power || 0) + (id === favourite ? 1 : 0);
    if (p > power) {
      power = p;
      best = id;
    }
  }
  return { id: best, power };
}

export function hasRanged(inventory) {
  return Object.entries(inventory || {}).some(([id, n]) => n > 0 && ITEMS[id]?.ranged);
}
