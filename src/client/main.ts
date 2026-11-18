import './styles/index.css';
import { allDishes } from '../shared/draw.ts';
import { dayLabel, dayOfYear } from '../shared/day.ts';
import type { Dish, TableState } from '../shared/types.ts';
import { ApiError, createRoom, joinRoom } from './store/api.ts';
import { LocalStore } from './store/local.ts';
import { RemoteStore } from './store/remote.ts';
import type { Store } from './store/store.ts';
import { sound } from './ui/audio.ts';
import { $, installGrain, reduceMotion, storage, toast, wait } from './ui/dom.ts';
import { Pack } from './ui/pack.ts';
import { Results } from './ui/results.ts';
import { HistorySheet, PoolSheet, RoomSheet } from './ui/sheets.ts';
import { Stack } from './ui/stack.ts';
import { partnerOf, renderTable, verdict } from './ui/table.ts';
import type { TableHandlers } from './ui/table.ts';

const SESSION_KEY = 'chowluck.session';
const CN_NUM = ['壹', '贰', '叁', '肆', '伍'];

type Phase = 'pack' | 'opening' | 'stack' | 'results';

let store: Store;
let state: TableState | undefined;
let phase: Phase = 'pack';
let hand: Dish[] = [];

const stage = $('#stage');
const packWrap = $('#packWrap');
const stackEl = $('#stack');
const hud = $('#hud');
const resultsEl = $('#results');
const tableEl = $('#table');

const cur = () => state!;
const total = () => allDishes(cur().pool).length;
const myChoice = () => cur().today.choices.find(c => c.memberId === cur().me.id)?.dish ?? null;
const myDraw = () => cur().today.draws.find(d => d.memberId === cur().me.id);

/* ---------------- actions ---------------- */

async function run<T>(task: Promise<T>): Promise<T | undefined> {
  try {
    return await task;
  } catch (err) {
    toast((err as Error).message);
    return undefined;
  }
}

async function choose(name: string) {
  const before = myChoice();
  if (phase === 'results') results.markChosen(name, true);
  else sound.stamp();
  const next = await run(store.choose(name));
  if (next) apply(next, true);
  else if (phase === 'results') results.markChosen(before, false);
}

async function settle(name: string) {
  const next = await run(store.settle(name));
  if (!next) return;
  apply(next, true);
  sound.bell(784);
  toast(`签落：今天吃 ${name}`);
}

async function reopen() {
  const next = await run(store.reopen());
  if (next) apply(next, true);
}

const tableHandlers: TableHandlers = {
  pick: name => void choose(name),
  settle: name => void settle(name),
  reopen: () => void reopen(),
  invite: () => roomSheet.show(cur())
};

/* ---------------- ui pieces ---------------- */

const pack = new Pack(packWrap, {
  onTorn: () => void openPack(),
  onTap: () => setHint('按住虚线，<b>从左往右拖</b>')
});
const stack = new Stack(stackEl, $('#halo'), { onChange: setHud, onDone: showResults });
const results = new Results({ onPick: d => void choose(d.name) });
const poolSheet = new PoolSheet(async pool => { apply(await store.savePool(pool), true); });
const historySheet = new HistorySheet();
const roomSheet = new RoomSheet({
  ...tableHandlers,
  async create(name) {
    const pool = store instanceof LocalStore ? store.pool : cur().pool;
    const carried = myChoice();
    const { token } = await createRoom(name.trim(), pool);
    storage.set(SESSION_KEY, token);
    await useStore(new RemoteStore(token));
    // bring today's pick along so the partner sees it
    if (carried) {
      const next = await run(store.choose(carried));
      if (next) apply(next, true);
    }
    roomSheet.render(cur());
    toast('饭桌开好了，把邀请码发给 TA');
  },
  async join(code, name) {
    const { token } = await joinRoom(code.trim(), name.trim());
    storage.set(SESSION_KEY, token);
    roomSheet.joinCode = '';
    await useStore(new RemoteStore(token));
    roomSheet.close();
    const p = partnerOf(cur());
    toast(p ? `已入座，和 ${p.name} 同桌` : '已入座');
  },
  async remove(memberId) {
    await store.removeMember(memberId);
    if (memberId === cur().me.id) {
      storage.remove(SESSION_KEY);
      await useStore(new LocalStore());
      toast('已离开饭桌，回到单人模式');
    } else {
      apply(await store.load(), true);
      toast('座位已空出');
    }
    roomSheet.render(cur());
  }
});

/* ---------------- state ---------------- */

/** Toasts what the other person just did. */
function announce(prev: TableState, next: TableState) {
  if (prev.mode !== 'room' || next.room?.id !== prev.room?.id) return;
  const partner = partnerOf(next);
  if (!partner) {
    if (partnerOf(prev)) toast(`${partnerOf(prev)!.name} 离开了饭桌`);
    return;
  }
  if (!partnerOf(prev)) { toast(`${partner.name} 入座了`); return; }
  const was = (s: TableState) => ({
    draw: s.today.draws.find(d => d.memberId === partner.id)?.at,
    pick: s.today.choices.find(c => c.memberId === partner.id)?.dish
  });
  const a = was(prev);
  const b = was(next);
  if (next.today.final && next.today.final.dish !== prev.today.final?.dish && next.today.final.by !== next.me.id) {
    toast(next.today.final.by === 'match' ? `心有灵犀，你们都选了 ${next.today.final.dish}` : `今日定案：${next.today.final.dish}`);
    sound.bell(784);
  } else if (b.pick && b.pick !== a.pick) {
    toast(`${partner.name} 定了 ${b.pick}`);
  } else if (b.draw && b.draw !== a.draw) {
    toast(`${partner.name} 开了一包`);
  }
}

function apply(next: TableState, fromMe = false) {
  const prev = state;
  state = next;
  if (prev && !fromMe) announce(prev, next);
  renderChrome();
}

async function useStore(next: Store) {
  store?.close();
  const s = await next.load();
  store = next;
  state = undefined;
  apply(s, true);
  store.subscribe(s2 => apply(s2));
}

function renderChrome() {
  const s = cur();
  const settled = s.today.final?.dish ?? null;
  const mine = myChoice();
  let label = `今日食签 · ${dayLabel(s.today.day)} · 第${dayOfYear(s.today.day)}期`;
  if (settled) label += ` · 定案 ${settled}`;
  else if (mine) label += ` · 已选 ${mine}`;
  $('#today').textContent = label;

  const partner = partnerOf(s);
  const mate = $('#mateBtn');
  if (s.mode === 'local') mate.innerHTML = '<span class="mate"><span class="dot"></span>同桌</span>';
  else if (!partner) mate.innerHTML = '<span class="mate"><span class="dot wait"></span>等 TA 入座</span>';
  else mate.innerHTML = `<span class="mate"><span class="dot on"></span>与 ${partner.name.replace(/[<>&]/g, '')}</span>`;
  mate.title = s.mode === 'room' ? verdict(s).text : '邀请 TA 一起抽';

  $('#poolN').textContent = String(allDishes(s.pool).filter(d => !s.pool.off.includes(d.name)).length);
  if (phase === 'results') {
    results.markChosen(mine, false);
    renderTable(tableEl, s, tableHandlers);
  }
  if (phase === 'pack') setHud();
  if (poolSheet.isOpen) poolSheet.render(s);
  if (historySheet.isOpen) historySheet.render(s);
  if (roomSheet.isOpen && s.mode === 'room') roomSheet.render(s);
}

/* ---------------- flow ---------------- */

function setHint(markup: string) { $('#hint').innerHTML = markup; }

function setHud() {
  const btns = $('#hudBtns');
  const lots = $('#lots');
  btns.innerHTML = '';
  const button = (text: string, cls: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = text;
    b.addEventListener('click', fn);
    btns.append(b);
  };
  if (phase === 'pack') {
    setHint('沿金色虚线，<b>向右撕开</b>');
    lots.hidden = true;
    button('直接撕开', 'primary', () => pack.autoTear());
    const last = state && myDraw();
    if (last) button('看今天那包', '', () => { hand = last.cards; showResults(); });
  } else if (phase === 'opening') {
    setHint('启封中');
    lots.hidden = true;
  } else if (phase === 'stack') {
    setHint(stack.currentFlipped ? '再点一下，<b>看下一签</b>' : '点卡片，<b>翻开这一签</b>');
    lots.hidden = false;
    const flags = stack.flippedFlags;
    lots.innerHTML = flags.map((f, i) => `<i class="${f ? 'on' : ''}${i === stack.cur && !f ? ' cur' : ''}">${CN_NUM[i]}</i>`).join('');
    button('全部翻开', '', () => stack.revealAll());
  }
}

async function openPack() {
  phase = 'opening';
  setHud();
  const fly = pack.flyOff();
  let drawn;
  try {
    drawn = await store.draw();
  } catch (err) {
    fly.cancel();
    pack.mend();
    phase = 'pack';
    setHud();
    const msg = (err as Error).message;
    toast(msg);
    if (msg.includes('五道菜')) poolSheet.show(cur());
    return;
  }
  hand = drawn.cards;
  apply(drawn.state, true);
  stack.build(hand, total());
  stackEl.style.transform = 'translateY(14%)';
  await wait(reduceMotion ? 50 : 300);
  await stack.rise(packWrap);
  stackEl.style.transform = '';
  fly.cancel();
  packWrap.hidden = true;
  phase = 'stack';
  setHud();
}

function showResults() {
  phase = 'results';
  stage.hidden = true;
  hud.hidden = true;
  resultsEl.hidden = false;
  stack.clear();
  results.show(hand, total(), myChoice());
  renderTable(tableEl, cur(), tableHandlers);
  if (hand.some(d => d.rarity === 'SSR')) setTimeout(() => toast('抽中上上签，今日宜大吃'), 700);
}

function newPack() {
  phase = 'pack';
  hand = [];
  resultsEl.hidden = true;
  hud.hidden = false;
  stage.hidden = false;
  stack.clear();
  packWrap.getAnimations().forEach(a => a.cancel());
  packWrap.hidden = false;
  const day = cur().today.day;
  pack.build(dayOfYear(day), Number(day.slice(0, 4)));
  setHud();
  pack.el.focus({ preventScroll: true });
}

/* ---------------- wiring ---------------- */

$('#againBtn').addEventListener('click', newPack);
$('#randBtn').addEventListener('click', () => {
  const d = results.randomPick();
  if (d) void choose(d.name);
});
$('#poolBtn').addEventListener('click', () => poolSheet.show(cur()));
$('#historyBtn').addEventListener('click', () => historySheet.show(cur()));
$('#mateBtn').addEventListener('click', () => roomSheet.show(cur()));
const soundBtn = $('#soundBtn');
const paintSound = () => {
  soundBtn.textContent = sound.on ? '声 开' : '声 关';
  soundBtn.setAttribute('aria-pressed', String(sound.on));
};
soundBtn.addEventListener('click', () => {
  sound.setOn(!sound.on);
  paintSound();
  if (sound.on) sound.bell(880, 0, 0.05);
});

async function boot() {
  installGrain();
  paintSound();
  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');
  if (joinCode) history.replaceState(null, '', location.pathname);

  const token = storage.get<string | null>(SESSION_KEY, null);
  if (token) {
    try {
      await useStore(new RemoteStore(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        storage.remove(SESSION_KEY);
        toast('这台设备已不在饭桌上，回到单人模式');
      } else {
        toast('连不上饭桌，先用单人模式，稍后刷新再试');
      }
      await useStore(new LocalStore());
    }
  } else {
    await useStore(new LocalStore());
  }

  const day = cur().today.day;
  pack.build(dayOfYear(day), Number(day.slice(0, 4)));
  setHud();

  if (joinCode) {
    if (cur().mode === 'local') {
      roomSheet.joinCode = joinCode.toUpperCase().slice(0, 6);
      roomSheet.show(cur());
    } else {
      toast('你已经在一张饭桌上了');
    }
  }
}

void boot();
