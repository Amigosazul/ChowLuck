import type { PoolConfig, TableState } from '../../shared/types.ts';
import { api } from './api.ts';
import type { DrawResult } from './api.ts';
import type { Store } from './store.ts';

/** A table shared with one other person through the server, kept live over SSE. */
export class RemoteStore implements Store {
  private token: string;
  private events: EventSource | null = null;
  private listeners = new Set<(s: TableState) => void>();
  private refreshTimer = 0;
  private opened = false;

  constructor(token: string) {
    this.token = token;
  }

  private call<T>(method: string, path: string, body?: unknown) {
    return api<T>(method, path, body, this.token);
  }

  load() { return this.call<TableState>('GET', '/api/state'); }
  savePool(pool: PoolConfig) { return this.call<TableState>('PUT', '/api/pool', { pool }); }
  draw() { return this.call<DrawResult>('POST', '/api/draws'); }
  choose(dish: string) { return this.call<TableState>('PUT', '/api/choice', { dish }); }
  settle(dish: string) { return this.call<TableState>('PUT', '/api/final', { dish }); }
  toss() { return this.call<TableState>('POST', '/api/toss'); }
  reopen() { return this.call<TableState>('DELETE', '/api/final'); }
  async removeMember(memberId: string) { await this.call('DELETE', `/api/members/${encodeURIComponent(memberId)}`); }

  subscribe(listener: (s: TableState) => void) {
    this.listeners.add(listener);
    if (!this.events) this.connect();
  }

  private connect() {
    // EventSource can't send headers, so the token rides in the query string.
    this.events = new EventSource(`/api/events?token=${encodeURIComponent(this.token)}`);
    this.events.addEventListener('update', () => this.refreshSoon());
    // after a dropped connection comes back, catch up on anything we missed
    this.events.addEventListener('ready', () => {
      if (this.opened) this.refreshSoon();
      this.opened = true;
    });
  }

  private refreshSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(async () => {
      try {
        const s = await this.load();
        this.listeners.forEach(fn => fn(s));
      } catch { /* the next event or user action will retry */ }
    }, 120);
  }

  close() {
    clearTimeout(this.refreshTimer);
    this.events?.close();
    this.events = null;
    this.listeners.clear();
  }
}
