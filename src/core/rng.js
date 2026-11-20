// Seeded, serializable random number generator (sfc32 seeded by xmur3).
// Every random choice in the engine goes through one Rng so that a game
// can be replayed exactly from its seed.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  /** @param {string|number} seed  @param {number[]} [state] restore a saved state */
  constructor(seed, state) {
    this.seed = String(seed);
    if (state && state.length === 4) {
      this.s = state.map((x) => x >>> 0);
    } else {
      const h = xmur3(this.seed);
      this.s = [h(), h(), h(), h()];
      for (let i = 0; i < 12; i++) this.next(); // warm up
    }
  }

  /** @returns {number} float in [0, 1) */
  next() {
    let [a, b, c, d] = this.s;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return (t >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    if (!arr.length) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Standard normal via Box–Muller. */
  gaussian() {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Returns a shuffled copy. */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Weighted choice. Items with weight <= 0 (or non-finite) are never chosen.
   * @template T
   * @param {T[]} items
   * @param {(item: T) => number} weightFn
   * @returns {T|undefined} undefined when no item has positive weight
   */
  weighted(items, weightFn) {
    let total = 0;
    const ws = items.map((it) => {
      const w = weightFn(it);
      const ok = Number.isFinite(w) && w > 0 ? w : 0;
      total += ok;
      return ok;
    });
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      if (ws[i] <= 0) continue;
      r -= ws[i];
      if (r < 0) return items[i];
    }
    // Floating point edge: return last positive.
    for (let i = items.length - 1; i >= 0; i--) if (ws[i] > 0) return items[i];
    return undefined;
  }

  getState() {
    return this.s.slice();
  }
}

/** Random human-friendly game code, e.g. "EMBER-4821". Uses Math.random on purpose (new seed). */
export function newGameCode() {
  const words = ['EMBER', 'ARROW', 'SPARK', 'BREAD', 'BERRY', 'GOLD', 'SMOKE', 'RIVER', 'FLAME', 'STONE', 'WIND', 'ASH', 'PINE', 'TIDE', 'COAL', 'HAWK'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${1000 + Math.floor(Math.random() * 9000)}`;
}
