export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export interface Dish {
  name: string;
  /** The single brush character shown large on the card. */
  ch: string;
  cat: string;
  rarity: Rarity;
  /** Yuan per person. 0 means someone else pays. */
  price: number;
  /** Minutes until it's on the table. */
  min: number;
  /** 0 means "don't count". */
  kcal: number;
  line: string;
  custom?: boolean;
  /** Collector number, 1-based, assigned by allDishes(). */
  no?: number;
}

export interface PoolConfig {
  /** Names of dishes that are switched off. */
  off: string[];
  custom: Dish[];
}

export interface Member {
  id: string;
  name: string;
}

export interface DrawRecord {
  memberId: string;
  cards: Dish[];
  at: number;
}

export interface ChoiceRecord {
  memberId: string;
  dish: string;
  at: number;
}

export interface FinalRecord {
  dish: string;
  /** Member id, or "match" when both picked the same dish. */
  by: string;
  at: number;
}

export interface DayBoard {
  day: string;
  /** Latest draw per member for the day. */
  draws: DrawRecord[];
  choices: ChoiceRecord[];
  final: FinalRecord | null;
}

export interface HistoryItem {
  day: string;
  choices: ChoiceRecord[];
  final: string | null;
}

export interface TableState {
  mode: 'local' | 'room';
  room: { id: string; code: string } | null;
  me: Member;
  members: Member[];
  pool: PoolConfig;
  today: DayBoard;
  history: HistoryItem[];
}
