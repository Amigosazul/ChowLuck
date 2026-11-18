import type { Rarity } from '../../shared/types.ts';
import { reduceMotion } from './dom.ts';

export function sweep(card: HTMLElement) {
  const s = card.querySelector<HTMLElement>('.sweep');
  if (!s || reduceMotion) return;
  s.animate(
    [{ opacity: 1, backgroundPosition: '150% 0' }, { opacity: 1, backgroundPosition: '-50% 0' }],
    { duration: 1100, easing: 'cubic-bezier(.4,0,.2,1)' }
  );
}

/** A thin ring and slow-rising gold dust; denser for rarer lots. */
export function goldDust(card: HTMLElement, rarity: Rarity) {
  if (reduceMotion || rarity === 'N') return;
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const count = rarity === 'SSR' ? 60 : rarity === 'SR' ? 30 : 10;
  const colors = rarity === 'R' ? ['#ffffff', '#dfe6ec'] : ['#fff1c2', '#f6dc97', '#d9b46a', '#ffffff'];

  const ring = document.createElement('div');
  ring.className = 'fx-ring';
  const size = r.width * 0.7;
  Object.assign(ring.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
  ring.style.setProperty('--c', rarity === 'R' ? 'rgba(220,230,240,.5)' : 'rgba(246,220,151,.55)');
  document.body.append(ring);
  ring.animate([{ transform: 'scale(.5)', opacity: .9 }, { transform: 'scale(2.4)', opacity: 0 }],
    { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => ring.remove();

  if (rarity === 'SSR') {
    const veil = document.createElement('div');
    veil.className = 'fx-veil';
    document.body.append(veil);
    veil.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }],
      { duration: 1600, easing: 'ease-out' }).onfinish = () => veil.remove();
  }

  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'fx-p';
    const s = 1.5 + Math.random() * 3;
    const color = colors[i % colors.length];
    Object.assign(p.style, {
      left: `${cx + (Math.random() - 0.5) * r.width * 1.1}px`,
      top: `${cy + (Math.random() - 0.3) * r.height * 0.8}px`,
      width: `${s}px`, height: `${s}px`, background: color, boxShadow: `0 0 ${4 + s * 2}px ${color}`
    });
    document.body.append(p);
    const rise = 80 + Math.random() * 200;
    const drift = (Math.random() - 0.5) * 70;
    p.animate([
      { transform: 'translate(0,0)', opacity: 0 },
      { transform: `translate(${drift * 0.3}px, ${-rise * 0.2}px)`, opacity: 1, offset: .15 },
      { transform: `translate(${drift}px, ${-rise}px)`, opacity: 0 }
    ], { duration: 1400 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' })
      .onfinish = () => p.remove();
  }
}
