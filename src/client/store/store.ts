import type { PoolConfig, TableState } from '../../shared/types.ts';
import type { DrawResult } from './api.ts';

/** Everything the UI needs, whether the table is local-only or shared through the server. */
export interface Store {
  load(): Promise<TableState>;
  savePool(pool: PoolConfig): Promise<TableState>;
  draw(): Promise<DrawResult>;
  choose(dish: string): Promise<TableState>;
  settle(dish: string): Promise<TableState>;
  reopen(): Promise<TableState>;
  removeMember(memberId: string): Promise<void>;
  /** Called with fresh state whenever someone else changes the table. */
  subscribe(listener: (state: TableState) => void): void;
  close(): void;
}
