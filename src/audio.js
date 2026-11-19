/**
 * Procedural Web Audio synthesizer for Red Eclipse 2 browser play.
 * Zero external sound asset downloads required.
 */

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  tone(freq, endFreq, duration, type = 'sawtooth', gain = 0.14) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  noise(duration, gain = 0.12, highpass = 300) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  }

  playWeapon(id, secondary = false) {
    this.unlock();
    switch (id) {
      case 'pistol':
        this.tone(420, 110, 0.09, 'triangle', 0.14);
        this.noise(0.05, 0.08, 1200);
        break;
      case 'sword':
        this.noise(secondary ? 0.18 : 0.11, 0.12, 900);
        this.tone(secondary ? 640 : 480, 180, 0.14, 'sine', 0.12);
        break;
      case 'shotgun':
        this.noise(0.2, 0.22, 220);
        this.tone(180, 48, 0.18, 'sawtooth', 0.18);
        break;
      case 'smg':
        this.tone(360, 120, 0.05, 'square', 0.08);
        this.noise(0.04, 0.07, 1500);
        break;
      case 'flamer':
        this.noise(secondary ? 0.18 : 0.08, 0.1, secondary ? 500 : 800);
        break;
      case 'plasma':
        this.tone(secondary ? 540 : 720, 210, secondary ? 0.22 : 0.11, 'sine', 0.13);
        break;
      case 'zapper':
        this.tone(920, 380, 0.09, 'sawtooth', 0.1);
        this.noise(0.07, 0.06, 2400);
        break;
      case 'rifle':
        this.tone(1100, 140, 0.26, 'sawtooth', 0.16);
        this.noise(0.14, 0.12, 1100);
        break;
      case 'grenade':
        this.tone(240, 95, 0.12, 'triangle', 0.12);
        break;
      case 'rocket':
        this.tone(160, 52, 0.26, 'sawtooth', 0.16);
        this.noise(0.2, 0.12, 300);
        break;
      default:
        this.tone(400, 120, 0.08, 'triangle', 0.1);
    }
  }

  playExplosion() {
    this.unlock();
    this.noise(0.36, 0.26, 80);
    this.tone(110, 28, 0.34, 'sawtooth', 0.2);
  }

  playParkour(type) {
    this.unlock();
    if (type === 'dash') {
      this.noise(0.14, 0.11, 700);
      this.tone(260, 620, 0.14, 'sine', 0.11);
    } else if (type === 'wallkick') {
      this.tone(320, 680, 0.11, 'triangle', 0.12);
    } else if (type === 'jumppad') {
      this.tone(220, 880, 0.24, 'sine', 0.14);
    } else if (type === 'doublejump') {
      this.tone(260, 480, 0.09, 'sine', 0.09);
    } else if (type === 'jump') {
      this.tone(180, 310, 0.07, 'sine', 0.07);
    }
  }

  playHitmarker(headshot = false) {
    this.unlock();
    this.tone(headshot ? 1480 : 1020, headshot ? 1100 : 760, 0.06, 'sine', 0.13);
  }

  playKill() {
    this.unlock();
    this.tone(660, 990, 0.12, 'triangle', 0.14);
    setTimeout(() => this.tone(990, 1320, 0.15, 'triangle', 0.14), 70);
  }

  playPickup() {
    this.unlock();
    this.tone(520, 880, 0.12, 'sine', 0.11);
  }

  playDamage() {
    this.unlock();
    this.tone(130, 55, 0.14, 'sawtooth', 0.14);
  }
}
