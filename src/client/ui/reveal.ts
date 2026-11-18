import { allDishes } from '../../shared/draw.ts';
import type { Dish, TableState } from '../../shared/types.ts';
import { sound } from './audio.ts';
import { makeCard, makeStamp } from './card.ts';
import { $, esc, reduceMotion, vibrate, wait } from './dom.ts';
import { goldDust, sweep } from './fx.ts';
import { partnerOf } from './table.ts';

export type RevealMode = 'pair' | 'toss' | 'replay';

interface Side { el: HTMLElement; card: HTMLElement; dish: Dish }

/**
 * The moment both blind picks are opened together: two face-down lots flip at once.
 * Same dish → 心有灵犀. Different → toss (decided by the server), adopt theirs, or leave it.
 */
export class Reveal {
  private root = $('#reveal');
  private title = $('#rvTitle');
  private sub = $('#rvSub');
  private pairEl = $('#rvPair');
  private actions = $('#rvActions');
  private sides: Side[] = [];
  private busy = false;
  private hooks: { toss(): Promise<void>; adopt(dish: string): void };

  constructor(hooks: { toss(): Promise<void>; adopt(dish: string): void }) {
    this.hooks = hooks;
    this.root.addEventListener('click', e => { if (e.target === this.root && !this.busy) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !this.busy) this.close(); });
  }

  get isOpen() { return !this.root.hidden; }

  close() { this.root.hidden = true; }

  /**
   * Opens (or re-targets, when already open) the reveal for today's two picks.
   * `flipFirst` starts with both lots face down, for a device that hasn't seen them opened yet.
   */
  async open(s: TableState, mode: RevealMode, flipFirst = mode === 'pair') {
    const partner = partnerOf(s);
    const mine = s.today.choices.find(c => c.memberId === s.me.id);
    const theirs = partner && s.today.choices.find(c => c.memberId === partner.id);
    if (!partner || !mine || !theirs || theirs.sealed) return;
    const all = allDishes(s.pool);
    const find = (name: string): Dish => all.find(d => d.name === name)
      ?? { name, ch: Array.from(name)[0], cat: '饭', rarity: 'N', price: 0, min: 0, kcal: 0, line: '' };

    // a toss result arriving while the pair is already on screen just plays the toss
    if (mode === 'toss' && !flipFirst && this.isOpen && this.sides.length === 2 && !this.busy) {
      await this.playToss(s.today.final!.dish);
      return;
    }

    this.busy = true;
    this.actions.innerHTML = '';
    this.pairEl.classList.remove('tossing');
    const faceUp = !flipFirst;
    this.sides = [
      { label: '你', dish: find(mine.dish) },
      { label: partner.name, dish: find(theirs.dish) }
    ].map(({ label, dish }) => {
      const el = document.createElement('div');
      el.className = 'rv-side';
      const wrap = document.createElement('div');
      wrap.className = 'rv-card';
      const card = makeCard(dish, all.length);
      card.classList.add('static');
      if (faceUp) card.classList.add('flipped');
      wrap.append(card);
      el.append(wrap);
      el.insertAdjacentHTML('beforeend', `<span class="rv-name">${esc(label)}</span>`);
      return { el, card, dish };
    });
    this.pairEl.replaceChildren(...this.sides.map(x => x.el));
    this.title.textContent = faceUp ? '今日两签' : '暗签揭晓';
    this.sub.textContent = faceUp ? '' : '两人都已定签';
    this.root.hidden = false;

    if (!faceUp) {
      await wait(reduceMotion ? 100 : 900);
      sound.charge();
      await wait(reduceMotion ? 0 : 500);
      this.sides.forEach(x => { x.card.classList.remove('static'); x.card.classList.add('flipped'); });
      sound.flip();
      await wait(reduceMotion ? 50 : 700);
    }

    const [a, b] = this.sides;
    const final = s.today.final;
    if (mode === 'toss' && final?.by === 'toss') {
      this.busy = false;
      await this.playToss(final.dish);
      return;
    }
    if (a.dish.name === b.dish.name) {
      this.title.innerHTML = '心有灵犀';
      this.sub.innerHTML = `你们都选了 <b>${esc(a.dish.name)}</b>`;
      if (!faceUp || mode === 'replay') {
        this.sides.forEach(x => { sweep(x.card); goldDust(x.card, 'SSR'); });
        sound.reveal('SSR');
        vibrate([30, 50, 60]);
      }
      this.sides.forEach(x => x.el.querySelector('.rv-card')!.append(makeStamp()));
      this.setActions([{ text: '就吃这个', primary: true, fn: () => this.close() }]);
    } else if (final) {
      this.markWinner(final.dish);
      this.title.textContent = final.by === 'toss' ? '签落' : '今日定案';
      this.sub.innerHTML = `今天吃 <b>${esc(final.dish)}</b>`;
      this.setActions([{ text: '好', primary: true, fn: () => this.close() }]);
    } else {
      this.title.textContent = '两签不同';
      this.sub.innerHTML = `你选了 <b>${esc(a.dish.name)}</b>，${esc(partner.name)} 选了 <b>${esc(b.dish.name)}</b>`;
      this.setActions([
        { text: '掷签决定', primary: true, fn: async () => {
          this.actions.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
          await this.hooks.toss();
        } },
        { text: `改选 ${partner.name} 的`, fn: () => { this.hooks.adopt(b.dish.name); } },
        { text: '先这样', fn: () => this.close() }
      ]);
    }
    this.busy = false;
  }

  private setActions(list: { text: string; primary?: boolean; fn: () => void | Promise<void> }[]) {
    this.actions.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.primary ? ' primary' : ''}`;
      b.textContent = a.text;
      b.addEventListener('click', () => void a.fn());
      this.actions.append(b);
    }
    (this.actions.querySelector('.btn.primary') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private markWinner(dish: string) {
    this.sides.forEach(x => {
      x.el.querySelector('.stamp')?.remove();
      const win = x.dish.name === dish;
      x.el.classList.toggle('win', win);
      if (win) x.el.querySelector('.rv-card')!.append(makeStamp());
    });
    this.pairEl.classList.add('decided');
  }

  /** The light hops between the two lots, slows down, and lands on the server's pick. */
  private async playToss(dish: string) {
    if (this.sides.length !== 2) return;
    this.busy = true;
    this.actions.innerHTML = '';
    this.title.textContent = '掷签中';
    this.sub.textContent = '';
    this.pairEl.classList.remove('decided');
    this.pairEl.classList.add('tossing');
    const target = Math.max(0, this.sides.findIndex(x => x.dish.name === dish));
    // the light alternates 0,1,0,1…; an odd count ends on side 0, an even count on side 1
    const hops = reduceMotion ? 1 : 11 + target;
    let lit = 0;
    for (let i = 0; i < hops; i++) {
      lit = i % 2;
      this.sides.forEach((x, j) => x.el.classList.toggle('lit', j === lit));
      sound.bell(i % 2 ? 660 : 880, 0, 0.025);
      await wait(reduceMotion ? 0 : 70 + i * i * 4);
    }
    if (lit !== target) {
      this.sides.forEach((x, j) => x.el.classList.toggle('lit', j === target));
      await wait(reduceMotion ? 0 : 520);
    }
    this.pairEl.classList.remove('tossing');
    this.sides.forEach(x => x.el.classList.remove('lit'));
    this.markWinner(dish);
    const win = this.sides[target];
    if (!reduceMotion) {
      win.el.querySelector('.stamp')?.animate([
        { transform: 'scale(2.4) rotate(-20deg)', opacity: 0 },
        { transform: 'scale(.92) rotate(-9deg)', opacity: 1, offset: .7 },
        { transform: 'scale(1) rotate(-9deg)', opacity: 1 }
      ], { duration: 420, easing: 'cubic-bezier(.5,0,.7,1)' });
      setTimeout(() => goldDust(win.card, 'SR'), 300);
    }
    setTimeout(() => { sound.stamp(); vibrate(35); }, reduceMotion ? 0 : 290);
    this.title.textContent = '签落';
    this.sub.innerHTML = `今天吃 <b>${esc(dish)}</b>`;
    this.setActions([{ text: '好', primary: true, fn: () => this.close() }]);
    this.busy = false;
  }
}
