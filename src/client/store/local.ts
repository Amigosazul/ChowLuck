import { drawPack, emptyPool, sanitizePool } from '../../shared/draw.ts';
import { dayKey } from '../../shared/day.ts';
import type { ChoiceRecord, DrawRecord, HistoryItem, PoolConfig, TableState } from '../../shared/types.ts';
import { storage } from '../ui/dom.ts';
import type { DrawResult } from './api.ts';
import type { Store } from './store.ts';

const KEY = 'chowluck.local.v1';
const ME = { id: 'me', name: '我' };
const KEEP_DAYS = 60;

interface LocalDay { draw?: DrawRecord; choice?: ChoiceRecord }
interface LocalData { pool: PoolConfig; days: Record<string, LocalDay> }

/** Single-player table that lives in this browser only. */
export class LocalStore implements Store {
  private data: LocalData;

  constructor() {
    const saved = storage.get<LocalData | null>(KEY, null);
    // carry over the menu edits from the single-file prototype
    const legacyPool = storage.get<unknown>('chowluck.pool.v2', null);
    this.data = {
      pool: sanitizePool(saved?.pool ?? legacyPool ?? emptyPool()),
      days: saved?.days && typeof saved.days === 'object' ? saved.days : {}
    };
  }

  private today() { return dayKey(); }

  private save() {
    const days = Object.keys(this.data.days).sort().reverse();
    for (const d of days.slice(KEEP_DAYS)) delete this.data.days[d];
    storage.set(KEY, this.data);
  }

  private day(): LocalDay {
    return (this.data.days[this.today()] ??= {});
  }

  private state(): TableState {
    const day = this.today();
    const t = this.data.days[day] ?? {};
    const history: HistoryItem[] = Object.keys(this.data.days)
      .filter(d => d < day && this.data.days[d].choice)
      .sort().reverse()
      .map(d => ({ day: d, choices: [this.data.days[d].choice!], final: this.data.days[d].choice!.dish }));
    return {
      mode: 'local',
      room: null,
      me: ME,
      members: [ME],
      pool: this.data.pool,
      today: {
        day,
        draws: t.draw ? [t.draw] : [],
        choices: t.choice ? [t.choice] : [],
        final: t.choice ? { dish: t.choice.dish, by: ME.id, at: t.choice.at } : null
      },
      history
    };
  }

  /** The pool to hand over when this player creates a shared table. */
  get pool() { return this.data.pool; }

  async load() { return this.state(); }

  async savePool(pool: PoolConfig) {
    this.data.pool = sanitizePool(pool);
    this.save();
    return this.state();
  }

  async draw(): Promise<DrawResult> {
    const cards = drawPack(this.data.pool);
    if (!cards) throw new Error('菜单里至少要启用五道菜才能开包');
    this.day().draw = { memberId: ME.id, cards, at: Date.now() };
    this.save();
    return { cards, state: this.state() };
  }

  async choose(dish: string) {
    this.day().choice = { memberId: ME.id, dish, at: Date.now() };
    this.save();
    return this.state();
  }

  async settle(dish: string) { return this.choose(dish); }

  async toss() { return this.state(); }

  async reopen() {
    delete this.day().choice;
    this.save();
    return this.state();
  }

  async removeMember() { /* nobody else at a local table */ }
  subscribe() { /* nothing changes behind our back */ }
  close() {}
}
