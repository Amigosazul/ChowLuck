import type { Dish } from '../../shared/types.ts';
import { sound } from './audio.ts';
import { attachTilt, makeCard } from './card.ts';
import { reduceMotion, vibrate, wait } from './dom.ts';
import { goldDust, sweep } from './fx.ts';

interface Slot { dish: Dish; el: HTMLElement; flipped: boolean }

/** The five face-down lots, revealed one at a time. */
export class Stack {
  private el: HTMLElement;
  private halo: HTMLElement;
  private onChange: () => void;
  private onDone: () => void;
  private slots: Slot[] = [];
  private busy = false;
  cur = 0;

  constructor(el: HTMLElement, halo: HTMLElement, hooks: { onChange: () => void; onDone: () => void }) {
    this.el = el;
    this.halo = halo;
    this.onChange = hooks.onChange;
    this.onDone = hooks.onDone;
  }

  get currentFlipped() { return this.slots[this.cur]?.flipped ?? false; }
  get flippedFlags() { return this.slots.map(s => s.flipped); }

  build(cards: Dish[], total: number) {
    this.clear();
    this.slots = cards.map((dish, i) => {
      const el = makeCard(dish, total);
      el.style.zIndex = String(10 - i);
      const rot = i === 0 ? 0 : (i % 2 ? 1 : -1) * (0.6 + i * 0.5);
      el.style.transform = `translate(${i * 0.2}em, ${i * 0.28}em) rotate(${rot}deg)`;
      attachTilt(el);
      el.addEventListener('click', () => void this.tap(i));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this.tap(i); }
      });
      this.el.append(el);
      return { dish, el, flipped: false };
    });
    this.cur = 0;
  }

  clear() {
    this.el.innerHTML = '';
    this.el.getAnimations().forEach(a => a.cancel());
    this.el.style.zIndex = '1';
    this.el.classList.remove('ready');
    this.halo.classList.remove('on', 'ssr');
    this.slots = [];
    this.busy = false;
  }

  /** Pull the stack up out of the pouch, then settle it in front. */
  async rise(packWrap: HTMLElement) {
    const fast = reduceMotion;
    sound.slide();
    await this.el.animate([{ transform: 'translateY(14%)' }, { transform: 'translateY(-34%)' }],
      { duration: fast ? 150 : 800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;
    this.el.style.zIndex = '3';
    packWrap.animate([{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: 'translateY(60%) rotate(4deg)', opacity: 0 }],
      { duration: fast ? 150 : 560, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    await this.el.animate([{ transform: 'translateY(-34%)' }, { transform: 'translateY(0)' }],
      { duration: fast ? 150 : 620, easing: 'cubic-bezier(.3,1.25,.5,1)', fill: 'forwards' }).finished;
    this.el.classList.add('ready');
    this.markTop();
  }

  private markTop() {
    this.slots.forEach((s, i) => {
      const top = i === this.cur;
      s.el.classList.toggle('top', top);
      if (top) {
        s.el.tabIndex = 0;
        s.el.setAttribute('role', 'button');
        s.el.setAttribute('aria-label', s.flipped ? `${s.dish.name}，点击看下一签` : '翻开这一签');
        s.el.style.transform = 'none';
      } else {
        s.el.removeAttribute('tabindex');
        s.el.removeAttribute('role');
      }
    });
    const top = this.slots[this.cur]?.el;
    if (top && document.activeElement?.closest('.stack')) top.focus({ preventScroll: true });
  }

  private async flip(s: Slot) {
    const rare = s.dish.rarity === 'SR' || s.dish.rarity === 'SSR';
    if (rare && !reduceMotion) {
      s.el.classList.add('charge');
      sound.charge();
      vibrate(30);
      await wait(s.dish.rarity === 'SSR' ? 1000 : 700);
      s.el.classList.remove('charge');
    }
    s.el.classList.add('flipped');
    s.flipped = true;
    sound.flip();
    if (rare) {
      this.halo.classList.add('on');
      this.halo.classList.toggle('ssr', s.dish.rarity === 'SSR');
    }
    if (s.dish.rarity !== 'N') {
      setTimeout(() => {
        sweep(s.el);
        goldDust(s.el, s.dish.rarity);
        sound.reveal(s.dish.rarity);
        vibrate(s.dish.rarity === 'SSR' ? [30, 50, 60] : 15);
      }, reduceMotion ? 0 : 380);
    }
  }

  private async tap(i: number) {
    if (this.busy || i !== this.cur) return;
    const s = this.slots[i];
    if (!s) return;
    this.busy = true;
    if (!s.flipped) {
      await this.flip(s);
      this.onChange();
      await wait(reduceMotion ? 50 : 500);
      this.busy = false;
      this.markTop();
      return;
    }
    sound.slide();
    this.halo.classList.remove('on', 'ssr');
    const dir = i % 2 ? 1 : -1;
    await s.el.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dir * 130}%, -6%) rotate(${dir * 14}deg)`, opacity: 0 }
    ], { duration: reduceMotion ? 120 : 420, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' }).finished;
    s.el.hidden = true;
    this.cur++;
    this.busy = false;
    if (this.cur >= this.slots.length) {
      this.onDone();
      return;
    }
    this.markTop();
    this.onChange();
  }

  revealAll() {
    if (this.busy) return;
    this.slots.forEach(s => { s.flipped = true; });
    this.onDone();
  }
}
