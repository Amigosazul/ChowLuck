import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { allDishes, cleanText, drawPack, sanitizePool } from '../src/shared/draw.ts';
import { dayKey } from '../src/shared/day.ts';
import { HttpError, MAX_DRAWS_PER_DAY, Repo } from './repo.ts';
import type { Auth } from './repo.ts';

type Env = { Variables: { auth: Auth } };

export interface AppOptions {
  repo: Repo;
  /** IANA zone that decides when "today" rolls over. */
  timeZone: string;
  /** Override for tests. */
  now?: () => Date;
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function nickname(value: unknown): string {
  const name = cleanText(value, 12);
  if (!name) throw new HttpError(400, '先起个称呼吧');
  return name;
}

export function createApp({ repo, timeZone, now = () => new Date() }: AppOptions) {
  const app = new Hono<Env>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (roomId: string) => listeners.get(roomId)?.forEach(fn => fn());
  const today = () => dayKey(now(), timeZone);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: '服务器出了点问题，稍后再试' }, 500);
  });

  app.get('/api/health', c => c.json({ ok: true }));

  app.post('/api/rooms', async c => {
    const body = await readJson(c);
    const { token } = repo.createRoom(nickname(body.name), sanitizePool(body.pool));
    return c.json({ token });
  });

  app.post('/api/rooms/join', async c => {
    const body = await readJson(c);
    const code = cleanText(body.code, 12);
    if (!code) throw new HttpError(400, '请输入邀请码');
    const { token, roomId } = repo.joinRoom(code, nickname(body.name));
    notify(roomId);
    return c.json({ token });
  });

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (c.req.query('token') ?? '');
    const auth = repo.auth(token);
    if (!auth) throw new HttpError(401, '饭桌凭证无效或已离开饭桌');
    c.set('auth', auth);
    await next();
  });

  app.get('/api/state', c => c.json(repo.state(c.get('auth'), today())));

  app.put('/api/pool', async c => {
    const auth = c.get('auth');
    const body = await readJson(c);
    repo.setPool(auth.roomId, sanitizePool(body.pool));
    notify(auth.roomId);
    return c.json(repo.state(auth, today()));
  });

  app.post('/api/draws', c => {
    const auth = c.get('auth');
    const day = today();
    if (repo.drawCount(auth, day) >= MAX_DRAWS_PER_DAY) throw new HttpError(429, '今天开的包太多了，明天再来');
    const cards = drawPack(repo.pool(auth.roomId));
    if (!cards) throw new HttpError(400, '菜单里至少要启用五道菜才能开包');
    repo.addDraw(auth, day, cards);
    notify(auth.roomId);
    return c.json({ cards, state: repo.state(auth, day) });
  });

  const dishName = (auth: Auth, value: unknown) => {
    const name = cleanText(value, 12);
    if (!name || !allDishes(repo.pool(auth.roomId)).some(d => d.name === name)) {
      throw new HttpError(400, '菜单里没有这道菜');
    }
    return name;
  };

  app.put('/api/choice', async c => {
    const auth = c.get('auth');
    const body = await readJson(c);
    repo.setChoice(auth, today(), dishName(auth, body.dish));
    notify(auth.roomId);
    return c.json(repo.state(auth, today()));
  });

  app.put('/api/final', async c => {
    const auth = c.get('auth');
    const body = await readJson(c);
    repo.setFinal(auth, today(), dishName(auth, body.dish));
    notify(auth.roomId);
    return c.json(repo.state(auth, today()));
  });

  app.delete('/api/final', c => {
    const auth = c.get('auth');
    repo.clearFinal(auth, today());
    notify(auth.roomId);
    return c.json(repo.state(auth, today()));
  });

  app.delete('/api/members/:id', c => {
    const auth = c.get('auth');
    if (!repo.removeMember(auth.roomId, c.req.param('id'))) throw new HttpError(404, '这个人不在饭桌上');
    notify(auth.roomId);
    return c.json({ ok: true });
  });

  app.get('/api/events', c => {
    const auth = c.get('auth');
    return streamSSE(c, async stream => {
      const send = () => { void stream.writeSSE({ event: 'update', data: String(Date.now()) }); };
      const set = listeners.get(auth.roomId) ?? new Set<() => void>();
      listeners.set(auth.roomId, set);
      set.add(send);
      stream.onAbort(() => {
        set.delete(send);
        if (!set.size) listeners.delete(auth.roomId);
      });
      await stream.writeSSE({ event: 'ready', data: '1' });
      while (!stream.aborted) {
        await stream.sleep(25_000);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  return app;
}
