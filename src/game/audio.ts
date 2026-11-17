import type { WeaponId } from './types';

export class BattleSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.8;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public playWeaponShot(weaponId: WeaponId, distanceAttenuation: number = 1.0): void {
    if (this.muted || !this.ctx || !this.noiseBuffer || distanceAttenuation <= 0.05) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1, distanceAttenuation);

    // Filtered noise transient
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = weaponId === 'shotgun' ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(
      weaponId === 'shotgun'
        ? 1100
        : weaponId === 'sniper'
          ? 2400
          : weaponId === 'smg'
            ? 2800
            : weaponId === 'plasma'
              ? 3600
              : 1850,
      now
    );

    const nGain = this.ctx.createGain();
    const dur =
      weaponId === 'shotgun'
        ? 0.24
        : weaponId === 'sniper'
          ? 0.3
          : weaponId === 'smg'
            ? 0.08
            : 0.13;
    const peak = (weaponId === 'shotgun' || weaponId === 'sniper' ? 0.26 : 0.16) * vol;
    nGain.gain.setValueAtTime(peak, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + dur);

    // Punchy low/mid body oscillator
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = weaponId === 'plasma' ? 'sine' : 'triangle';
    const startFreq =
      weaponId === 'plasma'
        ? 920
        : weaponId === 'sniper'
          ? 340
          : weaponId === 'shotgun'
            ? 190
            : 260;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(weaponId === 'plasma' ? 240 : 48, now + dur * 0.75);
    oGain.gain.setValueAtTime(peak * 0.85, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.8);

    osc.connect(oGain);
    oGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur * 0.85);
  }

  public playHitmarker(armorHit: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(armorHit ? 1450 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(armorHit ? 2100 : 540, now + 0.065);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playCrateBreak(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.23);
  }

  public playPickup(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.09, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.13);
    });
  }

  public playExplosion(distanceAttenuation: number = 1.0): void {
    if (this.muted || !this.ctx || !this.noiseBuffer || distanceAttenuation <= 0.05) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1, distanceAttenuation);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(85, now + 0.55);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.38 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.65);
  }

  public playDash(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(750, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.17);
  }

  public playCountdown(isGo: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.35 : 0.14));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isGo ? 0.36 : 0.15));
  }

  public playElimination(victory: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = victory ? [523.25, 659.25, 783.99, 1046.5] : [392, 311.13, 220];
    notes.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.11);
      gain.gain.setValueAtTime(0.14, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.32);
    });
  }

  public playAirdropChime(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    [587.33, 880, 1174.66].forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.09);
      gain.gain.setValueAtTime(0.11, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.26);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
