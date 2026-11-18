import { RARITIES, RARITY_LABEL } from '../../shared/dishes.ts';
import type { Dish } from '../../shared/types.ts';
import { sound } from './audio.ts';
import { attachTilt, makeCard, makeStamp, priceText } from './card.ts';
import { $, esc, reduceMotion, vibrate } from './dom.ts';

/** The five revealed lots dealt into a fan, plus the zoomed single-card view. */
export class Results {
  private fan = $('#fan');
  private title = $('#resTitle');
  private eyebrow = $('#resEyebrow');
  private zoom = $('#zoom');
  private zoomStage = $('#zoomStage');
  private pickBtn = $<HTMLButtonElement>('#pickBtn');
  private cards: Dish[] = [];
  private items: HTMLElement[] = [];
  private total = 0;
  private chosen: string | null = null;
  private zoomIdx = -1;
  private onPick: (dish: Dish) => void;

  constructor(hooks: { onPick: (dish: Dish) => void }) {
    this.onPick = hooks.onPick;
    this.pickBtn.addEventListener('click', () => {
      const d = this.cards[this.zoomIdx];
      this.closeZoom();
      if (d) this.onPick(d);
    });
    $('#zoomClose').addEventListener('click', () => this.closeZoom());
    this.zoom.addEventListener('click', e => {
      if (e.target === this.zoom || e.target === this.zoomStage) this.closeZoom();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.zoom.hidden) this.closeZoom();
    });
  }

  get hand() { return this.cards; }

  show(cards: Dish[], total: number, chosen: string | null) {
    this.cards = cards;
    this.total = total;
    this.chosen = null;
    const best = cards.reduce((a, b) => RARITIES.indexOf(b.rarity) > RARITIES.indexOf(a.rarity) ? b : a);
    this.eyebrow.textContent = `五签已出 · 最佳 ${RARITY_LABEL[best.rarity]}`;
    this.title.textContent = '今天吃哪一签';
    this.fan.innerHTML = '';
    this.items = cards.map((d, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'fan-item';
      item.style.setProperty('--i', String(i));
      item.style.setProperty('--rot', `${(i - 2) * 5}deg`);
      item.style.setProperty('--dy', `${Math.abs(i - 2) * 14}px`);
      item.setAttribute('aria-label', `${d.name}，${RARITY_LABEL[d.rarity]}，人均 ${d.price} 元，点击放大`);
      const pose = document.createElement('span');
      pose.className = 'fan-pose';
      const card = makeCard(d, total);
      card.classList.add('flipped', 'static');
      attachTilt(card, 0.7);
      pose.append(card);
      pose.insertAdjacentHTML('beforeend',
        `<span class="fan-cap"><b>${esc(d.name)}</b><span>${RARITY_LABEL[d.rarity]} · ${priceText(d)}<span class="opt"> · ${d.min}分钟</span></span></span>`);
      item.append(pose);
      item.addEventListener('click', () => this.openZoom(i));
      this.fan.append(item);
      return item;
    });
    if (chosen) this.markChosen(chosen, false);
  }

  /** Stamps 定 on the chosen lot. Lots not in this hand just update the title. */
  markChosen(name: string | null, animate: boolean) {
    if (name === this.chosen) return;
    this.chosen = name;
    this.items.forEach((item, i) => {
      item.querySelector('.stamp')?.remove();
      item.classList.toggle('chosen', this.cards[i].name === name);
    });
    if (!name) {
      this.title.textContent = '今天吃哪一签';
      return;
    }
    this.title.innerHTML = `今日就吃 <span class="gold-text">${esc(name)}</span>`;
    const idx = this.cards.findIndex(c => c.name === name);
    if (idx < 0) return;
    const stamp = makeStamp();
    this.items[idx].querySelector('.fan-pose')!.append(stamp);
    if (animate && !reduceMotion) {
      stamp.animate([
        { transform: 'scale(2.4) rotate(-20deg)', opacity: 0 },
        { transform: 'scale(.92) rotate(-9deg)', opacity: 1, offset: .7 },
        { transform: 'scale(1) rotate(-9deg)', opacity: 1 }
      ], { duration: 420, easing: 'cubic-bezier(.5,0,.7,1)' });
    }
    if (animate) setTimeout(() => { sound.stamp(); vibrate(35); }, reduceMotion ? 0 : 290);
  }

  randomPick(): Dish | undefined {
    const pool = this.cards.filter(c => c.name !== this.chosen);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private openZoom(i: number) {
    this.zoomIdx = i;
    const d = this.cards[i];
    this.zoomStage.innerHTML = '';
    const card = makeCard(d, this.total);
    card.classList.add('flipped', 'static');
    attachTilt(card, 1.1);
    this.zoomStage.append(card);
    if (this.chosen === d.name) this.zoomStage.append(makeStamp());
    this.pickBtn.textContent = this.chosen === d.name ? '已定下' : '定下这一签';
    this.zoom.hidden = false;
    this.pickBtn.focus({ preventScroll: true });
  }

  private closeZoom() {
    this.zoom.hidden = true;
    this.items[this.zoomIdx]?.focus({ preventScroll: true });
  }
}
