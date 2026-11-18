import { CATS, RARITY_LABEL } from '../../shared/dishes.ts';
import type { Dish } from '../../shared/types.ts';
import { esc, html } from './dom.ts';

export function priceText(d: Dish) {
  return d.price === 0 ? '免单' : `¥${d.price}`;
}

export function makeCard(d: Dish, total: number): HTMLElement {
  const price = d.price === 0 ? '免单' : `${d.price}<small>元</small>`;
  const kcal = d.kcal ? `${d.kcal}<small>千卡</small>` : '随意';
  const glyph = d.ch || Array.from(d.name)[0];
  return html(`
  <div class="card r-${d.rarity}">
    <div class="tilt"><div class="inner">
      <div class="face back" aria-hidden="true">
        <i class="lat"></i>
        <span class="back-t">CHOWLUCK</span>
        <div class="emblem"><b>飯</b></div>
        <span class="back-b">今日食签</span>
      </div>
      <div class="face front">
        <div class="paper">
          <div class="f-top"><span>${esc(CATS[d.cat] ?? '米饭')} · 一人份</span><b>${RARITY_LABEL[d.rarity]}<small>${d.rarity}</small></b></div>
          <div class="f-glyph"><b>${esc(glyph)}</b><span class="f-seal">飯運食簽</span></div>
          <div class="f-name"><span>${esc(d.name)}</span></div>
          <p class="f-line">${esc(d.line)}</p>
          <div class="f-stats">
            <div><span>人均</span><b>${price}</b></div>
            <div><span>候时</span><b>${d.min}<small>分</small></b></div>
            <div><span>热量</span><b>${kcal}</b></div>
          </div>
          <div class="f-foot"><span>No.${String(d.no ?? 0).padStart(3, '0')} / ${String(total).padStart(3, '0')}</span><span>CHOWLUCK</span></div>
        </div>
        <i class="holo"></i><i class="glare"></i><i class="sweep"></i>
      </div>
    </div></div>
  </div>`);
}

/** Tilts the card toward the pointer and moves the foil highlight with it. */
export function attachTilt(card: HTMLElement, strength = 1) {
  const move = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    card.classList.add('live');
    card.style.setProperty('--rx', `${((0.5 - y) * 16 * strength).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((x - 0.5) * 20 * strength).toFixed(2)}deg`);
    card.style.setProperty('--mx', (x * 100).toFixed(1));
    card.style.setProperty('--my', (y * 100).toFixed(1));
  };
  const leave = () => {
    card.classList.remove('live');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    card.style.removeProperty('--mx');
    card.style.removeProperty('--my');
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  card.addEventListener('pointercancel', leave);
  card.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') leave(); });
}

export function makeStamp(): HTMLElement {
  return html('<span class="stamp" aria-hidden="true">定</span>');
}
