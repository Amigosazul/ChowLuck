import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { emptyPool, sanitizePool } from '../src/shared/draw.ts';
import type {
  ChoiceRecord, DayBoard, Dish, DrawRecord, FinalRecord, HistoryItem, Member, PoolConfig, TableState
} from '../src/shared/types.ts';

export const MAX_MEMBERS = 2;
export const MAX_DRAWS_PER_DAY = 60;
const HISTORY_DAYS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  pool       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_room ON members(room_id);
CREATE TABLE IF NOT EXISTS draws (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  day       TEXT NOT NULL,
  cards     TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS draws_room_day ON draws(room_id, day);
CREATE TABLE IF NOT EXISTS choices (
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  day       TEXT NOT NULL,
  dish      TEXT NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (room_id, member_id, day)
);
CREATE TABLE IF NOT EXISTS finals (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  dish    TEXT NOT NULL,
  by      TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (room_id, day)
);
`;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Auth {
  memberId: string;
  name: string;
  roomId: string;
  code: string;
}

type Row = Record<string, unknown>;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function newCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export class Repo {
  db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  createRoom(name: string, pool: PoolConfig = emptyPool()): { token: string; roomId: string } {
    return this.tx(() => {
      let code = newCode();
      while (this.db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)) code = newCode();
      const roomId = randomUUID();
      this.db.prepare('INSERT INTO rooms (id, code, pool, created_at) VALUES (?, ?, ?, ?)')
        .run(roomId, code, JSON.stringify(sanitizePool(pool)), Date.now());
      return { token: this.addMember(roomId, name), roomId };
    });
  }

  joinRoom(code: string, name: string): { token: string; roomId: string } {
    return this.tx(() => {
      const room = this.db.prepare('SELECT id FROM rooms WHERE code = ?').get(code.trim().toUpperCase()) as Row | undefined;
      if (!room) throw new HttpError(404, '没有找到这个邀请码，检查一下有没有输错');
      const roomId = String(room.id);
      const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM members WHERE room_id = ?').get(roomId) as { n: number };
      if (n >= MAX_MEMBERS) throw new HttpError(409, '这张饭桌已经坐满两个人了');
      return { token: this.addMember(roomId, name), roomId };
    });
  }

  private addMember(roomId: string, name: string): string {
    const token = randomBytes(24).toString('base64url');
    this.db.prepare('INSERT INTO members (id, room_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), roomId, name, hashToken(token), Date.now());
    return token;
  }

  auth(token: string): Auth | null {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT m.id, m.name, m.room_id, r.code FROM members m JOIN rooms r ON r.id = m.room_id
      WHERE m.token_hash = ?`).get(hashToken(token)) as Row | undefined;
    if (!row) return null;
    return { memberId: String(row.id), name: String(row.name), roomId: String(row.room_id), code: String(row.code) };
  }

  members(roomId: string): Member[] {
    return (this.db.prepare('SELECT id, name FROM members WHERE room_id = ? ORDER BY created_at').all(roomId) as Row[])
      .map(r => ({ id: String(r.id), name: String(r.name) }));
  }

  removeMember(roomId: string, memberId: string): boolean {
    return this.tx(() => {
      const res = this.db.prepare('DELETE FROM members WHERE room_id = ? AND id = ?').run(roomId, memberId);
      const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM members WHERE room_id = ?').get(roomId) as { n: number };
      if (n === 0) this.db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
      return Number(res.changes) > 0;
    });
  }

  pool(roomId: string): PoolConfig {
    const row = this.db.prepare('SELECT pool FROM rooms WHERE id = ?').get(roomId) as Row | undefined;
    if (!row) return emptyPool();
    try {
      return sanitizePool(JSON.parse(String(row.pool)));
    } catch {
      return emptyPool();
    }
  }

  setPool(roomId: string, pool: PoolConfig) {
    this.db.prepare('UPDATE rooms SET pool = ? WHERE id = ?').run(JSON.stringify(sanitizePool(pool)), roomId);
  }

  drawCount(auth: Auth, day: string): number {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM draws WHERE room_id = ? AND member_id = ? AND day = ?')
      .get(auth.roomId, auth.memberId, day) as { n: number };
    return n;
  }

  addDraw(auth: Auth, day: string, cards: Dish[]) {
    this.db.prepare('INSERT INTO draws (room_id, member_id, day, cards, at) VALUES (?, ?, ?, ?, ?)')
      .run(auth.roomId, auth.memberId, day, JSON.stringify(cards), Date.now());
  }

  /** Records the member's pick. When both members picked the same dish, that becomes the day's final. */
  setChoice(auth: Auth, day: string, dish: string) {
    this.tx(() => {
      this.db.prepare(`
        INSERT INTO choices (room_id, member_id, day, dish, at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (room_id, member_id, day) DO UPDATE SET dish = excluded.dish, at = excluded.at`)
        .run(auth.roomId, auth.memberId, day, dish, Date.now());
      const picks = this.db.prepare('SELECT dish FROM choices WHERE room_id = ? AND day = ?').all(auth.roomId, day) as Row[];
      const members = this.members(auth.roomId).length;
      const hasFinal = this.db.prepare('SELECT 1 FROM finals WHERE room_id = ? AND day = ?').get(auth.roomId, day);
      if (!hasFinal && members === MAX_MEMBERS && picks.length === MAX_MEMBERS && picks.every(p => p.dish === dish)) {
        this.db.prepare('INSERT INTO finals (room_id, day, dish, by, at) VALUES (?, ?, ?, ?, ?)')
          .run(auth.roomId, day, dish, 'match', Date.now());
      }
    });
  }

  setFinal(auth: Auth, day: string, dish: string, by: string = auth.memberId) {
    this.db.prepare(`
      INSERT INTO finals (room_id, day, dish, by, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (room_id, day) DO UPDATE SET dish = excluded.dish, by = excluded.by, at = excluded.at`)
      .run(auth.roomId, day, dish, by, Date.now());
  }

  /** Picks one of the two differing choices at random and settles the day with it. */
  toss(auth: Auth, day: string): string {
    return this.tx(() => {
      if (this.db.prepare('SELECT 1 FROM finals WHERE room_id = ? AND day = ?').get(auth.roomId, day)) {
        throw new HttpError(409, '今天已经定案了');
      }
      const picks = this.choiceRows(auth.roomId, day);
      if (this.members(auth.roomId).length < MAX_MEMBERS || picks.length < MAX_MEMBERS) {
        throw new HttpError(409, '两个人都定签后才能掷签');
      }
      const dish = picks[randomInt(picks.length)].dish;
      this.setFinal(auth, day, dish, 'toss');
      return dish;
    });
  }

  clearFinal(auth: Auth, day: string) {
    this.db.prepare('DELETE FROM finals WHERE room_id = ? AND day = ?').run(auth.roomId, day);
  }

  state(auth: Auth, day: string): TableState {
    const members = this.members(auth.roomId);
    const today = this.board(auth.roomId, day);
    // blind picks: hide the partner's dish until I've picked too, or the day is settled
    const pickedMyself = today.choices.some(c => c.memberId === auth.memberId);
    if (!pickedMyself && !today.final) {
      today.choices = today.choices.map(c =>
        c.memberId === auth.memberId ? c : { memberId: c.memberId, dish: '', at: c.at, sealed: true });
    }
    return {
      mode: 'room',
      room: { id: auth.roomId, code: auth.code },
      me: { id: auth.memberId, name: auth.name },
      members,
      pool: this.pool(auth.roomId),
      today,
      history: this.history(auth.roomId, day)
    };
  }

  choiceRows(roomId: string, day: string): ChoiceRecord[] {
    return (this.db.prepare('SELECT member_id, dish, at FROM choices WHERE room_id = ? AND day = ? ORDER BY at')
      .all(roomId, day) as Row[]).map(r => ({ memberId: String(r.member_id), dish: String(r.dish), at: Number(r.at) }));
  }

  private board(roomId: string, day: string): DayBoard {
    const draws: DrawRecord[] = [];
    const rows = this.db.prepare('SELECT member_id, cards, at FROM draws WHERE room_id = ? AND day = ? ORDER BY id DESC')
      .all(roomId, day) as Row[];
    for (const r of rows) {
      if (draws.some(d => d.memberId === r.member_id)) continue;
      draws.push({ memberId: String(r.member_id), cards: JSON.parse(String(r.cards)) as Dish[], at: Number(r.at) });
    }
    const choices = this.choiceRows(roomId, day);
    const f = this.db.prepare('SELECT dish, by, at FROM finals WHERE room_id = ? AND day = ?').get(roomId, day) as Row | undefined;
    const final: FinalRecord | null = f ? { dish: String(f.dish), by: String(f.by), at: Number(f.at) } : null;
    return { day, draws, choices, final };
  }

  private history(roomId: string, today: string): HistoryItem[] {
    const days = (this.db.prepare(`
      SELECT day FROM choices WHERE room_id = ? AND day < ?
      UNION SELECT day FROM finals WHERE room_id = ? AND day < ?
      ORDER BY day DESC LIMIT ?`).all(roomId, today, roomId, today, HISTORY_DAYS) as Row[]).map(r => String(r.day));
    if (!days.length) return [];
    const marks = days.map(() => '?').join(',');
    const choices = this.db.prepare(`SELECT day, member_id, dish, at FROM choices WHERE room_id = ? AND day IN (${marks})`)
      .all(roomId, ...days) as Row[];
    const finals = this.db.prepare(`SELECT day, dish FROM finals WHERE room_id = ? AND day IN (${marks})`)
      .all(roomId, ...days) as Row[];
    return days.map(day => ({
      day,
      choices: choices.filter(c => c.day === day)
        .map(c => ({ memberId: String(c.member_id), dish: String(c.dish), at: Number(c.at) })),
      final: (finals.find(f => f.day === day)?.dish as string | undefined) ?? null
    }));
  }
}
