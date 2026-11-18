import { CATS, DEFAULT_DISHES, RARITIES } from './dishes.ts';
import type { Dish, PoolConfig, Rarity } from './types.ts';

export const PACK_SIZE = 5;
/** Odds for slots 1–4, in N / R / SR / SSR order. */
export const SLOT_WEIGHTS = [62, 26, 9, 3];
/** The last slot is the guaranteed hit: never a plain N. */
export const LAST_SLOT_WEIGHTS = [0, 72, 21, 7];

export const emptyPool = (): PoolConfig => ({ off: [], custom: [] });

export function allDishes(pool: PoolConfig): Dish[] {
  const base = DEFAULT_DISHES.map(d => ({ ...d }));
  const custom = pool.custom.map(d => ({ ...d, custom: true }));
  return [...base, ...custom].map((d, i) => ({ ...d, no: i + 1 }));
}

export function enabledDishes(pool: PoolConfig): Dish[] {
  const off = new Set(pool.off);
  return allDishes(pool).filter(d => !off.has(d.name));
}

function rollTier(weights: number[], rng: () => number): number {
  let t = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t < 0) return i;
  }
  return 0;
}

/**
 * Draws a pack of five distinct dishes, or null when fewer than five are enabled.
 * Like a real booster, the four fillers come out sorted from plain to rare and the
 * hit comes last. When a rolled tier is empty, the nearest tier is used instead
 * (upwards first for the last slot, downwards first for the others).
 */
export function drawPack(pool: PoolConfig, rng: () => number = Math.random): Dish[] | null {
  const candidates = enabledDishes(pool);
  if (candidates.length < PACK_SIZE) return null;
  const picked: Dish[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    const last = slot === PACK_SIZE - 1;
    const want = rollTier(last ? LAST_SLOT_WEIGHTS : SLOT_WEIGHTS, rng);
    const order = last
      ? [want, want + 1, want - 1, want + 2, want - 2, want + 3, want - 3]
      : [want, want - 1, want + 1, want - 2, want + 2, want - 3, want + 3];
    for (const tier of order) {
      if (tier < 0 || tier >= RARITIES.length) continue;
      const left = candidates.filter(d => d.rarity === RARITIES[tier] && !picked.includes(d));
      if (left.length) {
        picked.push(left[Math.floor(rng() * left.length)]);
        break;
      }
    }
  }
  const rank = (d: Dish) => RARITIES.indexOf(d.rarity);
  const fillers = picked.slice(0, PACK_SIZE - 1).sort((a, b) => rank(a) - rank(b));
  return [...fillers, picked[PACK_SIZE - 1]];
}

/** Trims and cuts to `max` characters, counting emoji and CJK as one each. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, max).join('');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const MAX_CUSTOM = 200;

export function sanitizeDish(input: unknown): Dish | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const name = cleanText(o.name, 12);
  if (!name) return null;
  const rarity: Rarity = RARITIES.includes(o.rarity as Rarity) ? (o.rarity as Rarity) : 'N';
  return {
    name,
    ch: cleanText(o.ch, 1) || Array.from(name)[0],
    cat: typeof o.cat === 'string' && o.cat in CATS ? o.cat : '饭',
    rarity,
    price: clampInt(o.price, 0, 99999, 25),
    min: clampInt(o.min, 1, 600, 20),
    kcal: clampInt(o.kcal, 0, 9999, 700),
    line: cleanText(o.line, 40) || '亲手添进菜单的一道菜。'
  };
}

/** Validates a pool coming from a client or from storage. Never throws. */
export function sanitizePool(input: unknown): PoolConfig {
  const pool = emptyPool();
  if (!input || typeof input !== 'object') return pool;
  const o = input as Record<string, unknown>;
  const builtIn = new Set(DEFAULT_DISHES.map(d => d.name));
  if (Array.isArray(o.custom)) {
    for (const raw of o.custom) {
      const dish = sanitizeDish(raw);
      if (!dish || builtIn.has(dish.name) || pool.custom.some(c => c.name === dish.name)) continue;
      pool.custom.push(dish);
      if (pool.custom.length >= MAX_CUSTOM) break;
    }
  }
  if (Array.isArray(o.off)) {
    const known = new Set([...builtIn, ...pool.custom.map(c => c.name)]);
    pool.off = [...new Set(o.off.filter((n): n is string => typeof n === 'string' && known.has(n)))];
  }
  return pool;
}
