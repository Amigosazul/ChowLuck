import type { Rarity } from '../../shared/types.ts';
import { storage } from './dom.ts';

/** Every sound is synthesised, so there are no audio files to ship. */
class Sound {
  on = storage.get('chowluck.sound', true);
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  setOn(on: boolean) {
    this.on = on;
    storage.set('chowluck.sound', on);
  }

  /** Must be called from a user gesture the first time. */
  init() {
    if (this.ctx || !this.on) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    if (!this.on) return null;
    this.init();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private hiss(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ready();
    if (!c || !this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t, Math.random() * 0.6, dur + 0.03);
  }

  private tone(freq: number, delay: number, dur: number, gain: number, type: OscillatorType = 'sine', toFreq?: number) {
    const c = this.ready();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bell(f: number, delay = 0, gain = 0.06) {
    this.tone(f, delay, 1.6, gain);
    this.tone(f * 2.76, delay, 0.7, gain * 0.25);
    this.tone(f * 5.4, delay, 0.3, gain * 0.1);
  }

  grain() { this.hiss(0.045, 2400 + Math.random() * 2400, 0.9, 0.16); }
  rip() { this.hiss(0.36, 1700, 0.5, 0.38); this.hiss(0.18, 4000, 0.7, 0.15); }
  flip() { this.hiss(0.18, 900, 0.6, 0.14, 'lowpass'); }
  slide() { this.hiss(0.24, 650, 0.5, 0.1, 'lowpass'); }
  charge() { this.tone(196, 0, 0.8, 0.05, 'sine', 392); this.tone(294, 0, 0.8, 0.03, 'sine', 588); }
  stamp() { this.tone(120, 0, 0.22, 0.25, 'sine', 55); this.hiss(0.08, 500, 0.6, 0.2, 'lowpass'); }
  reveal(r: Rarity) {
    if (r === 'N') return;
    if (r === 'R') { this.bell(1046); return; }
    const seq = r === 'SSR' ? [523, 659, 784, 1046, 1318] : [659, 880, 1046];
    seq.forEach((f, i) => this.bell(f, i * 0.11, r === 'SSR' ? 0.07 : 0.06));
  }
}

export const sound = new Sound();
