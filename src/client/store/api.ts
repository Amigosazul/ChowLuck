import type { Dish, PoolConfig, TableState } from '../../shared/types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, '连不上服务器，检查一下网络');
  }
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `请求失败（${res.status}）`);
  return data as T;
}

export const createRoom = (name: string, pool: PoolConfig) =>
  api<{ token: string }>('POST', '/api/rooms', { name, pool });

export const joinRoom = (code: string, name: string) =>
  api<{ token: string }>('POST', '/api/rooms/join', { code, name });

export type DrawResult = { cards: Dish[]; state: TableState };
