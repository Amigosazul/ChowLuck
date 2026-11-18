import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { Repo } from '../server/repo.ts';
import type { TableState } from '../src/shared/types.ts';

let repo: Repo;
let app: ReturnType<typeof createApp>;
let clock = new Date('2026-11-18T04:00:00Z');

beforeEach(() => {
  repo = new Repo(':memory:');
  clock = new Date('2026-11-18T04:00:00Z');
  app = createApp({ repo, timeZone: 'Asia/Shanghai', now: () => clock });
});
afterEach(() => repo.close());

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() as Record<string, any> };
}

async function pair() {
  const a = (await call('POST', '/api/rooms', { name: '阿杰' })).json.token as string;
  const st = (await call('GET', '/api/state', undefined, a)).json as TableState;
  const b = (await call('POST', '/api/rooms/join', { code: st.room!.code.toLowerCase(), name: '小雨' })).json.token as string;
  return { a, b, code: st.room!.code };
}

describe('rooms', () => {
  it('creates a room and lets exactly one partner join', async () => {
    const { a, code } = await pair();
    const st = (await call('GET', '/api/state', undefined, a)).json as TableState;
    expect(st.members.map(m => m.name)).toEqual(['阿杰', '小雨']);
    expect(st.me.name).toBe('阿杰');
    const third = await call('POST', '/api/rooms/join', { code, name: '路人' });
    expect(third.status).toBe(409);
  });

  it('rejects bad codes, empty names and missing tokens', async () => {
    expect((await call('POST', '/api/rooms/join', { code: 'ZZZZZZ', name: 'x' })).status).toBe(404);
    expect((await call('POST', '/api/rooms', { name: '   ' })).status).toBe(400);
    expect((await call('GET', '/api/state')).status).toBe(401);
    expect((await call('GET', '/api/state', undefined, 'forged')).status).toBe(401);
  });

  it('frees the seat when a member leaves', async () => {
    const { a, b, code } = await pair();
    const st = (await call('GET', '/api/state', undefined, a)).json as TableState;
    const partner = st.members.find(m => m.id !== st.me.id)!;
    expect((await call('DELETE', `/api/members/${partner.id}`, undefined, a)).status).toBe(200);
    expect((await call('GET', '/api/state', undefined, b)).status).toBe(401);
    expect((await call('POST', '/api/rooms/join', { code, name: '新人' })).status).toBe(200);
  });
});

describe('a shared day', () => {
  it('shares the pool and each other’s draws', async () => {
    const { a, b } = await pair();
    await call('PUT', '/api/pool', { pool: { off: [], custom: [{ name: '猪脚饭', rarity: 'R' }] } }, a);
    const draw = await call('POST', '/api/draws', undefined, b);
    expect(draw.status).toBe(200);
    expect(draw.json.cards).toHaveLength(5);
    const st = (await call('GET', '/api/state', undefined, a)).json as TableState;
    expect(st.pool.custom.map(d => d.name)).toEqual(['猪脚饭']);
    expect(st.today.draws).toHaveLength(1);
    expect(st.today.day).toBe('2026-11-18');
  });

  it('settles the day automatically when both pick the same dish', async () => {
    const { a, b } = await pair();
    await call('PUT', '/api/choice', { dish: '酸菜鱼' }, a);
    let st = (await call('PUT', '/api/choice', { dish: '螺蛳粉' }, b)).json as TableState;
    expect(st.today.final).toBeNull();
    st = (await call('PUT', '/api/choice', { dish: '酸菜鱼' }, b)).json as TableState;
    expect(st.today.final).toMatchObject({ dish: '酸菜鱼', by: 'match' });
  });

  it('lets either side settle or reopen the day', async () => {
    const { a, b } = await pair();
    let st = (await call('PUT', '/api/final', { dish: '北京烤鸭' }, a)).json as TableState;
    expect(st.today.final?.dish).toBe('北京烤鸭');
    st = (await call('DELETE', '/api/final', undefined, b)).json as TableState;
    expect(st.today.final).toBeNull();
    expect((await call('PUT', '/api/final', { dish: '不存在的菜' }, a)).status).toBe(400);
  });

  it('moves yesterday into history', async () => {
    const { a } = await pair();
    await call('PUT', '/api/choice', { dish: '卤肉饭' }, a);
    clock = new Date('2026-11-19T04:00:00Z');
    const st = (await call('GET', '/api/state', undefined, a)).json as TableState;
    expect(st.today.choices).toHaveLength(0);
    expect(st.history).toEqual([expect.objectContaining({ day: '2026-11-18', final: null })]);
    expect(st.history[0].choices[0].dish).toBe('卤肉饭');
  });
});
