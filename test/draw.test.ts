import { describe, expect, it } from 'vitest';
import { DEFAULT_DISHES, RARITIES } from '../src/shared/dishes.ts';
import { allDishes, drawPack, emptyPool, sanitizePool } from '../src/shared/draw.ts';
import { dayKey, dayLabel, dayOfYear } from '../src/shared/day.ts';

/** Small deterministic PRNG so failures are reproducible. */
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rank = (r: string) => RARITIES.indexOf(r as never);

describe('drawPack', () => {
  it('returns five distinct dishes with the hit last', () => {
    for (let s = 1; s <= 500; s++) {
      const pack = drawPack(emptyPool(), seeded(s))!;
      expect(pack).toHaveLength(5);
      expect(new Set(pack.map(d => d.name)).size).toBe(5);
      expect(rank(pack[4].rarity)).toBeGreaterThanOrEqual(1);
      for (let i = 1; i < 4; i++) expect(rank(pack[i].rarity)).toBeGreaterThanOrEqual(rank(pack[i - 1].rarity));
    }
  });

  it('never draws switched-off dishes', () => {
    const off = DEFAULT_DISHES.slice(0, 30).map(d => d.name);
    for (let s = 1; s <= 200; s++) {
      const pack = drawPack({ off, custom: [] }, seeded(s))!;
      expect(pack.every(d => !off.includes(d.name))).toBe(true);
    }
  });

  it('falls back to other tiers when a tier is empty', () => {
    const off = DEFAULT_DISHES.filter(d => d.rarity !== 'N').map(d => d.name);
    const pack = drawPack({ off, custom: [] }, seeded(7))!;
    expect(pack).toHaveLength(5);
    expect(pack.every(d => d.rarity === 'N')).toBe(true);
  });

  it('returns null when fewer than five dishes are enabled', () => {
    const off = DEFAULT_DISHES.slice(4).map(d => d.name);
    expect(drawPack({ off, custom: [] })).toBeNull();
  });

  it('keeps roughly the advertised odds for the filler slots', () => {
    const rng = seeded(42);
    const counts = { N: 0, R: 0, SR: 0, SSR: 0 };
    for (let i = 0; i < 4000; i++) for (const d of drawPack(emptyPool(), rng)!.slice(0, 4)) counts[d.rarity]++;
    const total = 16000;
    expect(counts.N / total).toBeGreaterThan(0.55);
    expect(counts.SSR / total).toBeLessThan(0.06);
  });
});

describe('sanitizePool', () => {
  it('cleans custom dishes and drops junk', () => {
    const pool = sanitizePool({
      off: ['兰州牛肉面', 'not-a-dish', 3],
      custom: [
        { name: '  隆江猪脚饭  ', rarity: 'SR', price: '32', cat: '饭' },
        { name: '' },
        { name: '黄焖鸡米饭' },
        { name: '隆江猪脚饭' },
        { name: '超长名字超长名字超长名字超长名字', rarity: 'XXL', price: -5, cat: 'nope' }
      ]
    });
    expect(pool.off).toEqual(['兰州牛肉面']);
    expect(pool.custom).toHaveLength(2);
    expect(pool.custom[0]).toMatchObject({ name: '隆江猪脚饭', ch: '隆', rarity: 'SR', price: 32 });
    expect(pool.custom[1]).toMatchObject({ rarity: 'N', price: 0, cat: '饭' });
    expect(Array.from(pool.custom[1].name)).toHaveLength(12);
  });

  it('numbers custom dishes after the defaults', () => {
    const all = allDishes(sanitizePool({ custom: [{ name: '猪脚饭' }] }));
    expect(all.at(-1)).toMatchObject({ name: '猪脚饭', no: DEFAULT_DISHES.length + 1, custom: true });
  });

  it('returns an empty pool for garbage', () => {
    expect(sanitizePool('nope')).toEqual(emptyPool());
  });
});

describe('day helpers', () => {
  it('rolls over at midnight in the given zone', () => {
    const t = new Date('2026-11-17T16:30:00Z');
    expect(dayKey(t, 'Asia/Shanghai')).toBe('2026-11-18');
    expect(dayKey(t, 'UTC')).toBe('2026-11-17');
  });
  it('formats labels', () => {
    expect(dayLabel('2026-11-18')).toBe('11月18日 周三');
    expect(dayOfYear('2026-01-01')).toBe(1);
  });
});
