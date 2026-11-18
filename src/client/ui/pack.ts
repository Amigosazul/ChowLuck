import { sound } from './audio.ts';
import { reduceMotion, vibrate } from './dom.ts';

const TEAR_Y = 15; // % from the top where the seam runs

const COLORWAYS = [
  { name: '墨金', pa: '#241c17', pb: '#090605' },
  { name: '朱砂', pa: '#7c1c13', pb: '#2e0805' },
  { name: '黛青', pa: '#1d3a39', pb: '#071615' }
];

const BOWL_SVG = `<svg viewBox="0 0 120 70" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
  <path d="M44 4c-4 6 4 9 0 15M60 2c-4 7 4 10 0 17M76 4c-4 6 4 9 0 15" opacity=".7"/>
  <path d="M86 6 L112 30M92 4 L116 27"/>
  <path d="M10 30h100"/>
  <path d="M14 30c3 20 22 30 46 30s43-10 46-30"/>
  <path d="M44 61l2 7h28l2-7"/>
  <path d="M30 42c8 6 20 8 30 8" opacity=".5"/>
</svg>`;

const CN_DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function artHTML(cw: typeof COLORWAYS[number], issue: number, year: number) {
  const cnYear = String(year).split('').map(n => CN_DIGIT[+n]).join('');
  return `<div class="pk-art" style="--pa:${cw.pa};--pb:${cw.pb}">
    <div class="pk-weave"></div>
    <div class="crimp crimp-t"></div>
    <div class="pk-strip"><span>No.${String(issue).padStart(3, '0')}</span><b>CHOWLUCK</b><span>${cw.name}</span></div>
    <div class="pk-notch"></div>
    <div class="pk-frame"><i></i><i></i><i></i><i></i></div>
    <div class="pk-side l">今日食签 · 伍枚</div>
    <div class="pk-side r">择一而食 · ${cnYear}</div>
    <div class="pk-title foil-text">飯運</div>
    <div class="pk-stamp">上上</div>
    <div class="pk-bowl">${BOWL_SVG}</div>
    <div class="pk-foot">内含食签五枚 · 必有中签以上<span>SERIES I · ${year}</span></div>
    <div class="crimp crimp-b"></div>
    <div class="pk-sheen"></div>
  </div>`;
}

type Point = [number, number];
const pt = ([x, y]: Point) => `${x}% ${y}%`;

/**
 * The foil pouch. Its artwork is rendered three times: the body below the seam,
 * the torn-off part of the strip (which peels up as you drag) and the rest of the strip.
 */
export class Pack {
  el!: HTMLElement;
  private wrap: HTMLElement;
  private onTorn: () => void;
  private onTap: () => void;
  private torn!: HTMLElement;
  private rest!: HTMLElement;
  private guide!: HTMLElement;
  private zig: Point[] = [];
  private progress = 0;
  private lastGrain = 0;
  private active = false;

  constructor(wrap: HTMLElement, hooks: { onTorn: () => void; onTap: () => void }) {
    this.wrap = wrap;
    this.onTorn = hooks.onTorn;
    this.onTap = hooks.onTap;
  }

  build(issue: number, year: number) {
    this.zig = [];
    for (let x = 0; x <= 100.001; x += 2.5) {
      const edge = x < 1 || x > 99;
      this.zig.push([+x.toFixed(2), +(TEAR_Y + (edge ? 0 : (Math.random() * 2 - 1) * 0.75)).toFixed(2)]);
    }
    const cw = COLORWAYS[Math.floor(Math.random() * COLORWAYS.length)];
    const art = artHTML(cw, issue, year);
    this.wrap.innerHTML = `<div class="pack-float"><div class="pack" tabindex="0" role="button" aria-label="卡包：向右拖动撕开，或按回车键直接撕开">
      <div class="pk-layer pk-body"><div class="pk-clip">${art}</div></div>
      <div class="pk-layer pk-rest"><div class="pk-clip">${art}</div></div>
      <div class="pk-layer pk-torn"><div class="pk-clip">${art}</div></div>
      <div class="tear-guide"><span class="tg-line"></span><span class="tg-spark"></span><span class="tg-hint">自此撕开 · TEAR</span></div>
    </div></div>`;
    this.el = this.wrap.querySelector('.pack')!;
    this.torn = this.el.querySelector('.pk-torn')!;
    this.rest = this.el.querySelector('.pk-rest')!;
    this.guide = this.el.querySelector('.tear-guide')!;
    (this.el.querySelector('.pk-body .pk-clip') as HTMLElement).style.clipPath =
      `polygon(${this.zig.map(pt).join(',')},100% 100%,0% 100%)`;
    this.progress = 0;
    this.lastGrain = 0;
    this.active = true;
    this.render();
    this.bind();
  }

  /** Puts the strip back, e.g. when the draw failed. */
  mend() {
    this.progress = 0;
    this.lastGrain = 0;
    this.active = true;
    this.rest.style.visibility = '';
    this.render();
  }

  private yAt(p: number) {
    const x = p * 100;
    for (let i = 1; i < this.zig.length; i++) {
      if (this.zig[i][0] >= x) {
        const [x0, y0] = this.zig[i - 1];
        const [x1, y1] = this.zig[i];
        return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) || 1);
      }
    }
    return this.zig[this.zig.length - 1][1];
  }

  private render() {
    const p = this.progress;
    const x = p * 100;
    const tornPts: Point[] = [[0, 0], [x, 0], [x, this.yAt(p)]];
    const restPts: Point[] = [[x, 0], [100, 0]];
    for (let i = this.zig.length - 1; i >= 0; i--) {
      if (this.zig[i][0] < x) tornPts.push(this.zig[i]);
      if (this.zig[i][0] > x) restPts.push(this.zig[i]);
    }
    restPts.push([x, this.yAt(p)]);
    (this.torn.firstElementChild as HTMLElement).style.clipPath = `polygon(${tornPts.map(pt).join(',')})`;
    (this.rest.firstElementChild as HTMLElement).style.clipPath = `polygon(${restPts.map(pt).join(',')})`;
    this.torn.style.transformOrigin = `${x}% ${this.yAt(p)}%`;
    this.torn.style.transform = p > 0 ? `translate(${-p * 3}%, ${-p * 3.5}%) rotate(${-(2 + p * 11)}deg)` : 'none';
    this.guide.style.opacity = p > 0.04 ? '0' : '1';
  }

  private setTear(p: number) {
    if (!this.active) return;
    p = Math.min(1, Math.max(this.progress, p));
    if (p - this.lastGrain > 0.035) {
      sound.grain();
      vibrate(4);
      this.lastGrain = p;
    }
    this.progress = p;
    this.render();
    if (p >= 1) {
      this.active = false;
      this.onTorn();
    }
  }

  autoTear() {
    if (!this.active) return;
    sound.init();
    const from = this.progress;
    const t0 = performance.now();
    const dur = reduceMotion ? 200 : 700;
    const step = (t: number) => {
      if (!this.active) return;
      const k = Math.min(1, (t - t0) / dur);
      this.setTear(from + (1 - from) * (1 - (1 - k) ** 2));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Strip flies off; returns the animation so the caller can clean it up. */
  flyOff(): Animation {
    sound.rip();
    vibrate(25);
    this.rest.style.visibility = 'hidden';
    return this.torn.animate([
      { transform: this.torn.style.transform, opacity: 1 },
      { transform: 'translate(-38%, -130%) rotate(-42deg)', opacity: 0 }
    ], { duration: reduceMotion ? 200 : 850, easing: 'cubic-bezier(.3,.05,.6,1)', fill: 'forwards' });
  }

  private bind() {
    const el = this.el;
    let dragging = false;
    let startX = 0;
    let startP = 0;
    let moved = false;
    el.addEventListener('pointerdown', e => {
      if (!this.active) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startP = this.progress;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
      sound.init();
    });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      if (!dragging) {
        if (e.pointerType !== 'mouse') return;
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--prx', `${((0.5 - y) * 8).toFixed(2)}deg`);
        el.style.setProperty('--pry', `${((x - 0.5) * 12).toFixed(2)}deg`);
        el.style.setProperty('--pmx', (x * 100).toFixed(1));
        return;
      }
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      if (dx > 0) this.setTear(startP + dx / (r.width * 0.8));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (!this.active) return;
      if (!moved) {
        el.classList.remove('nudge');
        void el.offsetWidth;
        el.classList.add('nudge');
        this.onTap();
      } else if (this.progress > 0.7) {
        this.autoTear();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => {
      if (dragging) return;
      el.style.setProperty('--prx', '0deg');
      el.style.setProperty('--pry', '0deg');
      el.style.setProperty('--pmx', '50');
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.autoTear();
      }
    });
  }
}
